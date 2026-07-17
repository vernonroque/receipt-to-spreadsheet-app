/**
 * storage.js
 * Handles all localStorage reads and writes.
 * Nothing here touches the DOM.
 */

const Storage = (() => {
  const KEYS = {
    API_KEY:          'rp_api_key',
    API_ENDPOINT:     'rp_api_endpoint',
    ROWS:             'rp_rows',
    RATES_CACHE:      'rp_rates_cache',
    DISPLAY_CURRENCY: 'rp_display_currency',
  };

  function getApiKey() {
    return localStorage.getItem(KEYS.API_KEY) || '';
  }

  function setApiKey(value) {
    localStorage.setItem(KEYS.API_KEY, value.trim());
  }

  function getApiEndpoint() {
    return localStorage.getItem(KEYS.API_ENDPOINT) || '';
  }

  function setApiEndpoint(value) {
    localStorage.setItem(KEYS.API_ENDPOINT, value.trim());
  }

  function hasCredentials() {
    return getApiKey().length > 0 && getApiEndpoint().length > 0;
  }

  function saveRows(rows) {
    try {
      localStorage.setItem(KEYS.ROWS, JSON.stringify(rows));
    } catch (e) {
      console.warn('Could not persist rows to localStorage:', e);
    }
  }

  function loadRows() {
    try {
      const raw = localStorage.getItem(KEYS.ROWS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function clearRows() {
    localStorage.removeItem(KEYS.ROWS);
  }

  function getRatesCache() {
    try {
      const raw = localStorage.getItem(KEYS.RATES_CACHE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setRatesCache(cache) {
    try {
      localStorage.setItem(KEYS.RATES_CACHE, JSON.stringify(cache));
    } catch (e) {
      console.warn('Could not persist rates cache to localStorage:', e);
    }
  }

  function getDisplayCurrency() {
    return localStorage.getItem(KEYS.DISPLAY_CURRENCY) || '';
  }

  function setDisplayCurrency(code) {
    localStorage.setItem(KEYS.DISPLAY_CURRENCY, code);
  }

  return {
    getApiKey,
    setApiKey,
    getApiEndpoint,
    setApiEndpoint,
    hasCredentials,
    saveRows,
    loadRows,
    clearRows,
    getRatesCache,
    setRatesCache,
    getDisplayCurrency,
    setDisplayCurrency,
  };
})();
