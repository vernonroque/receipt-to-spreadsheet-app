/**
 * api.js
 * Handles all communication with the receipt parser API.
 * Returns normalized receipt data. No DOM interaction.
 */

const API = (() => {

  /**
   * Converts a File object to a base64 data string.
   * @param {File} file
   * @returns {Promise<string>} base64 encoded string (without the data URI prefix)
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => {
        // Strip the "data:<mime>;base64," prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

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
    return {
      date:     data.date          || data.receipt_date   || '',
      vendor:   data.merchant_name || data.vendor         || data.store_name || '',
      category: data.category      || data.expense_type   || 'Uncategorized',
      subtotal: formatAmount(data.subtotal  || data.sub_total || 0),
      tax:      formatAmount(data.tax       || data.tax_amount || 0),
      total:    formatAmount(data.total     || data.total_amount || 0),
      currency: data.currency      || data.currency_code  || 'USD',
    };
  }

  function formatAmount(value) {
    const num = parseFloat(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
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

    const base64 = await fileToBase64(file);

    const payload = {
      image:    base64,
      filename: file.name,
      // Include mime type in case your API needs it
      mime_type: file.type || 'image/jpeg',
    };

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = `API error ${response.status}`;
      try {
        const errData = await response.json();
        message = errData.message || errData.error || message;
      } catch (_) { /* ignore parse errors */ }
      throw new Error(message);
    }

    const data = await response.json();
    return normalizeResponse(data);
  }

  return { parseReceipt };
})();
