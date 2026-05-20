import React, { useState, useEffect, useCallback } from 'react'
import { Plus, CreditCard, CheckCircle, AlertTriangle, Building, Banknote } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format, isPast, parseISO } from 'date-fns'
import { confirmAction } from '../lib/dialogs'
import { sanitizePositiveDecimalInput } from '../lib/numberInput'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { downloadListReport } from '../lib/reportGenerator'
import { Download } from 'lucide-react'

const CustomerCredit = () => {
  const { currentShop, userProfile, formatCurrency, currencyPreference, showSuccess } = useShop()
  
  // Views
  const [activeTab, setActiveTab] = useState('customers') // 'customers' | 'loans'
  
  // States
  const [credits, setCredits] = useState([])
  const [customers, setCustomers] = useState([])
  const [businessLoans, setBusinessLoans] = useState([])
  
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false)
  
  const [filter, setFilter] = useState('outstanding') // 'all' | 'outstanding' | 'settled'


  const [formData, setFormData] = useState({
    customer_id: '', amount_owed: '', notes: '', due_date: ''
  })

  const [loanFormData, setLoanFormData] = useState({
    lender_name: '', amount: '', interest_rate: '', obtained_date: format(new Date(), 'yyyy-MM-dd'), due_date: '', notes: ''
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [creditsRes, customersRes, loansRes] = await Promise.all([
      supabase.from('customer_credit').select(`*, customers(name, phone)`).eq('shop_id', currentShop.id).order('created_at', { ascending: false }),
      supabase.from('customers').select('id, name, phone').eq('shop_id', currentShop.id).order('name'),
      supabase.from('business_loans').select('*').eq('shop_id', currentShop.id).order('created_at', { ascending: false })
    ])
    setCredits(creditsRes.data || [])
    setCustomers(customersRes.data || [])
    setBusinessLoans(loansRes.data || [])
    setLoading(false)
  }, [currentShop])

  useEffect(() => {
    if (currentShop) {
      fetchData()
    }
  }, [currentShop, fetchData])

  // --- Customer Credit Handlers ---
  const handleSubmitCustomer = async (e) => {
    e.preventDefault()
    if (!formData.amount_owed || Number(formData.amount_owed) <= 0) { alert('Amount owed must be positive.'); return }
    const { error } = await supabase.from('customer_credit').insert([{
      ...formData, shop_id: currentShop.id, amount_owed: parseFloat(formData.amount_owed), created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    if (error) { alert(getFriendlyErrorMessage(error)); return }
    showSuccess('Customer credit recorded successfully!')
    setIsModalOpen(false)
    setFormData({ customer_id: '', amount_owed: '', notes: '', due_date: '' })
    fetchData()
  }

  const handleExportCustomersPDF = () => {
    const reportData = filteredCredits.map(c => [
      c.customers?.name || 'Unknown',
      formatCurrency(c.amount_owed),
      c.due_date ? format(parseISO(c.due_date), 'dd MMM yyyy') : '-',
      c.notes || '-'
    ])
    
    const total = filteredCredits.reduce((s, c) => s + Number(c.amount_owed), 0)

    downloadListReport({
      title: `${filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)} Customer Debts`,
      headers: ['Customer Name', `Amount (${currencyPreference})`, 'Due Date', 'Notes'],
      data: reportData,
      shop: currentShop,
      fileName: 'customer_debts',
      summaryText: `Total Outstanding: ${formatCurrency(total)}`
    })
  }

  const handleExportLoansPDF = () => {
    const reportData = filteredLoans.map(l => [
      l.lender_name,
      formatCurrency(l.amount),
      l.interest_rate + '%',
      format(parseISO(l.obtained_date), 'dd MMM yyyy'),
      format(parseISO(l.due_date), 'dd MMM yyyy'),
      l.notes || '-'
    ])
    
    const totalPrincipal = filteredLoans.reduce((s, l) => s + Number(l.amount), 0)

    downloadListReport({
      title: `${filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)} Business Loans`,
      headers: ['Lender', 'Principal', 'Interest', 'Date Obtained', 'Due Date', 'Notes'],
      data: reportData,
      shop: currentShop,
      fileName: 'business_loans',
      orientation: 'l',
      summaryText: `Total Loan Principal: ${formatCurrency(totalPrincipal)}`
    })
  }

  const handleMarkSettledCustomer = async (id) => {
    if (!await confirmAction('Mark this credit as fully paid?')) return
    const { error } = await supabase.from('customer_credit').update({ is_settled: true, settled_at: new Date().toISOString() }).eq('id', id)
    if (error) alert(getFriendlyErrorMessage(error))
    else { showSuccess('Credit marked as settled!'); fetchData() }
  }



  // --- Business Loan Handlers ---
  const handleSubmitLoan = async (e) => {
    e.preventDefault()
    if (!loanFormData.amount || Number(loanFormData.amount) <= 0) { alert('Loan amount must be greater than zero.'); return }
    const { error } = await supabase.from('business_loans').insert([{
      ...loanFormData, shop_id: currentShop.id, amount: parseFloat(loanFormData.amount), interest_rate: loanFormData.interest_rate ? parseFloat(loanFormData.interest_rate) : 0, created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    if (error) { alert(getFriendlyErrorMessage(error)); return }
    showSuccess('Business loan recorded successfully!')
    setIsLoanModalOpen(false)
    setLoanFormData({ lender_name: '', amount: '', interest_rate: '', obtained_date: format(new Date(), 'yyyy-MM-dd'), due_date: '', notes: '' })
    fetchData()
  }

  const handleMarkSettledLoan = async (id) => {
    if (!await confirmAction('Mark this business loan as fully paid and settled?')) return
    const { error } = await supabase.from('business_loans').update({ is_settled: true, settled_at: new Date().toISOString() }).eq('id', id)
    if (error) alert(getFriendlyErrorMessage(error))
    else { showSuccess('Loan marked as settled!'); fetchData() }
  }

  // --- Render Helpers ---
  const filteredCredits = credits.filter(c => filter === 'all' || (filter === 'outstanding' && !c.is_settled) || (filter === 'settled' && c.is_settled))
  const filteredLoans = businessLoans.filter(c => filter === 'all' || (filter === 'outstanding' && !c.is_settled) || (filter === 'settled' && c.is_settled))

  // Customers Stats
  const totalOutstanding = credits.filter(c => !c.is_settled).reduce((s, c) => s + Number(c.amount_owed), 0)
  const overdueCredits = credits.filter(c => !c.is_settled && c.due_date && isPast(parseISO(c.due_date))).length

  // Loans Stats
  const totalLoansValue = businessLoans.filter(l => !l.is_settled).reduce((s, l) => s + (Number(l.amount) + (Number(l.amount) * Number(l.interest_rate || 0) / 100)), 0)
  const overdueLoansCount = businessLoans.filter(l => !l.is_settled && l.due_date && isPast(parseISO(l.due_date))).length

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Obligations & Credit</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage customer debts owed to you and your active business loans.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            onClick={activeTab === 'customers' ? handleExportCustomersPDF : handleExportLoansPDF} 
            className="btn" 
            style={{ background: 'var(--surface-muted)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
          >
            <Download size={18} />
            <span>Export PDF</span>
          </button>

          <div style={{ display: 'flex', background: 'var(--surface-muted)', borderRadius: '12px', padding: '4px', overflowX: 'auto' }}>
            <button 
              onClick={() => setActiveTab('customers')} 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: 'none', background: activeTab === 'customers' ? 'white' : 'transparent', color: activeTab === 'customers' ? 'var(--primary)' : 'var(--text-main)', fontWeight: '600', boxShadow: activeTab === 'customers' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
            >
              <CreditCard size={18} /> Customer Debts
            </button>
            <button 
              onClick={() => setActiveTab('loans')} 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: 'none', background: activeTab === 'loans' ? 'white' : 'transparent', color: activeTab === 'loans' ? 'var(--danger)' : 'var(--text-main)', fontWeight: '600', boxShadow: activeTab === 'loans' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
            >
              <Building size={18} /> Business Loans
            </button>
          </div>

          {(userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && (
            <button 
              onClick={() => {
                if (activeTab === 'customers') setIsModalOpen(true)
                else setIsLoanModalOpen(true)
              }} 
              className="btn btn-primary"
              style={{ background: activeTab === 'loans' ? 'var(--danger)' : 'var(--primary)', borderColor: activeTab === 'loans' ? 'var(--danger)' : 'var(--primary)' }}
            >
              <Plus size={20} /> Record {activeTab === 'customers' ? 'Credit' : 'Loan'}
            </button>
          )}
        </div>
      </div>



      {/* Summary Stats */}
      {activeTab === 'customers' && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
            <div className="stat-icon" style={{ background: 'rgba(220,53,69,0.1)', color: 'var(--danger)' }}><CreditCard /></div>
            <div className="stat-info">
              <h3>Outstanding (Owed to Us)</h3>
              <p>{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <div className="stat-icon" style={{ background: 'rgba(255,193,7,0.1)', color: 'var(--warning)' }}><AlertTriangle /></div>
            <div className="stat-info">
              <h3>Overdue Accounts</h3>
              <p>{overdueCredits}</p>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <div className="stat-icon" style={{ background: 'rgba(34,139,34,0.1)', color: 'var(--success)' }}><CheckCircle /></div>
            <div className="stat-info">
              <h3>Settled Credits</h3>
              <p>{credits.filter(c => c.is_settled).length}</p>
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'loans' && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #d32f2f' }}>
            <div className="stat-icon" style={{ background: 'rgba(211,47,47,0.1)', color: '#d32f2f' }}><Banknote /></div>
            <div className="stat-info">
              <h3>Total Liabilities</h3>
              <p>{formatCurrency(totalLoansValue)}</p>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <div className="stat-icon" style={{ background: 'rgba(255,193,7,0.1)', color: 'var(--warning)' }}><AlertTriangle /></div>
            <div className="stat-info">
              <h3>Overdue Loans</h3>
              <p>{overdueLoansCount}</p>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <div className="stat-icon" style={{ background: 'rgba(34,139,34,0.1)', color: 'var(--success)' }}><CheckCircle /></div>
            <div className="stat-info">
              <h3>Settled Loans</h3>
              <p>{businessLoans.filter(c => c.is_settled).length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['outstanding', 'settled', 'all'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', background: filter === f ? (activeTab === 'customers' ? 'var(--primary)' : 'var(--danger)') : 'var(--surface-muted)', color: filter === f ? 'white' : 'var(--text-main)', textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* CUSTOMERS VIEW */}
          {activeTab === 'customers' && (
            <>
              {filteredCredits.length === 0 && <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No {filter} credits.</div>}
              {filteredCredits.map(credit => {
                const isOverdue = !credit.is_settled && credit.due_date && isPast(parseISO(credit.due_date))
                return (
                  <div key={credit.id} className="card" style={{ borderLeft: `4px solid ${credit.is_settled ? 'var(--success)' : isOverdue ? 'var(--danger)' : 'var(--warning)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' }}>
                          {credit.customers?.name?.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontWeight: '700', fontSize: '16px' }}>{credit.customers?.name}</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{credit.customers?.phone}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '22px', fontWeight: 'bold', color: credit.is_settled ? 'var(--success)' : 'var(--danger)' }}>
                          {formatCurrency(credit.amount_owed)}
                        </p>
                        <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '12px', background: credit.is_settled ? 'rgba(34,139,34,0.1)' : isOverdue ? 'rgba(220,53,69,0.1)' : 'rgba(255,193,7,0.1)', color: credit.is_settled ? 'var(--success)' : isOverdue ? 'var(--danger)' : 'var(--text-warning-strong)', fontWeight: '600' }}>
                          {credit.is_settled ? '✅ Settled' : isOverdue ? '🔴 Overdue' : '🟡 Outstanding'}
                        </span>
                      </div>
                    </div>
                    {(credit.notes || credit.due_date) && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {credit.notes && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>📝 {credit.notes}</p>}
                        {credit.due_date && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>📅 Due: {format(parseISO(credit.due_date), 'dd MMM yyyy')}</p>}
                      </div>
                    )}
                    {!credit.is_settled && (userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && (
                      <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleMarkSettledCustomer(credit.id)} className="btn btn-primary" style={{ fontSize: '13px', padding: '8px 16px' }}>
                          <CheckCircle size={16} /> Mark Paid
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* LOANS VIEW */}
          {activeTab === 'loans' && (
            <>
              {filteredLoans.length === 0 && <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No {filter} loans.</div>}
              {filteredLoans.map(loan => {
                const isOverdue = !loan.is_settled && loan.due_date && isPast(parseISO(loan.due_date))
                const principal = Number(loan.amount)
                const rate = Number(loan.interest_rate || 0)
                const totalDue = principal + (principal * rate / 100)
                
                return (
                  <div key={loan.id} className="card" style={{ borderLeft: `4px solid ${loan.is_settled ? 'var(--success)' : isOverdue ? '#d32f2f' : 'var(--warning)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--surface-muted)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          <Building size={20} />
                        </div>
                        <div>
                          <p style={{ fontWeight: '700', fontSize: '16px' }}>{loan.lender_name}</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Obtained: {format(parseISO(loan.obtained_date), 'dd MMM yyyy')}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '22px', fontWeight: 'bold', color: loan.is_settled ? 'var(--success)' : '#d32f2f' }}>
                          {formatCurrency(totalDue)}
                        </p>
                        <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '12px', background: loan.is_settled ? 'rgba(34,139,34,0.1)' : isOverdue ? 'rgba(211,47,47,0.1)' : 'rgba(255,193,7,0.1)', color: loan.is_settled ? 'var(--success)' : isOverdue ? '#d32f2f' : 'var(--text-warning-strong)', fontWeight: '600' }}>
                          {loan.is_settled ? '✅ Settled' : isOverdue ? '🔴 Overdue' : '🟡 Active Loan'}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '12px', background: 'var(--surface-muted)', borderRadius: '8px' }}>
                       <div>
                         <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Principal Amount</p>
                         <p style={{ fontWeight: '600', fontSize: '14px' }}>{formatCurrency(principal)}</p>
                       </div>
                       <div>
                         <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Interest Rate</p>
                         <p style={{ fontWeight: '600', fontSize: '14px' }}>{rate}%</p>
                       </div>
                       <div>
                         <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Due Date</p>
                         <p style={{ fontWeight: '600', fontSize: '14px', color: isOverdue ? '#d32f2f' : 'inherit' }}>{format(parseISO(loan.due_date), 'dd MMM yyyy')}</p>
                       </div>
                    </div>

                    {loan.notes && (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '12px' }}>📝 {loan.notes}</p>
                    )}

                    {!loan.is_settled && (userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && (
                      <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleMarkSettledLoan(loan.id)} className="btn" style={{ fontSize: '13px', padding: '8px 16px', background: 'var(--success)', color: 'white', border: 'none' }}>
                          <CheckCircle size={16} /> Mark as Settled / Paid
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

        </div>
      )}

      {/* MODALS */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: '480px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px' }}>Record Credit Sale</h2>
            <form onSubmit={handleSubmitCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Customer</label>
                <select value={formData.customer_id} onChange={e => setFormData({ ...formData, customer_id: e.target.value })} required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }}>
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || 'No phone'})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Amount Owed ({currencyPreference})</label>
                <input type="number" min="0.01" step="0.01" inputMode="decimal" value={formData.amount_owed} onChange={e => setFormData({ ...formData, amount_owed: sanitizePositiveDecimalInput(e.target.value) })} required
                  placeholder="Enter amount owed" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Due Date (Optional)</label>
                <input type="date" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows="3"
                  placeholder="What goods/services were taken on credit?" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', resize: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ padding: '10px', background: 'rgba(220, 53, 69, 0.05)', borderRadius: '8px', border: '1px solid rgba(220, 53, 69, 0.1)', marginBottom: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--danger)', margin: 0 }}>
                  ℹ️ This will be automatically recorded as an <strong>Expense</strong> in your finances.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'var(--surface-muted)', border: 'none', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}>Record Credit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoanModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: '480px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px' }}>Record Business Loan</h2>
            <form onSubmit={handleSubmitLoan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Lender (Bank, Firm, or Individual)</label>
                <input type="text" value={loanFormData.lender_name} onChange={e => setLoanFormData({ ...loanFormData, lender_name: e.target.value })} required
                  placeholder="e.g. Standard Bank, John Doe" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Principal Amount</label>
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={loanFormData.amount} onChange={e => setLoanFormData({ ...loanFormData, amount: sanitizePositiveDecimalInput(e.target.value) })} required
                    placeholder="Total cash received" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Interest Rate (%)</label>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={loanFormData.interest_rate} onChange={e => setLoanFormData({ ...loanFormData, interest_rate: sanitizePositiveDecimalInput(e.target.value) })}
                    placeholder="e.g. 5" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Date Obtained</label>
                  <input type="date" value={loanFormData.obtained_date} onChange={e => setLoanFormData({ ...loanFormData, obtained_date: e.target.value })} required
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Due Date</label>
                  <input type="date" value={loanFormData.due_date} onChange={e => setLoanFormData({ ...loanFormData, due_date: e.target.value })} required
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Notes</label>
                <textarea value={loanFormData.notes} onChange={e => setLoanFormData({ ...loanFormData, notes: e.target.value })} rows="2"
                  placeholder="Terms, conditions, collateral, etc." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', resize: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ padding: '10px', background: 'rgba(34, 139, 34, 0.05)', borderRadius: '8px', border: '1px solid rgba(34, 139, 34, 0.1)', marginBottom: '8px' }}>
                <p style={{ fontSize: '12px', color: 'var(--success)', margin: 0 }}>
                  ℹ️ This loan will be automatically added to your <strong>Total Revenue</strong>.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsLoanModalOpen(false)} className="btn" style={{ flex: 1, background: 'var(--surface-muted)', border: 'none', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', background: 'var(--danger)', border: 'none' }}>Record Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default CustomerCredit
