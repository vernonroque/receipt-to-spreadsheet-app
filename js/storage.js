/**
 * storage.js
 * Handles all localStorage reads and writes.
 * Nothing here touches the DOM.
 */

const Storage = (() => {
  const KEYS = {
    API_KEY:      'rp_api_key',
    API_ENDPOINT: 'rp_api_endpoint',
    ROWS:         'rp_rows',
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

  return {
    getApiKey,
    setApiKey,
    getApiEndpoint,
    setApiEndpoint,
    hasCredentials,
    saveRows,
    loadRows,
    clearRows,
  };
})();
