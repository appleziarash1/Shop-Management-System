import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, LogIn, UserCircle, Store, Eye, EyeOff, ShieldCheck, AlertTriangle, Timer } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import managerLogo from '../assets/manager.png'
import { validatePassword, getStrengthMeta, assertPasswordPolicy, PASSWORD_RULES } from '../lib/passwordPolicy'
import { sanitizeEmail, sanitizeName } from '../lib/sanitize'
import {
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulLogin,
  formatCountdown,
  buildLockoutMessage,
} from '../lib/loginRateLimit'

const buildDisplayName = (user, fallbackFullName = '') => {
  const trimmedFallback = fallbackFullName.trim()
  if (trimmedFallback) return trimmedFallback

  const metadataName = String(user?.user_metadata?.full_name || '').trim()
  if (metadataName) return metadataName

  const emailName = String(user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim()
  return emailName || 'Shop Owner'
}

const Login = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  // Tabs: Owner vs Staff
  const [isStaffLogin, setIsStaffLogin] = useState(false)
  // Owner Sub-tabs: Sign In vs Sign Up
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Form Fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [shopName, setShopName] = useState('')
  
  // Staff Specific
  const [staffName, setStaffName] = useState('')
  const [branchName, setBranchName] = useState('')

  // Password visibility toggles
  const [showPassword,        setShowPassword]        = useState(false)
  const [showNewPassword,     setShowNewPassword]     = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // ── Live password strength (for signup + reset forms) ──────────
  const signupStrength = useMemo(() => validatePassword(password),    [password])
  const resetStrength  = useMemo(() => validatePassword(newPassword), [newPassword])

  // ── Rate-limit / lockout state ─────────────────────────────
  const [isLockedOut,     setIsLockedOut]     = useState(false)
  const [lockoutMs,       setLockoutMs]       = useState(0)   // ms remaining
  const [failedAttempts,  setFailedAttempts]  = useState(0)   // visual count
  const [delayActive,     setDelayActive]     = useState(false) // progressive delay in progress
  const countdownRef = useRef(null)

  /** Re-check lockout state whenever the identifier fields change. */
  const getIdentifier = useCallback(() => {
    if (isStaffLogin) {
      return `${staffName.toLowerCase().replace(/\s/g, '')}.${branchName.toLowerCase().replace(/\s/g, '')}@sms.com`
    }
    return (email || '').toLowerCase().trim()
  }, [isStaffLogin, staffName, branchName, email])

  /** Start a live countdown timer when locked out. */
  const startCountdown = useCallback((msRemaining) => {
    setIsLockedOut(true)
    setLockoutMs(msRemaining)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setLockoutMs((prev) => {
        const next = prev - 1000
        if (next <= 0) {
          clearInterval(countdownRef.current)
          setIsLockedOut(false)
          setFailedAttempts(0)
          setError(null)
          return 0
        }
        return next
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('mode') === 'reset') {
      setIsForgotPassword(false)
      setIsSignUp(false)
      setIsStaffLogin(false)
      setIsResetPasswordMode(true)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setError(null)
        setResetSent(false)
        setIsForgotPassword(false)
        setIsSignUp(false)
        setIsStaffLogin(false)
        setIsResetPasswordMode(true)
      } else if (event === 'SIGNED_IN' && session) {
        // Handle OAuth sign-in (e.g., Google)
        try {
          const profile = await ensureOwnerProfile(session.user)
          if (profile?.role === 'Owner') {
            navigate('/dashboard')
          } else {
            navigate('/sales')
          }
        } catch (err) {
          setError(getFriendlyErrorMessage(err))
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const ensureOwnerProfile = async (user, fallbackFullName = '') => {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (existingProfileError) throw existingProfileError
    if (existingProfile) return existingProfile

    const profilePayload = {
      id: user.id,
      full_name: buildDisplayName(user, fallbackFullName),
      role: 'Owner'
    }

    const { data: createdProfile, error: createProfileError } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('*')
      .single()

    if (createProfileError) throw createProfileError
    return createdProfile
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const nameRegex = /^[a-zA-Z\s]+$/
    
    // ── Input Sanitization ──────────────────────────────────────
    const cleanEmail     = sanitizeEmail(email)
    const cleanFullName  = sanitizeName(fullName)
    const cleanStaffName = sanitizeName(staffName)
    const cleanBranch    = sanitizeName(branchName)
    const cleanShopName  = sanitizeName(shopName)

    const identifier = isStaffLogin 
      ? `${cleanStaffName.toLowerCase().replace(/\s/g, '')}.${cleanBranch.toLowerCase().replace(/\s/g, '')}@sms.com`
      : cleanEmail.toLowerCase().trim()

    // ── 1. PRE-CHECK: is this identifier currently locked out? ──
    const rlCheck = checkRateLimit(identifier)
    if (!rlCheck.allowed) {
      startCountdown(rlCheck.msRemaining)
      setError(buildLockoutMessage(rlCheck.msRemaining))
      setLoading(false)
      return
    }

    try {
      if (isStaffLogin) {
        if (!nameRegex.test(staffName)) {
          throw new Error('Staff name should only contain letters and spaces.')
        }
        // Staff Login: map to pseudo-email
        const staffEmail = identifier
        const { data: { user }, error } = await supabase.auth.signInWithPassword({ email: staffEmail, password })
        if (error) throw error
        // ── Success: clear rate-limit counter ──
        recordSuccessfulLogin(identifier)
        setFailedAttempts(0)
        
        // Fetch profile to determine redirect
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role === 'Cashier' || profile?.role === 'Manager') {
          navigate('/sales')
        } else {
          navigate('/dashboard')
        }
      } else if (isSignUp) {
        if (!nameRegex.test(fullName)) {
          throw new Error('Full name should only contain letters and spaces.')
        }
        // ── Enforce strong password policy before calling Supabase ──
        assertPasswordPolicy(password)
        // Owner Sign Up
        const { data: authData, error: authError } = await supabase.auth.signUp({ 
          email: cleanEmail, 
          password,
          options: { data: { full_name: cleanFullName } }
        })
        if (authError) {
          const duplicateAccount =
            authError.message?.toLowerCase().includes('already registered') ||
            authError.message?.toLowerCase().includes('already been registered')

          if (!duplicateAccount) throw authError

          const { data: existingAuthData, error: existingSignInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
          if (existingSignInError) {
            throw new Error('This email is already registered. Sign in with your password or use Forgot Password to reset it.')
          }

          const repairedProfile = await ensureOwnerProfile(existingAuthData.user, cleanFullName)
          await ensureOwnerShop(existingAuthData.user.id, cleanShopName)
          if (repairedProfile.role === 'Owner') {
            navigate('/dashboard')
          } else {
            navigate('/sales')
          }
          return
        }

        await ensureOwnerShop(authData.user.id, shopName)

        if (authData.session) {
          if (ownerProfile.role === 'Owner') {
            navigate('/dashboard')
          } else {
            navigate('/sales')
          }
        } else {
          alert('Account created! Please log in.')
          setIsSignUp(false)
        }
      } else {
        // Owner Login
        const { data: { user }, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (error) throw error
        // ── Success: clear rate-limit counter ──
        recordSuccessfulLogin(identifier)
        setFailedAttempts(0)
        const profile = await ensureOwnerProfile(user)
        if (profile?.role === 'Owner') {
          navigate('/dashboard')
        } else {
          navigate('/sales')
        }
      }
    } catch (err) {
      // ── Record failure + apply progressive delay ──
      if (!isSignUp) {
        setDelayActive(true)
        const result = await recordFailedAttempt(identifier)
        setDelayActive(false)
        setFailedAttempts(result.attempt)
        if (result.isLockedOut) {
          startCountdown(10 * 60 * 1000) // 10-minute lockout
        }
      }
      setError(getFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?mode=reset`,
      })
      if (error) throw error
      setResetSent(true)
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // ── Enforce strong password policy before calling Supabase ──
      assertPasswordPolicy(newPassword)
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match.')
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })
      if (error) throw error

      await supabase.auth.signOut()
      setNewPassword('')
      setConfirmPassword('')
      setIsResetPasswordMode(false)
      setResetSent(false)
      setEmail('')
      setPassword('')
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      const url = new URL(window.location.href)
      url.searchParams.delete('mode')
      window.history.replaceState({}, '', url.pathname)
      alert('Password updated successfully. Please sign in with your new password.')
    } catch (err) {
      setError(getFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Reusable password strength UI ──────────────────────────────
  const PasswordStrengthMeter = ({ value }) => {
    if (!value) return null
    const { score, results } = validatePassword(value)
    const meta = getStrengthMeta(score)
    const pct  = (score / PASSWORD_RULES.length) * 100
    return (
      <div style={{ marginTop: '10px' }}>
        {/* Animated strength bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--surface-muted)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`, background: meta.color,
              borderRadius: '3px', transition: 'width 0.35s ease, background 0.35s ease',
            }} />
          </div>
          {meta.label && (
            <span style={{ fontSize: '11px', fontWeight: '700', color: meta.color, minWidth: '70px', textAlign: 'right' }}>
              {meta.label}
            </span>
          )}
        </div>
        {/* Rule checklist */}
        <div style={{
          padding: '10px 12px', borderRadius: '10px', background: 'var(--surface-muted)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px',
        }}>
          {results.map((r) => (
            <span key={r.id} style={{
              fontSize: '11px', fontWeight: '500',
              color: r.passed ? 'var(--success)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}>
              <span style={{ fontSize: '13px' }}>{r.passed ? '✅' : '○'}</span>
              {r.label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', padding: '16px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ marginBottom: '4px' }}>
            <img
              src={managerLogo}
              alt="Shop Manager Log In"
              className="login-logo"
            />
          </div>
          <h2 style={{ fontSize: '24px', margin: '0 0 4px 0', lineHeight: '1.2' }}>
            {isResetPasswordMode ? 'Create New Password' : (isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : (isStaffLogin ? 'Staff Login' : 'Owner Login')))}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '0', fontSize: '13px', lineHeight: '1.4' }}>
            {isResetPasswordMode
              ? 'Enter your new password below to finish resetting your account'
              : (isForgotPassword 
              ? 'Enter your email to receive a reset link' 
              : (isSignUp ? 'Start managing your shops today' : 'Access your shop dashboard'))}
          </p>
        </div>

        {/* Role Toggle */}
        {!isSignUp && !isForgotPassword && (
          <div style={{ display: 'flex', background: 'var(--surface-muted)', padding: '4px', borderRadius: '8px', marginBottom: '20px' }}>
            <button 
              onClick={() => setIsStaffLogin(false)}
              style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: !isStaffLogin ? 'var(--surface-elevated)' : 'transparent', color: 'var(--text-main)', fontWeight: !isStaffLogin ? '600' : '500', boxShadow: !isStaffLogin ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              Shop Owner
            </button>
            <button 
              onClick={() => setIsStaffLogin(true)}
              style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', background: isStaffLogin ? 'var(--surface-elevated)' : 'transparent', color: 'var(--text-main)', fontWeight: isStaffLogin ? '600' : '500', boxShadow: isStaffLogin ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              Staff Member
            </button>
          </div>
        )}

        {/* Google Sign-In Button */}


        {/* ── LOCKOUT BANNER ─────────────────────────────────── */}
        {isLockedOut && (
          <div style={{
            padding: '16px', borderRadius: '12px', marginBottom: '16px',
            background: 'rgba(196,28,59,0.08)', border: '1px solid rgba(196,28,59,0.25)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)' }}>
              <AlertTriangle size={20} />
              <span style={{ fontWeight: '700', fontSize: '15px' }}>Account Temporarily Locked</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
              Too many failed attempts. Please wait before trying again.
            </p>
            {/* Live countdown ring */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 20px', borderRadius: '30px',
              background: 'rgba(196,28,59,0.12)', color: 'var(--danger)',
            }}>
              <Timer size={16} />
              <span style={{ fontWeight: '800', fontSize: '18px', fontVariantNumeric: 'tabular-nums', minWidth: '64px', textAlign: 'center' }}>
                {formatCountdown(lockoutMs)}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Lockout resets automatically when the timer reaches zero.
            </p>
          </div>
        )}

        {/* ── PROGRESSIVE DELAY INDICATOR ─────────────────────── */}
        {delayActive && (
          <div style={{
            padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
            background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.25)',
            display: 'flex', alignItems: 'center', gap: '8px',
            color: '#b45309', fontSize: '13px', fontWeight: '600',
          }}>
            <Timer size={15} />
            Verifying credentials… please wait.
          </div>
        )}

        {/* ── FAILED-ATTEMPT WARNING STRIP ────────────────────── */}
        {!isLockedOut && failedAttempts > 0 && failedAttempts < 5 && (
          <div style={{
            padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
            background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', color: '#92400e',
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>
              <strong>{failedAttempts}</strong> of 5 failed attempt{failedAttempts > 1 ? 's' : ''}.{' '}
              {5 - failedAttempts} attempt{5 - failedAttempts !== 1 ? 's' : ''} remaining before lockout.
            </span>
          </div>
        )}

        {/* ── GENERIC ERROR ────────────────────────────────────── */}
        {error && !isLockedOut && (
          <div style={{ padding: '12px', background: 'rgba(220, 53, 69, 0.08)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', textAlign: 'center', border: '1px solid rgba(220,53,69,0.18)' }}>
            {error}
            {error.includes('rate limit') && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-main)', opacity: 0.8 }}>
                Tip: Disable "Confirm Email" in your Supabase Auth settings to avoid this during development.
              </div>
            )}
          </div>
        )}

        {isResetPasswordMode ? (
          <form onSubmit={handleUpdatePassword}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>New Password</label>
              <div style={{ position: 'relative' }}>
                <Lock style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 44px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  required
                />
                <button type="button" onClick={() => setShowNewPassword(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrengthMeter value={newPassword} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <Lock style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 44px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  required
                />
                <button type="button" onClick={() => setShowConfirmPassword(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* Match indicator */}
              {confirmPassword && (
                <p style={{ fontSize: '12px', marginTop: '6px', color: newPassword === confirmPassword ? 'var(--success)' : 'var(--danger)', fontWeight: '600' }}>
                  {newPassword === confirmPassword ? '✅ Passwords match' : '✗ Passwords do not match'}
                </p>
              )}
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
              disabled={loading || !resetStrength.passed || newPassword !== confirmPassword}>
              {loading ? 'Updating...' : <><ShieldCheck size={18} /><span>Save New Password</span></>}
            </button>
          </form>
        ) : resetSent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ padding: '20px', background: 'rgba(34, 139, 34, 0.1)', color: 'var(--success)', borderRadius: '8px', marginBottom: '24px' }}>
              Reset link sent! Please check your email inbox.
              <div style={{ marginTop: '12px', fontSize: '12px', opacity: 0.8 }}>
                Tip: If you don't see the email, check your spam folder or ensure your Supabase SMTP is configured.
              </div>
            </div>
            <button 
              onClick={() => {
                setIsForgotPassword(false)
                setResetSent(false)
              }}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Back to Login
            </button>
          </div>
        ) : isForgotPassword ? (
          <form onSubmit={handleResetPassword}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input 
                  type="email" 
                  placeholder="admin@shop.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  required 
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }} disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button 
              type="button"
              onClick={() => setIsForgotPassword(false)}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', marginTop: '16px', cursor: 'pointer', fontSize: '14px' }}
            >
              Back to Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleAuth}>
            {isStaffLogin ? (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Staff Name</label>
                  <div style={{ position: 'relative' }}>
                    <UserCircle style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                    <input 
                      type="text" 
                      placeholder="Enter your name" 
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                      required 
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Shop Branch</label>
                  <div style={{ position: 'relative' }}>
                    <Store style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                    <input 
                      type="text" 
                      placeholder="e.g. Limbe" 
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                      required 
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {isSignUp && (
                  <>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Full Name</label>
                      <input 
                        type="text" 
                        placeholder="Your Name" 
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                        required 
                      />
                    </div>
                  </>
                )}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                    <input 
                      type="email" 
                      placeholder="admin@shop.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                      required 
                    />
                  </div>
                </div>
                {isSignUp && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Initial Shop Name</label>
                    <input 
                      type="text" 
                      placeholder="My First Shop" 
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                      required 
                    />
                  </div>
                )}
              </>
            )}

            <div style={{ marginBottom: isSignUp ? '8px': '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                <input 
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 44px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  required 
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {/* Show meter only on Sign Up */}
              {isSignUp && <PasswordStrengthMeter value={password} />}
            </div>

            {!isSignUp && !isStaffLogin && (
              <div style={{ textAlign: 'right', marginBottom: '16px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsForgotPassword(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '14px', cursor: 'pointer' }}
                >
                  Forgot Password?
                </button>
              </div>
            )}
            <button type="submit" className="btn btn-primary" 
              style={{
                width: '100%', justifyContent: 'center', padding: '14px', marginTop: isSignUp ? '8px' : '0',
                opacity: (isLockedOut || delayActive) ? 0.6 : 1,
                cursor: (isLockedOut || delayActive) ? 'not-allowed' : 'pointer',
              }} 
              disabled={loading || delayActive || isLockedOut || (isSignUp && !signupStrength.passed)}>
              {isLockedOut ? (
                <><Timer size={18} /><span>Locked — {formatCountdown(lockoutMs)}</span></>
              ) : delayActive ? (
                <><Timer size={18} /><span>Please wait…</span></>
              ) : loading ? 'Processing...' : (
                <>
                  <LogIn size={20} />
                  <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Google Sign-In Button (moved below form) */}
        {!isStaffLogin && !isForgotPassword && !isResetPasswordMode && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              <span>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>
            <button 
              onClick={handleGoogleSignIn} 
              className="btn" 
              style={{ 
                width: '100%', 
                justifyContent: 'center', 
                padding: '14px', 
                background: 'var(--surface-elevated)', 
                color: 'var(--text-main)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }} 
              disabled={loading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
            </button>
          </div>
        )}

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          {!isStaffLogin && !isForgotPassword && (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {isSignUp ? 'Already have an account?' : 'Need to grow your business?'} 
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: '600', cursor: 'pointer', marginLeft: '5px' }}
              >
                {isSignUp ? 'Sign In' : 'Create Account'}
              </button>
            </p>
          )}
          {isStaffLogin && !isForgotPassword && (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Login with name and branch provided by your manager.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
