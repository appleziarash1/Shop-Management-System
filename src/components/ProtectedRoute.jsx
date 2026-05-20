import React, { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useShop } from '../context/ShopContext'
import { canAccessRoute } from '../lib/roles'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import managerLogo from '../assets/manager.png'

const ProtectedRoute = ({ children }) => {
  const { userProfile, loading, initialLoading } = useShop()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Only redirect if NOT booting AND NOT currently fetching data
    if (!initialLoading && !loading && !userProfile) {
      navigate('/login', { replace: true })
    }
  }, [initialLoading, loading, userProfile, navigate])

  if (initialLoading || (!userProfile && loading)) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '112px',
              height: '112px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(184, 134, 11, 0.18), rgba(184, 134, 11, 0.05))',
              border: '1px solid rgba(184, 134, 11, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 18px 40px rgba(184, 134, 11, 0.18)',
              animation: 'pulse 1.5s infinite'
            }}
          >
            <img
              src={managerLogo}
              alt="Loading..."
              style={{
                width: '72px',
                height: '72px',
                objectFit: 'contain',
                borderRadius: '18px'
              }}
            />
          </div>
          <style>{`
            @keyframes pulse { 
              0% { opacity: 0.6; transform: scale(0.95); } 
              50% { opacity: 1; transform: scale(1.05); } 
              100% { opacity: 0.6; transform: scale(0.95); } 
            }
          `}</style>
        </div>
      </div>
    )
  }

  // ── RBAC ENFORCEMENT ─────────────────────────────────────────
  if (userProfile) {
    // Get path without leading slash
    const path = location.pathname.split('/')[1] || 'dashboard'
    if (!canAccessRoute(userProfile.role, path)) {
      return (
        <div style={{ 
          height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', 
          background: 'var(--bg-main)', padding: '20px' 
        }}>
          <div className="card" style={{ maxWidth: '400px', textAlign: 'center', padding: '40px' }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444',
              margin: '0 auto 20px'
            }}>
              <ShieldAlert size={32} />
            </div>
            <h2 style={{ fontSize: '24px', marginBottom: '12px' }}>Access Denied</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px', lineHeight: 1.6 }}>
              You don't have permission to access the <strong>{path}</strong> section. 
              Please contact your administrator if you believe this is an error.
            </p>
            <button 
              onClick={() => navigate(-1)} 
              className="btn"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto' }}
            >
              <ArrowLeft size={18} />
              Go Back
            </button>
          </div>
        </div>
      )
    }
  }

  return userProfile ? children : null
}

export default ProtectedRoute
