import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Products from './pages/Products'
import Sales from './pages/Sales'
import Purchases from './pages/Purchases'
import Customers from './pages/Customers'
import Suppliers from './pages/Suppliers'
import Reports from './pages/Reports'
import Staff from './pages/Staff'
import Shops from './pages/Shops'
import Services from './pages/Services'
import CustomerCredit from './pages/CustomerCredit'
import Deliveries from './pages/Deliveries'
import Expenses from './pages/Expenses'
import Settings from './pages/Settings'
import AuditDashboard from './pages/AuditDashboard'

import { ShopProvider } from './context/ShopContext'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  const [alertMessage, setAlertMessage] = useState('')
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => {
    let timeoutId

    const handleAlert = (event) => {
      const nextMessage = event?.detail?.message ? String(event.detail.message) : ''
      if (!nextMessage) return

      setAlertMessage(nextMessage)
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => setAlertMessage(''), 3500)
    }

    const handleConfirm = (event) => {
      const message = event?.detail?.message ? String(event.detail.message) : ''
      const resolve = event?.detail?.resolve
      if (!message || typeof resolve !== 'function') return
      setConfirmState({ message, resolve })
    }

    window.addEventListener('shopms:alert', handleAlert)
    window.addEventListener('shopms:confirm', handleConfirm)
    return () => {
      window.removeEventListener('shopms:alert', handleAlert)
      window.removeEventListener('shopms:confirm', handleConfirm)
      window.clearTimeout(timeoutId)
    }
  }, [])

  const handleConfirmDecision = (decision) => {
    if (!confirmState) return
    confirmState.resolve(decision)
    setConfirmState(null)
  }

  return (
    <ShopProvider>
      {alertMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          animation: 'slideDown 0.4s ease-out'
        }}>
          <div style={{
            background: '#1f2937',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '50px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 10px 25px rgba(31, 41, 55, 0.3)',
            fontWeight: '600',
            fontSize: '15px'
          }}>
            <AlertCircle size={20} />
            {alertMessage}
          </div>
        </div>
      )}
      <style>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
      {confirmState && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(17, 24, 39, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: '20px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '420px',
            background: 'white',
            borderRadius: '18px',
            padding: '24px',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)'
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '20px', color: '#111827' }}>Please Confirm</h3>
            <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.5 }}>{confirmState.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => handleConfirmDecision(false)}
                className="btn"
                style={{ background: '#e5e7eb', color: '#111827', border: 'none' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDecision(true)}
                className="btn btn-primary"
                style={{ border: 'none' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="inventory" element={<Products />} />
            <Route path="sales" element={<Sales />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="customers" element={<Customers />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="reports" element={<Reports />} />
            <Route path="staff" element={<Staff />} />
            <Route path="shops" element={<Shops />} />
            <Route path="services" element={<Services />} />
            <Route path="credit" element={<CustomerCredit />} />
            <Route path="deliveries" element={<Deliveries />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="settings" element={<Settings />} />
            <Route path="audit" element={<AuditDashboard />} />
          </Route>
        </Routes>
      </Router>
    </ShopProvider>
  )
}

export default App
