/**
 * currency.js
 * Currency reference data and exchange-rate math.
 * No DOM interaction. Depends on: storage.js
 */

const Currency = (() => {

  const RATES_TTL_MS = 60 * 60 * 1000; // 1 hour
  const RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

  const CURRENCIES = [
    { code: 'USD', name: 'United States dollar', symbol: '$' },
    { code: 'AUD', name: 'Australian dollar',     symbol: '$' },
    { code: 'BRL', name: 'Brazilian real',        symbol: 'R$' },
    { code: 'BGN', name: 'Bulgarian lev',         symbol: 'лв.' },
    { code: 'CAD', name: 'Canadian dollar',       symbol: '$' },
    { code: 'CLP', name: 'Chilean peso',          symbol: '$' },
    { code: 'CNY', name: 'Chinese yuan',          symbol: '¥' },
    { code: 'COP', name: 'Colombian peso',        symbol: '$' },
    { code: 'CZK', name: 'Czech koruna',          symbol: 'Kč' },
    { code: 'DKK', name: 'Danish krone',          symbol: 'kr' },
    { code: 'EGP', name: 'Egyptian pound',        symbol: 'ج.م' },
    { code: 'AED', name: 'Emirati dirham',        symbol: 'د.إ' },
    { code: 'EUR', name: 'Euro',                  symbol: '€' },
    { code: 'GHS', name: 'Ghanaian cedi',         symbol: 'GH₵' },
    { code: 'HKD', name: 'Hong Kong dollar',      symbol: '$' },
    { code: 'HUF', name: 'Hungarian forint',      symbol: 'Ft' },
    { code: 'INR', name: 'Indian rupee',          symbol: '₹' },
    { code: 'IDR', name: 'Indonesian rupiah',     symbol: 'Rp' },
    { code: 'ILS', name: 'Israeli new shekel',    symbol: '₪' },
    { code: 'JPY', name: 'Japanese yen',          symbol: '¥' },
    { code: 'KZT', name: 'Kazakhstani tenge',     symbol: '₸' },
    { code: 'KES', name: 'Kenyan shilling',       symbol: 'KSh' },
    { code: 'MYR', name: 'Malaysian ringgit',     symbol: 'RM' },
    { code: 'MXN', name: 'Mexican peso',          symbol: '$' },
    { code: 'MAD', name: 'Moroccan dirham',       symbol: 'د.م.' },
    { code: 'TWD', name: 'New Taiwan dollar',     symbol: '$' },
    { code: 'NZD', name: 'New Zealand dollar',    symbol: '$' },
    { code: 'NOK', name: 'Norwegian krone',       symbol: 'kr' },
    { code: 'PEN', name: 'Peruvian sol',          symbol: 'S/' },
    { code: 'PHP', name: 'Philippine peso',       symbol: '₱' },
    { code: 'PLN', name: 'Polish zloty',          symbol: 'zł' },
    { code: 'GBP', name: 'Pound sterling',        symbol: '£' },
    { code: 'QAR', name: 'Qatari riyal',          symbol: 'ر.ق' },
    { code: 'RON', name: 'Romanian leu',          symbol: 'lei' },
    { code: 'SAR', name: 'Saudi Arabian riyal',   symbol: 'SR' },
    { code: 'SGD', name: 'Singapore dollar',      symbol: '$' },
    { code: 'ZAR', name: 'South African rand',    symbol: 'R' },
    { code: 'KRW', name: 'South Korean won',      symbol: '₩' },
    { code: 'SEK', name: 'Swedish krona',         symbol: 'kr' },
    { code: 'CHF', name: 'Swiss franc',           symbol: 'Fr' },
    { code: 'THB', name: 'Thai baht',             symbol: '฿' },
    { code: 'TRY', name: 'Turkish lira',          symbol: '₺' },
  ];

  const BY_CODE = Object.fromEntries(CURRENCIES.map(c => [c.code, c]));

  function getSymbol(code) {
    return BY_CODE[code]?.symbol || code;
  }

  function getName(code) {
    return BY_CODE[code]?.name || code;
  }

  /**
   * Returns { base, rates, fetchedAt }, using a cached copy if it's
   * still fresh. Falls back to a stale cache (if any) on network failure.
   */
  async function fetchRates() {
    const cached = Storage.getRatesCache();
    if (cached && Date.now() - cached.fetchedAt < RATES_TTL_MS) {
      return cached;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(RATES_ENDPOINT, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) throw new Error(`Rate lookup failed (${response.status})`);

      const data = await response.json();
      if (!data.rates) throw new Error('Rate lookup returned no data');

      const fresh = { base: 'USD', rates: data.rates, fetchedAt: Date.now() };
      Storage.setRatesCache(fresh);
      return fresh;
    } catch (err) {
      clearTimeout(timer);
      if (cached) return cached; // stale is better than nothing
      throw err;
    }
  }

  /** Converts an amount between two currency codes using a USD-pivot rate table. */
  function convert(amount, fromCode, toCode, rates) {
    if (fromCode === toCode) return amount;
    const fromRate = rates[fromCode];
    const toRate   = rates[toCode];
    if (!fromRate || !toRate) return null;
    const usd = amount / fromRate;
    return usd * toRate;
  }

  return {
    CURRENCIES,
    getSymbol,
    getName,
    fetchRates,
    convert,
  };
})();
