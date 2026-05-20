const PROFILE_PREFERENCES_KEY = 'shopms-profile-preferences'

const readPreferenceMap = () => {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(PROFILE_PREFERENCES_KEY) || '{}')
  } catch {
    return {}
  }
}

const writePreferenceMap = (map) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROFILE_PREFERENCES_KEY, JSON.stringify(map))
}

export const readStoredProfilePreferences = (userId) => {
  if (!userId) return {}
  return readPreferenceMap()[userId] || {}
}

export const persistProfilePreferences = (userId, preferences) => {
  if (!userId) return
  const map = readPreferenceMap()
  map[userId] = {
    ...(map[userId] || {}),
    ...preferences
  }
  writePreferenceMap(map)
}
