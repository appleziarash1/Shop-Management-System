export const THEME_STORAGE_KEY = 'shopms-theme-preference'

export const normalizeThemePreference = (value) => (
  value === 'dark' ? 'dark' : 'light'
)

export const applyThemePreference = (value) => {
  if (typeof document === 'undefined') return
  const theme = normalizeThemePreference(value)
  document.documentElement.setAttribute('data-theme', theme)
}

export const readStoredThemePreference = () => {
  if (typeof window === 'undefined') return 'light'
  return normalizeThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
}

export const persistThemePreference = (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, normalizeThemePreference(value))
}
