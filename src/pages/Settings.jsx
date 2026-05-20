import React, { useEffect, useState } from 'react'
import { Clock3, Edit2, ImagePlus, Lock, Moon, Save, Sun, Unlock, UserCircle2, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { fileToDataUrl } from '../lib/profileImage'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { applyThemePreference } from '../lib/theme'
import { COUNTRY_CURRENCY_OPTIONS, DEFAULT_COUNTRY, DEFAULT_CURRENCY, getCurrencyOptionByCountry, normalizeCountryResidence, normalizeCurrencyPreference } from '../lib/currency'
import { persistProfilePreferences } from '../lib/profilePreferences'

const DEFAULT_TIMES = {
  opening_time: '08:00',
  closing_time: '18:00'
}

const buildProfileDraft = ({ userProfile, themePreference, countryResidence, currencyPreference }) => ({
  avatar_url: userProfile?.avatar_url || '',
  theme_preference: themePreference || userProfile?.theme_preference || 'light',
  country_residence: normalizeCountryResidence(countryResidence || userProfile?.country_residence || DEFAULT_COUNTRY),
  currency_preference: normalizeCurrencyPreference(currencyPreference || userProfile?.currency_preference || DEFAULT_CURRENCY),
  full_name: userProfile?.full_name || '',
  phone: userProfile?.phone || ''
})

const getSettingsErrorMessage = (error) => {
  const message = error?.message || 'Unknown error'

  if (message.includes("'opening_time' column") || message.includes("'closing_time' column")) {
    return 'Shop opening and closing times are not ready in the system yet. Please finish updating the system and try again.'
  }

  if (message.includes("'is_manually_closed' column") || message.includes("'manually_closed_at' column") || message.includes("'manually_closed_by' column")) {
    return 'Manual shop open and close controls are not ready in the system yet. Please finish updating the system and try again.'
  }

  if (message.includes("'country_residence' column") || message.includes("'currency_preference' column")) {
    return 'Country and currency settings are not ready in the system yet. Please finish updating the system and try again.'
  }

  if (message.includes("'phone' column")) {
    return 'The account settings section is not fully set up yet. Please finish updating the system and try again.'
  }

  return getFriendlyErrorMessage(error)
}

const getMissingColumnName = (error) => {
  const message = String(error?.message || '')
  const match = message.match(/'([^']+)' column/)
  return match?.[1] || null
}

