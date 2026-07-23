/**
 * table.js
 * Manages the in-memory row data and all spreadsheet DOM rendering.
 * Depends on: storage.js, currency.js
 */

const Table = (() => {

  // In-memory rows array. Each row matches the normalized schema from api.js.
  let rows = [];
  let nextId = 1;

  // ── DOM refs ──────────────────────────────────────────────
  const tbody        = () => document.getElementById('spreadsheet-body');
  const tableSection = () => document.getElementById('table-section');
  const emptyState   = () => document.getElementById('empty-state');
  const rowCountEl   = () => document.getElementById('row-count');
  const totalAmountEl= () => document.getElementById('total-amount');
  const footerSub    = () => document.getElementById('footer-subtotal');
  const footerTax    = () => document.getElementById('footer-tax');
  const footerTotal  = () => document.getElementById('footer-total');

  // ── Internal helpers ──────────────────────────────────────

  function generateId() {
    return nextId++;
  }

  function parseNum(str) {
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Creates a <td> with a contenteditable <span> inside.
   * When the user edits, it updates the in-memory row and persists.
   */
  function makeEditableCell(row, field, cssClass) {
    const td   = document.createElement('td');
    const span = document.createElement('span');
    span.className        = 'cell-edit';
    span.contentEditable  = 'true';
    span.spellcheck       = false;
    span.textContent      = row[field];

    if (cssClass) td.className = cssClass;

    span.addEventListener('blur', () => {
      row[field] = span.textContent.trim();
      if (['subtotal', 'tax', 'total'].includes(field)) {
        recalcTotals();
      }
      persist();
    });

    // Prevent newlines in cells
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        span.blur();
      }
    });

    td.appendChild(span);
    return td;
  }

  function makeReadOnlyCell(value, cssClass) {
    const td   = document.createElement('td');
    const span = document.createElement('span');
    span.className   = 'cell-edit';
    span.textContent = value;
    if (cssClass) td.className = cssClass;
    td.appendChild(span);
    return td;
  }

  function makeDeleteCell(row) {
    const td  = document.createElement('td');
    td.className = 'col-actions';
    const btn = document.createElement('button');
    btn.className = 'btn-row-delete';
    btn.title     = 'Remove row';
    btn.textContent = '×';
    btn.addEventListener('click', () => removeRow(row.id));
    td.appendChild(btn);
    return td;
  }

  /** Renders a single row into the tbody. */
  function renderRow(row, animate = false) {
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id;
    if (animate) tr.classList.add('new-row');

    tr.appendChild(makeReadOnlyCell(String(rows.indexOf(row) + 1), 'col-num'));
    tr.appendChild(makeEditableCell(row, 'date',     'col-date'));
    tr.appendChild(makeEditableCell(row, 'vendor',   'col-vendor'));
    tr.appendChild(makeEditableCell(row, 'category', 'col-category'));
    tr.appendChild(makeEditableCell(row, 'original_subtotal', 'col-original-subtotal'));
    tr.appendChild(makeEditableCell(row, 'subtotal', 'col-converted-subtotal'));
    tr.appendChild(makeEditableCell(row, 'original_tax','col-original-tax'));
    tr.appendChild(makeEditableCell(row, 'tax', 'col-converted-tax'));
    tr.appendChild(makeEditableCell(row, 'original_total',    'col-original-total'));
    tr.appendChild(makeEditableCell(row, 'total',    'col-converted-total'));
    tr.appendChild(makeEditableCell(row, 'original_currency', 'col-original-currency'));
    tr.appendChild(makeEditableCell(row, 'currency', 'col-converted-currency'));
    tr.appendChild(makeDeleteCell(row));

    tbody().appendChild(tr);
  }

  /** Re-renders all row number cells (after a deletion). */
  function refreshRowNumbers() {
    const trs = tbody().querySelectorAll('tr');
    trs.forEach((tr, i) => {
      const numCell = tr.querySelector('.col-num .cell-edit');
      if (numCell) numCell.textContent = String(i + 1);
    });
  }

  /** Clears and re-renders every row in the tbody from the current `rows` array. */
  function renderAll() {
    tbody().innerHTML = '';
    rows.forEach(row => renderRow(row));
  }

  /**
   * Converts a single row's subtotal/tax/total to `targetCode` using `rates`.
   * Captures the row's pre-conversion values the first time it's converted,
   * so repeated conversions always compute from the original amount rather
   * than compounding rounding error on top of an already-converted value.
   * Returns false if the conversion couldn't be performed (unsupported currency).
   */
  function convertRow(row, targetCode, rates) {
    if (!row.originalCurrency) {
      row.originalCurrency = row.currency;
      row.originalSubtotal = row.subtotal;
      row.originalTax      = row.tax;
      row.originalTotal    = row.total;
    }

    const newSubtotal = Currency.convert(parseNum(row.originalSubtotal), row.originalCurrency, targetCode, rates);
    const newTax      = Currency.convert(parseNum(row.originalTax),      row.originalCurrency, targetCode, rates);
    const newTotal    = Currency.convert(parseNum(row.originalTotal),    row.originalCurrency, targetCode, rates);

    if (newSubtotal === null || newTax === null || newTotal === null) return false;

    row.subtotal = newSubtotal.toFixed(2);
    row.tax      = newTax.toFixed(2);
    row.total    = newTotal.toFixed(2);
    row.currency = targetCode;
    return true;
  }

  // ── Public API ─────────────────────────────────────────────

  /** Loads persisted rows on startup. */
  function init() {
    const saved = Storage.loadRows();
    if (saved.length > 0) {
      saved.forEach(row => {
        // Restore IDs correctly so nextId doesn't collide
        if (row.id >= nextId) nextId = row.id + 1;
        rows.push(row);
        renderRow(row);
      });
      recalcTotals();
      updateVisibility();
    }
  }

  /** Adds a parsed receipt as a new row. */
  function addRow(receiptData) {
    const row = { id: generateId(), ...receiptData };
    rows.push(row);
    renderRow(row, true);
    recalcTotals();
    updateVisibility();
    persist();
    return row;
  }

  /** Removes a row by id. */
  function removeRow(id) {
    const trEl = tbody().querySelector(`tr[data-row-id="${id}"]`);
    if (trEl) trEl.remove();
    rows = rows.filter(r => r.id !== id);
    refreshRowNumbers();
    recalcTotals();
    updateVisibility();
    persist();
  }

  /** Clears all rows. */
  function clearAll() {
    rows = [];
    tbody().innerHTML = '';
    recalcTotals();
    updateVisibility();
    Storage.clearRows();
  }

  /** Returns a copy of all rows (for export). */
  function getRows() {
    return rows.map(r => ({ ...r }));
  }

  function hasRows() {
    return rows.length > 0;
  }

  /**
   * Converts every row to `targetCode` using the given rate table.
   * Rows whose original currency isn't present in `rates` are left
   * unconverted; their ids are returned so the caller can warn about them.
   */
  function convertAllRows(targetCode, rates) {
    const skipped = [];
    rows.forEach(row => {
      if (!convertRow(row, targetCode, rates)) skipped.push(row.id);
    });
    renderAll();
    recalcTotals();
    persist();
    return skipped;
  }

  /**
   * Converts a single, just-added row to `targetCode` and re-renders/persists.
   * Used to auto-convert newly scanned receipts to the current display currency.
   */
  function convertNewRow(row, targetCode, rates) {
    const ok = convertRow(row, targetCode, rates);
    if (ok) {
      renderAll();
      recalcTotals();
      persist();
    }
    return ok;
  }

  /** Updates running totals in the footer and header. */
  function recalcTotals() {
    const sub   = rows.reduce((s, r) => s + parseNum(r.subtotal), 0);
    const tax   = rows.reduce((s, r) => s + parseNum(r.tax),      0);
    const total = rows.reduce((s, r) => s + parseNum(r.total),    0);

    const symbol = Currency.getSymbol(Storage.getDisplayCurrency() || 'USD');
    const fmt = n => `${symbol}${n.toFixed(2)}`;

    footerSub().textContent   = rows.length ? fmt(sub)   : '—';
    footerTax().textContent   = rows.length ? fmt(tax)   : '—';
    footerTotal().textContent = rows.length ? fmt(total) : '—';

    rowCountEl().textContent   = `${rows.length} receipt${rows.length !== 1 ? 's' : ''}`;
    totalAmountEl().textContent = `Total: ${fmt(total)}`;
  }

  /** Shows/hides the table section and empty state. */
  function updateVisibility() {
    const show = rows.length > 0;
    tableSection().hidden = !show;
    emptyState().hidden   = show;

    // Update export buttons
    document.getElementById('btn-export-csv').disabled    = !show;
    document.getElementById('btn-copy-sheets').disabled   = !show;
  }

  function persist() {
    Storage.saveRows(rows);
  }

  return {
    init,
    addRow,
    removeRow,
    clearAll,
    getRows,
    hasRows,
    convertAllRows,
    convertNewRow,
  };
})();
