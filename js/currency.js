const COUNTRY_CURRENCIES = [
  { country: 'Philippines', currency: 'PHP', symbol: '₱',   flag: '🇵🇭', decimals: 0 },
  { country: 'USA',         currency: 'USD', symbol: '$',    flag: '🇺🇸', decimals: 2 },
  { country: 'Australia',   currency: 'AUD', symbol: 'A$',   flag: '🇦🇺', decimals: 2 },
  { country: 'Germany',     currency: 'EUR', symbol: '€',    flag: '🇩🇪', decimals: 2 },
  { country: 'Japan',       currency: 'JPY', symbol: '¥',    flag: '🇯🇵', decimals: 0 },
  { country: 'New Zealand', currency: 'NZD', symbol: 'NZ$',  flag: '🇳🇿', decimals: 2 },
  { country: 'Singapore',   currency: 'SGD', symbol: 'S$',   flag: '🇸🇬', decimals: 2 },
  { country: 'South Korea', currency: 'KRW', symbol: '₩',    flag: '🇰🇷', decimals: 0 },
];

// Fallback rates (USD base) in case API is unavailable
const FALLBACK_RATES = { USD:1, PHP:61.306, AUD:1.4488, EUR:0.87712, JPY:161.65, NZD:1.7701, SGD:1.2942, KRW:1536.47 };

let exchangeRates = { ...FALLBACK_RATES };
let activeCurrency = COUNTRY_CURRENCIES[1]; // default USD

async function fetchExchangeRates() {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD');
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    exchangeRates = { USD: 1, ...data.rates };
  } catch (e) {
    console.warn('Exchange rate fetch failed, using fallback rates.');
  }
  updateCurrencyUI();
  if (typeof renderProducts === 'function') renderProducts();
}

function formatPrice(usdAmount) {
  if (usdAmount == null) return '';
  const rate = exchangeRates[activeCurrency.currency] || 1;
  const converted = usdAmount * rate;
  const dec = activeCurrency.decimals;
  const num = dec === 0
    ? Math.round(converted).toLocaleString()
    : converted.toFixed(dec);
  return `${activeCurrency.symbol}${num}`;
}

function setCurrency(currencyCode) {
  const match = COUNTRY_CURRENCIES.find(c => c.currency === currencyCode);
  if (!match) return;
  activeCurrency = match;
  updateCurrencyUI();
  document.getElementById('currency-dropdown').classList.remove('open');
  if (typeof renderProducts === 'function') renderProducts();
  if (typeof renderCart === 'function') renderCart();
}

function updateCurrencyUI() {
  const flagEl = document.getElementById('currency-flag');
  const codeEl = document.getElementById('currency-code');
  if (flagEl) flagEl.textContent = activeCurrency.flag;
  if (codeEl) codeEl.textContent = activeCurrency.currency;
  document.querySelectorAll('.currency-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.currency === activeCurrency.currency);
  });
}

function toggleCurrencyDropdown(e) {
  e.stopPropagation();
  document.getElementById('currency-dropdown').classList.toggle('open');
}

document.addEventListener('click', () => {
  const dd = document.getElementById('currency-dropdown');
  if (dd) dd.classList.remove('open');
});
