/**
 * ui.js
 * Manages UI chrome: settings modal, currency converter modal,
 * drop zone visual states, processing queue rendering, and toast notifications.
 * Depends on: storage.js, currency.js, table.js
 */

const UI = (() => {

  // ── Toast ─────────────────────────────────────────────────

  let toastTimer = null;

  function showToast(message, type = 'default') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className   = `toast toast-${type}`;
    el.hidden      = false;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  // ── Settings Modal ────────────────────────────────────────

  function openSettings() {
    const modal    = document.getElementById('modal-settings');
    const keyInput = document.getElementById('input-api-key');
    const urlInput = document.getElementById('input-api-endpoint');

    keyInput.value = Storage.getApiKey();
    urlInput.value = Storage.getApiEndpoint();

    modal.hidden = false;
    keyInput.focus();
  }

  function closeSettings() {
    document.getElementById('modal-settings').hidden = true;
  }

  function saveSettings() {
    const key = document.getElementById('input-api-key').value.trim();
    const url = document.getElementById('input-api-endpoint').value.trim();

    if (!key || !url) {
      showToast('Please fill in both API Key and Endpoint URL.', 'error');
      return;
    }

    Storage.setApiKey(key);
    Storage.setApiEndpoint(url);
    closeSettings();
    showToast('Settings saved ✓', 'success');
  }

  // ── Currency Converter Modal ──────────────────────────────

  function openCurrencyModal() {
    const modal   = document.getElementById('modal-currency');
    const grid    = document.getElementById('currency-grid');
    const current = Storage.getDisplayCurrency() || 'USD';

    grid.innerHTML = '';
    Currency.CURRENCIES.forEach(({ code, name, symbol }) => {
      const btn = document.createElement('button');
      btn.className = 'currency-option' + (code === current ? ' is-selected' : '');
      btn.innerHTML = `
        <span class="currency-option-name">${name}</span>
        <span class="currency-option-code">${code} – ${symbol}</span>
      `;
      btn.addEventListener('click', () => selectCurrency(code));
      grid.appendChild(btn);
    });

    modal.hidden = false;
  }

  function closeCurrencyModal() {
    document.getElementById('modal-currency').hidden = true;
  }

  async function selectCurrency(code) {
    const grid = document.getElementById('currency-grid');
    grid.querySelectorAll('.currency-option').forEach(btn => btn.disabled = true);

    try {
      const { rates } = await Currency.fetchRates();
      Storage.setDisplayCurrency(code);
      const skipped = Table.convertAllRows(code, rates);
      closeCurrencyModal();

      if (skipped.length > 0) {
        showToast(`Converted to ${code}, but ${skipped.length} row(s) use an unsupported currency.`, 'error');
      } else {
        showToast(`Converted to ${code} ✓`, 'success');
      }
    } catch (err) {
      console.error('Currency conversion error:', err);
      showToast('Could not fetch exchange rates. Try again later.', 'error');
      grid.querySelectorAll('.currency-option').forEach(btn => btn.disabled = false);
    }
  }

  // ── Drop Zone visual state ────────────────────────────────

  function setDropZoneDragging(active) {
    const zone = document.getElementById('drop-zone');
    zone.classList.toggle('is-dragging-over', active);
  }

  // ── Processing Queue ──────────────────────────────────────

  const queueItems = new Map(); // filename → element

  function addQueueItem(file) {
    const queue = document.getElementById('queue');
    queue.hidden = false;

    const item = document.createElement('div');
    item.className = 'queue-item status-processing';

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'queue-thumb';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      thumb.appendChild(img);
    } else {
      // PDF or other — show an icon
      thumb.textContent = '📄';
    }

    // Info
    const info = document.createElement('div');
    info.className = 'queue-info';

    const name = document.createElement('div');
    name.className   = 'queue-filename';
    name.textContent = file.name;

    const status = document.createElement('div');
    status.className   = 'queue-status-text';
    status.textContent = 'Scanning…';

    info.appendChild(name);
    info.appendChild(status);

    // Spinner
    const indicator = document.createElement('div');
    indicator.className = 'queue-indicator';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    indicator.appendChild(spinner);

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(indicator);
    queue.appendChild(item);

    const key = file.name + file.size;
    queueItems.set(key, { item, status, indicator });

    return key;
  }

  function updateQueueItem(key, success, message) {
    const entry = queueItems.get(key);
    if (!entry) return;

    const { item, status, indicator } = entry;

    if (success) {
      item.classList.replace('status-processing', 'status-done');
      status.textContent    = message || 'Done ✓';
      indicator.innerHTML   = '<span style="color:var(--accent);font-size:16px">✓</span>';
    } else {
      item.classList.replace('status-processing', 'status-error');
      status.textContent    = message || 'Failed';
      indicator.innerHTML   = '<span style="color:var(--danger);font-size:16px">✕</span>';
    }

    // Auto-remove successful items after a delay
    if (success) {
      setTimeout(() => {
        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        item.style.opacity    = '0';
        item.style.transform  = 'translateX(8px)';
        setTimeout(() => {
          item.remove();
          queueItems.delete(key);
          maybeHideQueue();
        }, 300);
      }, 1800);
    }
  }

  function maybeHideQueue() {
    const queue = document.getElementById('queue');
    if (queue.children.length === 0) {
      queue.hidden = true;
    }
  }

  // ── Init (wire up static event listeners) ─────────────────

  function init() {
    // Settings modal
    document.getElementById('btn-settings').addEventListener('click', () => {
      openSettings();
    });
    document.getElementById('btn-close-modal').addEventListener('click', closeSettings);
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('modal-settings').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSettings();
    });

    // Currency converter modal
    document.getElementById('btn-currency-converter').addEventListener('click', () => {
      openCurrencyModal();
    });
    document.getElementById('btn-close-currency-modal').addEventListener('click', closeCurrencyModal);
    document.getElementById('modal-currency').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeCurrencyModal();
    });

    // Enter key in modal inputs saves
    ['input-api-key', 'input-api-endpoint'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveSettings();
      });
    });

    // Auto-open settings on first visit if no credentials
    if (!Storage.hasCredentials()) {
      openSettings();
    }
  }

  return {
    init,
    showToast,
    openSettings,
    closeSettings,
    openCurrencyModal,
    closeCurrencyModal,
    setDropZoneDragging,
    addQueueItem,
    updateQueueItem,
  };
})();
