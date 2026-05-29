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
  function normalizeResponse(data) {

    console.log('Normalizing API response:');
    console.log('Date:', data.data.date || data.data.receipt_date);
    console.log('Vendor:', data.data.merchant?.name || data.data.merchant_name || data.data.vendor || data.data.store_name);
    console.log('Category:', data.data.category || data.data.expense_type);
    console.log('Subtotal:', data.data.subtotal || data.data.sub_total);
    console.log('Tax:', data.data.tax || data.data.tax_amount);
    console.log('Total:', data.data.total || data.data.total_amount);
    console.log('Currency:', data.data.currency || data.data.currency_code);
    
    return {
      date:     data.data.date          || data.data.receipt_date   || '',
      vendor:   data.data.merchant?.name || data.data.merchant_name || data.data.vendor || data.data.store_name || '',
      category: data.data.category      || data.data.expense_type   || 'Uncategorized',
      subtotal: formatAmount(data.data.subtotal  || data.data.sub_total || 0),
      tax:      formatAmount(data.data.tax       || data.data.tax_amount || 0),
      total:    formatAmount(data.data.total     || data.data.total_amount || 0),
      currency: data.data.currency      || data.data.currency_code  || 'USD',
    };
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

  return { parseReceipt };
})();
