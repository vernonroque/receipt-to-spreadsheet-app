# Receipt-to-Spreadsheet

A zero-setup, single-page tool for freelancers and small businesses.
Drag and drop receipt images, get an editable spreadsheet — export to CSV or paste directly into Google Sheets.

## Getting Started

1. Open `index.html` in any modern browser (no server required)
2. Enter your API key and endpoint URL in the ⚙ Settings modal
3. Drag and drop receipt images (JPG, PNG, PDF) onto the drop zone
4. Edit any cell inline if needed
5. Export via **Export CSV** or **Copy for Sheets**

No installation. No login. No backend.

---

## Project Structure

```
receipt-to-spreadsheet/
├── index.html          # Markup only — no inline styles or scripts
├── css/
│   └── styles.css      # All styles and design tokens
├── js/
│   ├── storage.js      # localStorage reads/writes (API key, rows)
│   ├── api.js          # Receipt parser API communication
│   ├── table.js        # In-memory row data + spreadsheet DOM
│   ├── export.js       # CSV download + Google Sheets clipboard copy
│   ├── ui.js           # Settings modal, drop zone states, queue, toasts
│   └── app.js          # Entry point — wires all modules together
└── README.md
```

---

## Connecting Your API

Open `js/api.js` and update the `normalizeResponse` function to match your API's actual response shape.

### Expected default response shape

```json
{
  "date":          "2024-03-15",
  "merchant_name": "Starbucks",
  "category":      "Meals & Entertainment",
  "subtotal":      11.50,
  "tax":           1.15,
  "total":         12.65,
  "currency":      "USD"
}
```

### Field mapping fallbacks

The `normalizeResponse` function already handles common alternative field names:

| Output field | Tries these API fields in order |
|---|---|
| `date`     | `date`, `receipt_date` |
| `vendor`   | `merchant_name`, `vendor`, `store_name` |
| `category` | `category`, `expense_type` |
| `subtotal` | `subtotal`, `sub_total` |
| `tax`      | `tax`, `tax_amount` |
| `total`    | `total`, `total_amount` |
| `currency` | `currency`, `currency_code` |

Add your own fallbacks in `normalizeResponse()` if your API uses different field names.

---

## Request Format

The app sends a `multipart/form-data` POST request with a single field:

| Field  | Value                                              |
|--------|----------------------------------------------------|
| `file` | The receipt file (images are compressed to JPEG first; PDFs are sent as-is) |

Authorization header: `Bearer <your-api-key>`

---

## Features

- **Drag & drop** multiple receipts at once — processed sequentially
- **Editable cells** — click any cell to correct OCR errors
- **Persistent rows** — receipts survive page refresh (stored in localStorage)
- **Running totals** — subtotal, tax, total summed in footer
- **CSV export** — timestamped filename
- **Copy for Sheets** — TSV format pastes perfectly into Google Sheets
- **No dependencies** — pure HTML/CSS/JS, no npm, no build step
