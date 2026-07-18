/**
 * api.js
 * Handles all communication with the receipt parser API.
 * Returns normalized receipt data. No DOM interaction.
 */

const API = (() => {

  /**
   * Normalizes the raw API response into a consistent row schema.
   * Adjust field mappings here to match your API's actual response shape.
   *
   * Expected API response shape (adapt as needed):
   * {
   *   date:          "2024-03-15",
   *   merchant_name: "Starbucks",
   *   category:      "Meals & Entertainment",
   *   subtotal:      11.50,
   *   tax:           1.15,
   *   total:         12.65,
   *   currency:      "USD"
   * }
   */
  function mapReceiptFields(d) {
    return {
      date:     d.date          || d.receipt_date   || '',
      vendor:   d.merchant?.name || d.merchant_name || d.vendor || d.store_name || '',
      category: d.category      || d.expense_type   || 'Uncategorized',
      subtotal: formatAmount(d.subtotal  || d.sub_total    || 0),
      tax:      formatAmount(d.tax       || d.tax_amount   || 0),
      total:    formatAmount(d.total     || d.total_amount || 0),
      currency: d.currency      || d.currency_code  || 'USD',
    };
  }

  function normalizeResponse(data) {
    return mapReceiptFields(data.data);
  }

  /**
   * Maps a single result from the bulk endpoint's `results[]` array to one
   * of three outcomes: a normal success, a detected duplicate (no data), or
   * a per-file failure (batch as a whole can still be 200 OK).
   */
  function normalizeBulkResult(result) {
    if (result.success && result.is_duplicate) {
      return { outcome: 'duplicate', duplicateOf: result.duplicate_of };
    }
    if (result.success && result.data) {
      return { outcome: 'success', row: mapReceiptFields(result.data) };
    }
    return { outcome: 'error', message: result.error || 'No data returned for this file' };
  }

  /**
   * Best-effort extraction of the real per-plan file limit from a 422
   * "too many files" error message. Not a stable contract — if the backend's
   * wording changes this just returns null and the caller falls back to a
   * blind split-and-retry.
   */
  function parseMaxFilesFromError(message) {
    const match = /up to (\d+) files/i.exec(message || '');
    return match ? parseInt(match[1], 10) : null;
  }

  function deriveBulkEndpoint(endpoint) {
    return endpoint.replace(/\/+$/, '') + '/bulk';
  }

  function formatAmount(value) {
    const num = parseFloat(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  }

  function compressImage(file, maxPx = 1600, quality = 0.8) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = url;
    });
  }

  /**
   * Sends a receipt file to the API and returns normalized data.
   * @param {File} file
   * @returns {Promise<Object>} normalized receipt row
   */
  async function parseReceipt(file) {
    const apiKey      = Storage.getApiKey();
    const apiEndpoint = Storage.getApiEndpoint();

    if (!apiKey || !apiEndpoint) {
      throw new Error('API key or endpoint not configured. Open ⚙ Settings to add them.');
    }

    const isImage = file.type.startsWith('image/');
    const payload = isImage ? await compressImage(file) : file;

    const formData = new FormData();
    formData.append('file', payload, file.name);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'accept':        'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      let message = `API error ${response.status}`;
      try {
        const errData = await response.json();
        message = errData.message || errData.error || message;
      } catch (_) { /* ignore parse errors */ }
      throw new Error(message);
    }

    const data = await response.json();
    console.log('Raw API response:', data);
    return normalizeResponse(data);
  }

  /**
   * Sends multiple receipt files to the bulk API endpoint in a single request.
   * @param {File[]} files
   * @returns {Promise<Object>} raw bulk response { success, results: [...], ... }
   */
  async function parseReceiptsBulk(files) {
    const apiKey      = Storage.getApiKey();
    const apiEndpoint = Storage.getApiEndpoint();

    if (!apiKey || !apiEndpoint) {
      throw new Error('API key or endpoint not configured. Open ⚙ Settings to add them.');
    }

    const formData = new FormData();
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const payload = isImage ? await compressImage(file) : file;
      formData.append('files', payload, file.name);
    }

    const timeoutMs = Math.min(600_000, 30_000 + files.length * 10_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(deriveBulkEndpoint(apiEndpoint), {
        method: 'POST',
        headers: {
          'accept':        'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let message = `API error ${response.status}`;
      try {
        const errData = await response.json();
        message = errData.detail || errData.message || errData.error || message;
      } catch (_) { /* ignore parse errors */ }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  return { parseReceipt, parseReceiptsBulk, normalizeBulkResult, parseMaxFilesFromError };
})();
