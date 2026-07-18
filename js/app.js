/**
 * app.js
 * Main entry point. Wires together all modules and orchestrates
 * user interactions: file drop, file select, export, and clear.
 *
 * Depends on: storage.js, currency.js, api.js, table.js, export.js, ui.js
 */

(function App() {

  // ── File processing ───────────────────────────────────────

  const VALID_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

  /**
   * Filters files down to accepted MIME types, reporting skipped files as a
   * single aggregated toast (rather than one per file — matters once folder
   * drops can contain many unsupported files like .DS_Store).
   */
  function validateFiles(files) {
    const valid = [];
    const skipped = [];

    for (const file of files) {
      if (VALID_MIME_TYPES.includes(file.type)) {
        valid.push(file);
      } else {
        skipped.push(file.name);
      }
    }

    if (skipped.length === 1) {
      UI.showToast(`Skipped "${skipped[0]}" — unsupported file type.`, 'error');
    } else if (skipped.length > 1) {
      UI.showToast(`Skipped ${skipped.length} unsupported file(s).`, 'error');
    }

    return valid;
  }

  /**
   * Entry point for all file uploads (single/multi select, drag-drop,
   * folder select, folder drag-drop). Routes a single file through the
   * existing per-file endpoint, and 2+ files through the bulk endpoint.
   */
  async function processFiles(files) {
    if (!files || files.length === 0) return;

    // Validate credentials before starting
    if (!Storage.hasCredentials()) {
      UI.showToast('Please configure your API key first.', 'error');
      UI.openSettings();
      return;
    }

    const validFiles = validateFiles(files);
    if (validFiles.length === 0) return;

    if (validFiles.length === 1) {
      await processSingleFile(validFiles[0]);
    } else {
      await processFilesBulk(validFiles);
    }
  }

  /**
   * Sends one file to the single-file API endpoint.
   */
  async function processSingleFile(file) {
    const queueKey = UI.addQueueItem(file);

    try {
      const receiptData = await API.parseReceipt(file);
      const row = Table.addRow(receiptData);
      await autoConvertRow(row);
      UI.updateQueueItem(queueKey, 'success', `${receiptData.vendor || 'Receipt'} parsed ✓`);
    } catch (err) {
      console.error('Receipt parse error:', err);
      UI.updateQueueItem(queueKey, 'error', err.message || 'Failed to parse');
      UI.showToast(`Error: ${err.message}`, 'error');
    }
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /**
   * Sends multiple files to the bulk API endpoint, chunked to the
   * configured max batch size. Uses a mutable work queue rather than a
   * fixed loop so a 422 "too many files for your plan" response can
   * re-split the offending chunk and requeue it immediately.
   */
  async function processFilesBulk(files) {
    const entries = files.map(file => ({ file, queueKey: UI.addQueueItem(file) }));
    const pendingChunks = chunkArray(entries, Storage.getMaxBatchFiles());
    let batchNum = 0;

    while (pendingChunks.length > 0) {
      const chunkEntries = pendingChunks.shift();
      batchNum++;
      UI.setQueueSummary(`Batch ${batchNum} — scanning ${chunkEntries.length} receipt(s)…`);

      try {
        const response = await API.parseReceiptsBulk(chunkEntries.map(e => e.file));
        const results = response.results || [];

        for (let j = 0; j < chunkEntries.length; j++) {
          const { queueKey } = chunkEntries[j];
          const result = results[j];

          if (!result) {
            UI.updateQueueItem(queueKey, 'error', 'No result returned for this file');
            continue;
          }

          const outcome = API.normalizeBulkResult(result);
          if (outcome.outcome === 'success') {
            const row = Table.addRow(outcome.row);
            await autoConvertRow(row);
            UI.updateQueueItem(queueKey, 'success', `${outcome.row.vendor || 'Receipt'} parsed ✓`);
          } else if (outcome.outcome === 'duplicate') {
            UI.updateQueueItem(queueKey, 'duplicate', `Duplicate of "${outcome.duplicateOf || 'another file'}"`);
          } else {
            UI.updateQueueItem(queueKey, 'error', outcome.message);
          }
        }
      } catch (err) {
        if (err.status === 422) {
          const discovered = API.parseMaxFilesFromError(err.message);
          if (discovered && discovered > 0 && discovered < chunkEntries.length) {
            Storage.setMaxBatchFiles(discovered);
            UI.showToast(`Your plan allows up to ${discovered} files per batch — adjusted automatically.`, 'default');
            pendingChunks.unshift(...chunkArray(chunkEntries, discovered));
            continue;
          }
          if (chunkEntries.length > 1) {
            // Couldn't parse an exact number — fall back to a blind split-and-retry.
            const mid = Math.ceil(chunkEntries.length / 2);
            pendingChunks.unshift(chunkEntries.slice(0, mid), chunkEntries.slice(mid));
            continue;
          }
        }

        console.error('Bulk receipt parse error:', err);
        chunkEntries.forEach(({ queueKey }) => UI.updateQueueItem(queueKey, 'error', err.message || 'Batch failed'));
        UI.showToast(`Batch failed: ${err.message}`, 'error');
      }
    }

    UI.clearQueueSummary();
  }

  /**
   * Recursively pulls all File objects out of a DataTransfer, traversing
   * into dropped folders via the (non-standard but universally supported)
   * webkitGetAsEntry API. Falls back to the flat file list if unsupported.
   */
  async function getFilesFromDataTransfer(dataTransfer) {
    const items = dataTransfer.items;
    if (!items || !items.length || typeof items[0].webkitGetAsEntry !== 'function') {
      return Array.from(dataTransfer.files);
    }

    // webkitGetAsEntry() must be called synchronously, before any await, or
    // the DataTransferItemList is invalidated once the handler yields.
    const entries = Array.from(items).map(item => item.webkitGetAsEntry()).filter(Boolean);

    const files = [];
    await Promise.all(entries.map(entry => walkEntry(entry, files)));
    return files;
  }

  function walkEntry(entry, files) {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        entry.file(file => { files.push(file); resolve(); }, reject);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => {
          reader.readEntries(async (batch) => {
            if (batch.length === 0) { resolve(); return; }
            await Promise.all(batch.map(child => walkEntry(child, files)));
            readBatch(); // readEntries() can cap around ~100 results per call — loop until empty
          }, reject);
        };
        readBatch();
      } else {
        resolve();
      }
    });
  }

  /**
   * If the user has previously selected a display currency, converts a
   * freshly-added row to match it so the table always shows one currency.
   */
  async function autoConvertRow(row) {
    const target = Storage.getDisplayCurrency();
    if (!target || row.currency === target) return;

    try {
      const { rates } = await Currency.fetchRates();
      Table.convertNewRow(row, target, rates);
    } catch (err) {
      console.error('Auto-conversion error:', err);
    }
  }

  // ── Drop Zone ─────────────────────────────────────────────

  function initDropZone() {
    const dropZone    = document.getElementById('drop-zone');
    const fileInput   = document.getElementById('file-input');
    const folderInput = document.getElementById('folder-input');

    // Click → open file browser
    document.getElementById('btn-browse').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    // Click → open folder browser
    document.getElementById('btn-browse-folder').addEventListener('click', (e) => {
      e.stopPropagation();
      folderInput.click();
    });

    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      processFiles(files);
      // Reset so the same file can be re-selected if needed
      e.target.value = '';
    });

    // Folder input change (webkitdirectory yields a flat FileList already)
    folderInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      processFiles(files);
      e.target.value = '';
    });

    // Drag events
    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      UI.setDropZoneDragging(true);
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault(); // Required to allow drop
      UI.setDropZoneDragging(true);
    });

    dropZone.addEventListener('dragleave', (e) => {
      // Only fire if we've left the drop zone entirely (not a child element)
      if (!dropZone.contains(e.relatedTarget)) {
        UI.setDropZoneDragging(false);
      }
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      UI.setDropZoneDragging(false);

      const files = await getFilesFromDataTransfer(e.dataTransfer);
      processFiles(files);
    });

    // Global drag-over indicator (when dragging over the whole window)
    window.addEventListener('dragover',  (e) => e.preventDefault());
    window.addEventListener('drop',      (e) => e.preventDefault()); // prevent browser default
  }

  // ── Export Buttons ────────────────────────────────────────

  function initExportButtons() {
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      const filename = Export.downloadCSV();
      if (filename) UI.showToast(`Exported "${filename}"`, 'success');
    });

    document.getElementById('btn-copy-sheets').addEventListener('click', async () => {
      const success = await Export.copyForSheets();
      if (success) {
        UI.showToast('Copied! Open Google Sheets and press Ctrl+V (or ⌘V)', 'success');
      } else {
        UI.showToast('Could not copy to clipboard.', 'error');
      }
    });
  }

  // ── Clear All ─────────────────────────────────────────────

  function initClearButton() {
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (Table.hasRows()) {
        // Simple confirmation
        const confirmed = window.confirm('Clear all receipts? This cannot be undone.');
        if (confirmed) {
          Table.clearAll();
          UI.showToast('All receipts cleared.', 'default');
        }
      }
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────

  function init() {
    UI.init();       // Wire up modal, check credentials
    Table.init();    // Load persisted rows from localStorage
    initDropZone();
    initExportButtons();
    initClearButton();
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
