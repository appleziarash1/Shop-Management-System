import React, { useState } from 'react'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useShop } from '../context/ShopContext'
import { canViewFinancials } from '../lib/roles'

/**
 * FinancialValue Component
 * ────────────────────────
 * Security-first component for displaying monetary values.
 * 
 * Features:
 *   1. Role-based visibility: Non-management roles (Cashier) see "••••" by default.
 *   2. On-demand masking: Management can toggle visibility (eye icon).
 *   3. Context-aware: Uses ShopContext for role and currency formatting.
 */
const FinancialValue = ({ 
  value, 
  prefix = '', 
  suffix = '', 
  style = {},
  allowToggle = true,
  important = false 
}) => {
  const { userProfile, formatCurrency } = useShop()
  const [isVisible, setIsVisible] = useState(false)
  
  const canView = canViewFinancials(userProfile?.role)
  const isOwner = userProfile?.role === 'Owner'
  
  // If user cannot view financials at all (strict mask)
  if (!canView) {
    return (
      <span style={{ 
        ...style, 
        fontFamily: 'monospace', 
        letterSpacing: '0.1em',
        color: 'var(--text-muted)'
      }}>
        ••••••
      </span>
    )
  }

  // Formatting
  const formatted = formatCurrency(value || 0)
  const displayValue = isVisible || !allowToggle ? `${prefix}${formatted}${suffix}` : '••••••'

  return (
    <span style={{ 
      display: 'inline-flex', 
      alignItems: 'center', 
      gap: '8px',
      ...style 
    }}>
      <span style={{ 
        fontWeight: isVisible ? 'inherit' : '800', 
        fontFamily: isVisible ? 'inherit' : 'monospace',
        letterSpacing: isVisible ? 'inherit' : '0.1em'
      }}>
        {displayValue}
      </span>
      
      {allowToggle && (
        <button
          onClick={() => setIsVisible(!isVisible)}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: isVisible ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.6,
            transition: 'opacity 0.2s',
          }}
          title={isVisible ? "Hide Value" : "Show Value"}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
        >
          {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </span>
  )
}

export default FinancialValue
