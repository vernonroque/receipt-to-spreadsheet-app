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

    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'accept':        'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
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
    console.log('Raw API response:', data);
    return normalizeResponse(data);
  }

  return { parseReceipt };
})();