const Settings = () => {
  const { shops, userProfile, refreshData, themePreference, setThemePreference, countryResidence, setCountryResidence, currencyPreference, setCurrencyPreference } = useShop()
  const [savingShopId, setSavingShopId] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [selectedManagedShopId, setSelectedManagedShopId] = useState('')
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingShopHours, setIsEditingShopHours] = useState(false)
  const [profileDraft, setProfileDraft] = useState({
    avatar_url: '',
    theme_preference: 'light',
    country_residence: DEFAULT_COUNTRY,
    currency_preference: DEFAULT_CURRENCY,
    full_name: '',
    phone: ''
  })
  const [drafts, setDrafts] = useState(() => (
    Object.fromEntries(
      shops.map((shop) => [
        shop.id,
        {
          opening_time: shop.opening_time || DEFAULT_TIMES.opening_time,
          closing_time: shop.closing_time || DEFAULT_TIMES.closing_time
        }
      ])
    )
  ))

  React.useEffect(() => {
    setDrafts(
      Object.fromEntries(
        shops.map((shop) => [
          shop.id,
          {
            opening_time: shop.opening_time || DEFAULT_TIMES.opening_time,
            closing_time: shop.closing_time || DEFAULT_TIMES.closing_time
          }
        ])
      )
    )
  }, [shops])

  useEffect(() => {
    if (!shops.length) {
      setSelectedManagedShopId('')
      return
    }

    setSelectedManagedShopId((prev) => (
      shops.some((shop) => shop.id === prev) ? prev : shops[0].id
    ))
  }, [shops])

  useEffect(() => {
    setProfileDraft(buildProfileDraft({ userProfile, themePreference, countryResidence, currencyPreference }))
  }, [userProfile, themePreference, countryResidence, currencyPreference])

  useEffect(() => {
    setIsEditingShopHours(false)
  }, [selectedManagedShopId])

  if (userProfile?.role !== 'Owner') {
    return <div className="card">Access Denied. Only owners can manage shop settings.</div>
  }

  const saveSchedule = async (shopId) => {
    const draft = drafts[shopId]
    if (!draft?.opening_time || !draft?.closing_time) {
      alert('Please choose both opening and closing times.')
      return
    }

    setSavingShopId(shopId)
    try {
      const { error } = await supabase
        .from('shops')
        .update({
          opening_time: draft.opening_time,
          closing_time: draft.closing_time
        })
        .eq('id', shopId)

      if (error) throw error
      await refreshData()
      setIsEditingShopHours(false)
      alert('Operating hours saved.')
    } catch (error) {
      alert('Failed to save settings: ' + getSettingsErrorMessage(error))
    } finally {
      setSavingShopId(null)
    }
  }

  const handleProfileImageChange = async (event) => {
    const file = event.target.files?.[0]

    try {
      const avatarUrl = await fileToDataUrl(file)
      setProfileDraft((prev) => ({ ...prev, avatar_url: avatarUrl }))
      persistProfilePreferences(userProfile?.id, { avatar_url: avatarUrl })
    } catch (error) {
      alert(error.message)
    } finally {
      event.target.value = ''
    }
  }

  const saveProfileSettings = async () => {
    if (!userProfile?.id) return

    setSavingProfile(true)
    try {
      const nextTheme = profileDraft.theme_preference || 'light'
      const nextCountry = normalizeCountryResidence(profileDraft.country_residence || DEFAULT_COUNTRY)
      const nextCurrency = normalizeCurrencyPreference(profileDraft.currency_preference || DEFAULT_CURRENCY)
      persistProfilePreferences(userProfile.id, {
        avatar_url: profileDraft.avatar_url || null,
        theme_preference: nextTheme,
        country_residence: nextCountry,
        currency_preference: nextCurrency
      })

      const basePayload = {
        avatar_url: profileDraft.avatar_url || null,
        theme_preference: nextTheme,
        country_residence: nextCountry,
        currency_preference: nextCurrency,
        full_name: profileDraft.full_name,
        phone: profileDraft.phone.trim()
      }

      const updateProfileWithSupportedFields = async () => {
        const remainingPayload = { ...basePayload }
        let lastError = null

        while (Object.keys(remainingPayload).length > 0) {
          const { error } = await supabase
            .from('profiles')
            .update(remainingPayload)
            .eq('id', userProfile.id)

          if (!error) {
            return
          }

          lastError = error
          const missingColumn = getMissingColumnName(error)
          if (!missingColumn || !(missingColumn in remainingPayload)) {
            throw error
          }

          delete remainingPayload[missingColumn]
        }

        if (lastError) {
          throw lastError
        }
      }

      await updateProfileWithSupportedFields()

      setThemePreference(nextTheme)
      setCountryResidence(nextCountry)
      setCurrencyPreference(nextCurrency)
      await refreshData()
      setIsEditingProfile(false)
      alert('Profile settings saved.')
    } catch (error) {
      alert('Failed to save profile settings: ' + getSettingsErrorMessage(error))
    } finally {
      setSavingProfile(false)
    }
  }

  const previewTheme = (nextTheme) => {
    setProfileDraft((prev) => ({ ...prev, theme_preference: nextTheme }))
    setThemePreference(nextTheme)
    applyThemePreference(nextTheme)
    persistProfilePreferences(userProfile?.id, { theme_preference: nextTheme })
  }

  const handleCountryChange = (nextCountry) => {
    const country = normalizeCountryResidence(nextCountry)
    const currency = getCurrencyOptionByCountry(country).currency
    setProfileDraft((prev) => ({
      ...prev,
      country_residence: country,
      currency_preference: currency
    }))
    setCountryResidence(country)
    setCurrencyPreference(currency)
    persistProfilePreferences(userProfile?.id, {
      country_residence: country,
      currency_preference: currency
    })
  }

  const handleCurrencyChange = (nextCurrency) => {
    const currency = normalizeCurrencyPreference(nextCurrency)
    setProfileDraft((prev) => ({ ...prev, currency_preference: currency }))
    setCurrencyPreference(currency)
    persistProfilePreferences(userProfile?.id, { currency_preference: currency })
  }

  const toggleManualShopState = async (shop) => {
    const nextState = !shop.is_manually_closed
    setSavingShopId(shop.id)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('shops')
        .update({
          is_manually_closed: nextState,
          manually_closed_at: nextState ? new Date().toISOString() : null,
          manually_closed_by: nextState ? authData.user?.id || null : null
        })
        .eq('id', shop.id)

      if (error) throw error
      await refreshData()
      alert(nextState ? 'Shop closed manually.' : 'Shop reopened manually.')
    } catch (error) {
      alert('Failed to update shop status: ' + getSettingsErrorMessage(error))
    } finally {
      setSavingShopId(null)
    }
  }

  const managedShop = shops.find((shop) => shop.id === selectedManagedShopId) || null

  const cancelProfileEdit = () => {
    setProfileDraft(buildProfileDraft({ userProfile, themePreference, countryResidence, currencyPreference }))
    setIsEditingProfile(false)
  }

  const cancelShopHoursEdit = () => {
    setDrafts(
      Object.fromEntries(
        shops.map((shop) => [
          shop.id,
          {
            opening_time: shop.opening_time || DEFAULT_TIMES.opening_time,
            closing_time: shop.closing_time || DEFAULT_TIMES.closing_time
          }
        ])
      )
    )
    setIsEditingShopHours(false)
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Owners can switch themes, manage their profile picture, choose country-based currency display, and define each branch opening and closing time.
        </p>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)', gap: '24px' }} className="mobile-stack">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              {profileDraft.avatar_url ? (
                <img
                  src={profileDraft.avatar_url}
                  alt={userProfile?.full_name || 'Profile'}
                  style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)' }}
                />
              ) : (
                <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'var(--bg-main)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <UserCircle2 size={56} />
                </div>
              )}

              <label className="btn" style={{ border: '1px solid var(--border)', justifyContent: 'center', opacity: isEditingProfile ? 1 : 0.6, cursor: isEditingProfile ? 'pointer' : 'not-allowed' }}>
                <ImagePlus size={18} />
                <span>{profileDraft.avatar_url ? 'Change Photo' : 'Add Photo'}</span>
                <input type="file" accept="image/*" onChange={handleProfileImageChange} style={{ display: 'none' }} disabled={!isEditingProfile} />
              </label>

              {profileDraft.avatar_url && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setProfileDraft((prev) => ({ ...prev, avatar_url: '' }))
                    persistProfilePreferences(userProfile?.id, { avatar_url: null })
                  }}
                  disabled={!isEditingProfile}
                  style={{ border: '1px solid var(--border)', justifyContent: 'center' }}
                >
                  Remove Photo
                </button>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h3 style={{ margin: 0 }}>Profile & Appearance</h3>
                {!isEditingProfile ? (
                  <button type="button" className="btn" onClick={() => setIsEditingProfile(true)} style={{ border: '1px solid var(--border)' }}>
                    <Edit2 size={18} />
                    <span>Edit Details</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn" onClick={cancelProfileEdit} style={{ border: '1px solid var(--border)' }}>
                      <X size={18} />
                      <span>Cancel</span>
                    </button>
                    <button className="btn btn-primary" onClick={saveProfileSettings} disabled={savingProfile}>
                      <Save size={18} />
                      <span>{savingProfile ? 'Saving...' : 'Save Details'}</span>
                    </button>
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '18px' }}>
                Your saved profile picture appears in the header. Theme choice is saved to your account and applied immediately.
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '10px' }}>Theme Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                  {[
                    { value: 'light', label: 'Light Mode', icon: Sun },
                    { value: 'dark', label: 'Dark Mode', icon: Moon }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => previewTheme(option.value)}
                      className="btn"
                      style={{
                        justifyContent: 'center',
                        border: `1px solid ${profileDraft.theme_preference === option.value ? 'var(--primary)' : 'var(--border)'}`,
                        background: profileDraft.theme_preference === option.value ? 'rgba(184, 134, 11, 0.12)' : 'var(--bg-sidebar)',
                        color: profileDraft.theme_preference === option.value ? 'var(--text-main)' : 'var(--text-muted)'
                      }}
                    >
                      <option.icon size={18} />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Country of Residence</label>
                  <select
                    value={profileDraft.country_residence}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    disabled={!isEditingProfile}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  >
                    {COUNTRY_CURRENCY_OPTIONS.map((option) => (
                      <option key={option.country} value={option.country}>{option.country}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Display Currency</label>
                  <select
                    value={profileDraft.currency_preference}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    disabled={!isEditingProfile}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  >
                    {COUNTRY_CURRENCY_OPTIONS.map((option) => (
                      <option key={`${option.country}-${option.currency}`} value={option.currency}>{option.currency} ({option.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Your Name</label>
                <input
                  type="text"
                  value={profileDraft.full_name}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Enter your full name"
                  disabled={!isEditingProfile}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>WhatsApp Alert Number</label>
                <input
                  type="tel"
                  value={profileDraft.phone}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. +265991234567"
                  disabled={!isEditingProfile}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h3 style={{ margin: 0 }}>Branch Hours & Manual Closure</h3>
                {!isEditingShopHours && managedShop ? (
                  <button type="button" className="btn" onClick={() => setIsEditingShopHours(true)} style={{ border: '1px solid var(--border)' }}>
                    <Edit2 size={18} />
                    <span>Edit Hours</span>
                  </button>
                ) : null}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                Select one shop to manage its opening hours and manual open or close status.
              </p>
            </div>
            {managedShop && (
              <button
                className="btn"
                onClick={() => toggleManualShopState(managedShop)}
                disabled={savingShopId === managedShop.id}
                style={{
                  background: managedShop.is_manually_closed ? 'var(--surface-success-soft)' : 'var(--surface-warning-soft)',
                  border: `1px solid ${managedShop.is_manually_closed ? 'var(--border-success-soft)' : 'var(--border-warning-soft)'}`,
                  color: 'var(--text-main)'
                }}
              >
                {managedShop.is_manually_closed ? <Unlock size={18} /> : <Lock size={18} />}
                <span>{managedShop.is_manually_closed ? 'Reopen Shop' : 'Close Shop Now'}</span>
              </button>
            )}
          </div>

          {shops.length > 0 ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Select Shop</label>
                <select
                  value={selectedManagedShopId}
                  onChange={(e) => setSelectedManagedShopId(e.target.value)}
                  style={{ width: '100%', maxWidth: '360px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                >
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                  ))}
                </select>
              </div>

              {managedShop && (
                <>
                  <div style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-main)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{managedShop.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '8px' }}>{managedShop.location || 'No location set'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      Current manual status: {managedShop.is_manually_closed ? 'Closed by owner' : 'Following schedule'}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Opening Time</label>
                      <div style={{ position: 'relative' }}>
                        <Clock3 size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          type="time"
                          value={drafts[managedShop.id]?.opening_time || DEFAULT_TIMES.opening_time}
                          onChange={(e) => setDrafts((prev) => ({
                            ...prev,
                            [managedShop.id]: { ...prev[managedShop.id], opening_time: e.target.value }
                          }))}
                          disabled={!isEditingShopHours}
                          style={{ width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Closing Time</label>
                      <div style={{ position: 'relative' }}>
                        <Clock3 size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          type="time"
                          value={drafts[managedShop.id]?.closing_time || DEFAULT_TIMES.closing_time}
                          onChange={(e) => setDrafts((prev) => ({
                            ...prev,
                            [managedShop.id]: { ...prev[managedShop.id], closing_time: e.target.value }
                          }))}
                          disabled={!isEditingShopHours}
                          style={{ width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid var(--border)' }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                    {isEditingShopHours ? (
                      <>
                        <button type="button" className="btn" onClick={cancelShopHoursEdit} style={{ border: '1px solid var(--border)' }}>
                          <X size={18} />
                          <span>Cancel</span>
                        </button>
                        <button className="btn btn-primary" onClick={() => saveSchedule(managedShop.id)} disabled={savingShopId === managedShop.id}>
                          <Save size={18} />
                          <span>{savingShopId === managedShop.id ? 'Saving...' : 'Save Hours'}</span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No shops available yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
