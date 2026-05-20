export const COUNTRY_CURRENCY_OPTIONS = [
  { country: 'Malawi', currency: 'MWK', symbol: 'MK', locale: 'en-MW' },
  { country: 'Zambia', currency: 'ZMW', symbol: 'ZK', locale: 'en-ZM' },
  { country: 'Tanzania', currency: 'TZS', symbol: 'TSh', locale: 'sw-TZ' },
  { country: 'Kenya', currency: 'KES', symbol: 'KSh', locale: 'en-KE' },
  { country: 'South Africa', currency: 'ZAR', symbol: 'R', locale: 'en-ZA' },
  { country: 'Nigeria', currency: 'NGN', symbol: 'NGN', locale: 'en-NG' },
  { country: 'United States', currency: 'USD', symbol: '$', locale: 'en-US' },
  { country: 'United Kingdom', currency: 'GBP', symbol: 'GBP', locale: 'en-GB' }
]

export const DEFAULT_COUNTRY = 'Malawi'
export const DEFAULT_CURRENCY = 'MWK'

export const getCurrencyOptionByCountry = (country) => (
  COUNTRY_CURRENCY_OPTIONS.find((option) => option.country === country) || COUNTRY_CURRENCY_OPTIONS[0]
)

export const getCurrencyOptionByCurrency = (currency) => (
  COUNTRY_CURRENCY_OPTIONS.find((option) => option.currency === currency) || COUNTRY_CURRENCY_OPTIONS[0]
)

export const normalizeCountryResidence = (country) => getCurrencyOptionByCountry(country).country

export const normalizeCurrencyPreference = (currency) => getCurrencyOptionByCurrency(currency).currency

export const formatCurrencyValue = (value, currencyPreference = DEFAULT_CURRENCY, options = {}) => {
  const amount = Number(value || 0)
  const currency = normalizeCurrencyPreference(currencyPreference)
  const option = getCurrencyOptionByCurrency(currency)
  const {
    minimumFractionDigits: requestedMinimumFractionDigits,
    maximumFractionDigits: requestedMaximumFractionDigits = 2
  } = options
  const derivedMinimumFractionDigits = amount % 1 === 0 ? 0 : 2
  const maximumFractionDigits = Math.max(0, requestedMaximumFractionDigits)
  const minimumFractionDigits = Math.min(
    maximumFractionDigits,
    requestedMinimumFractionDigits ?? derivedMinimumFractionDigits
  )

  return `${option.symbol} ${amount.toLocaleString(option.locale, {
    minimumFractionDigits,
    maximumFractionDigits
  })}`
}
