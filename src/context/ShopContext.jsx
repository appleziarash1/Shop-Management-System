import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { format } from 'date-fns'
import { isManagementRole } from '../lib/roles'
import { getShopAccessStatus } from '../lib/shopAccess'
import { applyThemePreference, persistThemePreference, readStoredThemePreference } from '../lib/theme'
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, formatCurrencyValue, normalizeCountryResidence, normalizeCurrencyPreference } from '../lib/currency'
import { readStoredProfilePreferences } from '../lib/profilePreferences'
import { syncManager } from '../lib/syncManager'
import { processSyncQueue } from '../lib/offlineQueue'
import { syncLowStockAlerts } from '../lib/lowStockAlerts'
import { createSession, closeSession, getActiveSession, logAuditEvent as _logAuditEvent } from '../lib/auditSession'

const ShopContext = createContext()

export const ShopProvider = ({ children }) => {
  const [shops, setShops] = useState([])
  const [currentShop, setCurrentShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [lowStockItems, setLowStockItems] = useState([])
  const [dueSalaries, setDueSalaries] = useState([])
  const [closureMap, setClosureMap] = useState({})
  const [clock, setClock] = useState(() => new Date())
  const hasInitialFetchStarted = useRef(false)
  const [themePreference, setThemePreference] = useState(() => readStoredThemePreference())
  const [countryResidence, setCountryResidence] = useState(DEFAULT_COUNTRY)
  const [currencyPreference, setCurrencyPreference] = useState(DEFAULT_CURRENCY)
  // ── Audit / Session state ────────────────────────────────────
  const [activeSession, setActiveSession] = useState(null)
  const activeSessionRef = useRef(null) // always in sync for callback closures

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    applyThemePreference(themePreference)
    persistThemePreference(themePreference)
  }, [themePreference])

  const fetchUserData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setIsRefreshing(true)
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) throw sessionError

      const user = session?.user
      
      if (user) {
        const localProfilePreferences = readStoredProfilePreferences(user.id)
        // Fetch profile
        const { data: profile, error: pError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        
        if (pError && pError.code !== 'PGRST116') throw pError
        const mergedProfile = profile ? {
          ...profile,
          avatar_url: localProfilePreferences.avatar_url ?? profile.avatar_url ?? null,
          theme_preference: localProfilePreferences.theme_preference || profile.theme_preference || readStoredThemePreference(),
          country_residence: localProfilePreferences.country_residence || profile.country_residence || DEFAULT_COUNTRY,
          currency_preference: localProfilePreferences.currency_preference || profile.currency_preference || DEFAULT_CURRENCY
        } : null

        setUserProfile(mergedProfile)
        setThemePreference(mergedProfile?.theme_preference || readStoredThemePreference())
        setCountryResidence(normalizeCountryResidence(mergedProfile?.country_residence || DEFAULT_COUNTRY))
        setCurrencyPreference(normalizeCurrencyPreference(mergedProfile?.currency_preference || DEFAULT_CURRENCY))

        if (mergedProfile) {
          const isAdminOrOwner = isManagementRole(mergedProfile.role)
          
          if (isAdminOrOwner) {
            const { data: shopData } = await supabase
              .from('shops')
              .select('*')
              .eq('owner_id', user.id)
            
            setShops(shopData || [])
            if (shopData?.length > 0) {
              setCurrentShop(prev => {
                const stillExists = shopData.find(s => s.id === prev?.id)
                return stillExists || shopData[0]
              })
            }
            fetchLowStock(user.id, mergedProfile, shopData || [])
          } else if (profile.shop_id) {
            const { data: shopData } = await supabase
              .from('shops')
              .select('*')
              .eq('id', profile.shop_id)
              .single()
            
            setShops(shopData ? [shopData] : [])
            setCurrentShop(shopData)
            fetchLowStock(user.id, mergedProfile, shopData ? [shopData] : [])
          }
        } else {
          // No profile found for user
          setUserProfile(null)
          setThemePreference(readStoredThemePreference())
          setCountryResidence(DEFAULT_COUNTRY)
          setCurrencyPreference(DEFAULT_CURRENCY)
          setShops([])
          setCurrentShop(null)
        }
      } else {
        // No session
        setShops([])
        setCurrentShop(null)
        setUserProfile(null)
        setThemePreference(readStoredThemePreference())
        setCountryResidence(DEFAULT_COUNTRY)
        setCurrencyPreference(DEFAULT_CURRENCY)
      }
    } catch (error) {
      console.error('Fetch user data error:', error)
      // Clear state on error to avoid stale data
      setShops([])
      setCurrentShop(null)
      setUserProfile(null)
      setThemePreference(readStoredThemePreference())
      setCountryResidence(DEFAULT_COUNTRY)
      setCurrencyPreference(DEFAULT_CURRENCY)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!hasInitialFetchStarted.current) {
      console.log('Mount: Initial fetch starting...')
      fetchUserData()
      hasInitialFetchStarted.current = true
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event)
      if (session) {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Always fetch on explicit login to ensure profile is loaded
          await fetchUserData()
        } else if (event === 'INITIAL_SESSION' && !hasInitialFetchStarted.current) {
          // Only fetch on boot if mount didn't already start it
          await fetchUserData()
          hasInitialFetchStarted.current = true
        }
      } else if (event === 'SIGNED_OUT') {
        // ── Fallback cleanup for SIGNED_OUT ──────────────────
        // This is a safety catch for when signOut is called directly
        // or token expires. Note: closeSession might fail here due to RLS
        // if user is already signed out.
        if (activeSessionRef.current) {
          closeSession(activeSessionRef.current.id).catch(() => {})
          setActiveSession(null)
          activeSessionRef.current = null
        }
        setShops([])
        setCurrentShop(null)
        setUserProfile(null)
        setClosureMap({})
        setLoading(false)
        setInitialLoading(false)
        hasInitialFetchStarted.current = false 
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchUserData])

  const showSuccess = (message) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 3500)
  }

  const fetchLowStock = async (userId, profile, knownShops = null) => {
    try {
      let pQuery = supabase.from('products').select('*, shops(name)')
      const isAdminOrOwner = isManagementRole(profile.role)
      let ownerShops = knownShops || []
      
      if (isAdminOrOwner) {
        if (!knownShops) {
          const { data: fetchedOwnerShops } = await supabase.from('shops').select('id, name').eq('owner_id', userId)
          ownerShops = fetchedOwnerShops || []
        }

        const shopIds = ownerShops.map(s => s.id)
        pQuery = pQuery.in('shop_id', shopIds)
      } else {
        pQuery = pQuery.eq('shop_id', profile.shop_id)
      }
      
      const { data } = await pQuery
      const lowStock = data?.filter(p => p.quantity <= p.min_quantity) || []
      setLowStockItems(lowStock)

      if (isAdminOrOwner) {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const { data: salaryData } = await supabase
          .from('staff_salaries')
          .select('*, shops(name)')
          .eq('is_settled', false)
          .lte('due_date', todayStr)
          .in('shop_id', ownerShops.map(s => s.id))
        
        setDueSalaries(salaryData || [])
      }

      if (isAdminOrOwner && profile.phone && ownerShops.length) {
        syncLowStockAlerts({
          ownerId: userId,
          ownerPhone: profile.phone,
          shops: ownerShops
        }).catch((error) => {
          console.warn('Low stock alert sync skipped:', error?.message || error)
        })
      }
    } catch (error) {
      console.error('Error fetching low stock:', error)
    }
  }

  const refreshClosures = useCallback(async (shopId = currentShop?.id) => {
    if (!shopId || shopId === 'all') return
    try {
      const { data, error } = await supabase
        .from('daily_closures')
        .select('*')
        .eq('shop_id', shopId)

      if (error) throw error

      const nextMap = {}
      ;(data || []).forEach((closure) => {
        nextMap[closure.closing_date] = closure
      })

      setClosureMap((prev) => ({ ...prev, [shopId]: nextMap }))
    } catch (error) {
      console.error('Error fetching closures:', error)
    }
  }, [currentShop?.id])

  useEffect(() => {
    if (currentShop?.id && currentShop.id !== 'all') {
      refreshClosures(currentShop.id)
      // Sync all shop data to IndexedDB for offline use
      syncManager.syncAllData(currentShop.id)
    }
  }, [currentShop?.id, userProfile?.id, refreshClosures])

  // ── Session: open/refresh when shop or user changes ──────────
  useEffect(() => {
    if (!userProfile?.id || !currentShop?.id || currentShop.id === 'all') return

    let cancelled = false
    const initSession = async () => {
      // Check if there's already an active session (e.g. page refresh)
      let session = await getActiveSession(userProfile.id, currentShop.id)

      if (!session) {
        // Create a new session (happens on first login or after logout)
        session = await createSession(userProfile, currentShop.id)
        if (session) {
          // Log the LOGIN event
          await _logAuditEvent({
            shopId:      currentShop.id,
            actionType:  'LOGIN',
            profile:     userProfile,
            sessionId:   session.id,
            description: `${userProfile.full_name || 'Employee'} logged in`,
          })
        }
      }

      if (!cancelled && session) {
        setActiveSession(session)
        activeSessionRef.current = session
      }
    }

    initSession()
    return () => { cancelled = true }
  }, [userProfile?.id, currentShop?.id])

  // Periodic background sync of offline sales if online
  useEffect(() => {
    const handleOnline = () => {
      console.log('App is back online - triggering sync queue...');
      processSyncQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [])

  const isDateClosed = (shopId, date) => {
    if (!shopId || !date) return false
    return Boolean(closureMap[shopId]?.[date])
  }

  const closeDay = async ({ shopId, date, summary = {} }) => {
    const { error } = await supabase.from('daily_closures').insert([{
      shop_id: shopId,
      closing_date: date,
      total_sales: Number(summary.totalSales || 0),
      total_expenses: Number(summary.totalExpenses || 0),
      net_profit: Number(summary.netProfit || 0),
      closed_by: userProfile?.id || null
    }])

    if (error) throw error
    await refreshClosures(shopId)
  }

  const unlockDay = async ({ shopId, date }) => {
    const { error } = await supabase
      .from('daily_closures')
      .delete()
      .eq('shop_id', shopId)
      .eq('closing_date', date)

    if (error) throw error
    await refreshClosures(shopId)
  }

  /**
   * Convenience wrapper so any page can log audit events without
   * importing auditSession directly. Automatically injects shopId,
   * profile, and sessionId from context.
   */
  const logAuditEvent = useCallback(async ({ actionType, description, metadata }) => {
    if (!userProfile || !currentShop?.id || currentShop.id === 'all') return
    await _logAuditEvent({
      shopId:     currentShop.id,
      actionType,
      profile:    userProfile,
      sessionId:  activeSessionRef.current?.id || null,
      description,
      metadata,
    })
  }, [userProfile, currentShop?.id])

  const today = format(new Date(), 'yyyy-MM-dd')
  const isCurrentDayClosed = currentShop?.id && currentShop.id !== 'all'
    ? isDateClosed(currentShop.id, today)
    : false
  const currentShopAccess = getShopAccessStatus(currentShop, clock)
  const canModifyCurrentShop = currentShopAccess.canModify
  const shopAccessMessage = currentShopAccess.reason
  const formatCurrency = (value, options) => formatCurrencyValue(value, currencyPreference, options)

  const logout = async () => {
    try {
      // Immediate UI response: stop any loading and clear profile
      setLoading(false)
      setInitialLoading(false)

      // 1. Log the LOGOUT audit event (while still authenticated)
      if (userProfile && currentShop?.id && currentShop.id !== 'all') {
        try {
          await _logAuditEvent({
            shopId:     currentShop.id,
            actionType:  'LOGOUT',
            profile:     userProfile,
            sessionId:   activeSessionRef.current?.id || null,
            description: `${userProfile.full_name || 'Employee'} logged out`,
          })
        } catch (auditErr) { console.warn('Audit logout failed:', auditErr) }
      }

      // 2. Close active session in DB (while still authenticated)
      if (activeSessionRef.current) {
        try {
          await closeSession(activeSessionRef.current.id)
        } catch (sessionErr) { console.warn('Close session failed:', sessionErr) }
        setActiveSession(null)
        activeSessionRef.current = null
      }

      // 3. Clear local state (immediate response)
      setShops([])
      setCurrentShop(null)
      setUserProfile(null)
      setClosureMap({})
      hasInitialFetchStarted.current = false

      // 4. Finally sign out (this triggers onAuthStateChange fallback too)
      await supabase.auth.signOut()

    } catch (error) {
      console.error('[ShopContext] Error during logout:', error)
    } finally {
      // Always ensure loading is killed
      setLoading(false)
      setInitialLoading(false)
    }
  }

  return (
    <ShopContext.Provider value={{ 
      shops, 
      currentShop, 
      setCurrentShop, 
      loading, 
      userProfile, 
      lowStockItems,
      dueSalaries,
      themePreference,
      setThemePreference,
      countryResidence,
      setCountryResidence,
      currencyPreference,
      setCurrencyPreference,
      formatCurrency,
      closureMap,
      isDateClosed,
      isCurrentDayClosed,
      currentShopAccess,
      canModifyCurrentShop,
      shopAccessMessage,
      refreshClosures,
      closeDay,
      unlockDay,
      refreshData: (silent = false) => fetchUserData(silent),
      refreshLowStock: () => userProfile && fetchLowStock(userProfile.id, userProfile),
      initialLoading,
      isRefreshing,
      successMessage,
      showSuccess,
      // ── Audit / Session ────────────────────────────────────
      activeSession,
      logAuditEvent,
      logout,
    }}>
      {children}
    </ShopContext.Provider>
  )
}

export const useShop = () => {
  const context = useContext(ShopContext)
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider')
  }
  return context
}
