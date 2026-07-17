/**
 * app.js
 * Main entry point. Wires together all modules and orchestrates
 * user interactions: file drop, file select, export, and clear.
 *
 * Depends on: storage.js, currency.js, api.js, table.js, export.js, ui.js
 */

(function App() {

  // ── File processing ───────────────────────────────────────

  /**
   * Processes an array of File objects sequentially.
   * Each file is sent to the API, and the result is added to the table.
   */
  async function processFiles(files) {
    if (!files || files.length === 0) return;

    // Validate credentials before starting
    if (!Storage.hasCredentials()) {
      UI.showToast('Please configure your API key first.', 'error');
      UI.openSettings();
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        UI.showToast(`Skipped "${file.name}" — unsupported file type.`, 'error');
        continue;
      }

      const queueKey = UI.addQueueItem(file);

      try {
        const receiptData = await API.parseReceipt(file);
        const row = Table.addRow(receiptData);
        await autoConvertRow(row);
        UI.updateQueueItem(queueKey, true, `${receiptData.vendor || 'Receipt'} parsed ✓`);
      } catch (err) {
        console.error('Receipt parse error:', err);
        UI.updateQueueItem(queueKey, false, err.message || 'Failed to parse');
        UI.showToast(`Error: ${err.message}`, 'error');
      }
    }
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
    const dropZone  = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    // Click → open file browser
    document.getElementById('btn-browse').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      processFiles(files);
      // Reset so the same file can be re-selected if needed
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

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      UI.setDropZoneDragging(false);

      const files = Array.from(e.dataTransfer.files);
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
