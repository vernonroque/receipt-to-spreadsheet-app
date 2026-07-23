/**
 * export.js
 * Handles CSV file export and Google Sheets clipboard copy.
 * Depends on: table.js
 */

const Export = (() => {

  const COLUMNS = ['date', 'vendor', 'category','original_subtotal', 'subtotal', 'original_tax', 'tax', 'original_total', 'total', 'original_currency', 'currency'];
  const HEADERS  = ['Date', 'Vendor', 'Category', 'Original Subtotal','Converted Subtotal', 'Original Tax', 'Converted Tax', 'Original Total', 'Converted Total', 'Original Currency', 'Converted Currency'];

  /** Escapes a cell value for CSV (wraps in quotes if it contains commas, quotes, or newlines). */
  function escapeCSV(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /** Converts rows to a CSV string. */
  function rowsToCSV(rows) {
    const headerLine = HEADERS.map(escapeCSV).join(',');
    const dataLines  = rows.map(row =>
      COLUMNS.map(col => escapeCSV(row[col] ?? '')).join(',')
    );
    return [headerLine, ...dataLines].join('\r\n');
  }

  /** Converts rows to TSV for pasting into Google Sheets. */
  function rowsToTSV(rows) {
    const headerLine = HEADERS.join('\t');
    const dataLines  = rows.map(row =>
      COLUMNS.map(col => String(row[col] ?? '')).join('\t')
    );
    return [headerLine, ...dataLines].join('\n');
  }

  /** Triggers a CSV file download. */
  function downloadCSV() {
    const rows = Table.getRows();
    if (rows.length === 0) return;

    const csv      = rowsToCSV(rows);
    const blob     = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url      = URL.createObjectURL(blob);
    const filename = `receipts_${formatDateForFilename()}.csv`;

    const link  = document.createElement('a');
    link.href   = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the object URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return filename;
  }

  /** Copies TSV to clipboard — pastes directly into Google Sheets. */
  async function copyForSheets() {
    const rows = Table.getRows();
    if (rows.length === 0) return false;

    const tsv = rowsToTSV(rows);

    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch (err) {
      // Fallback for browsers without clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = tsv;
      textarea.style.position = 'fixed';
      textarea.style.opacity  = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  }

  function formatDateForFilename() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  return {
    downloadCSV,
    copyForSheets,
  };
})();
