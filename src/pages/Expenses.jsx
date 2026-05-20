import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Receipt, Banknote, Calendar, Trash2, Pencil, Lock, Download, User } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format } from 'date-fns'
import { canEditExpenses } from '../lib/roles'
import { getPageCount } from '../lib/finance'
import { confirmAction } from '../lib/dialogs'
import { sanitizePositiveDecimalInput } from '../lib/numberInput'
import { downloadListReport } from '../lib/reportGenerator'

const EXPENSE_CATEGORIES = [
  'Transport', 'Internet/Data', 'Electricity/Utilities', 
  'Wages/Labor', 'Rent', 'Stationery/Supplies', 'Other'
]

const Expenses = () => {
  const { 
    currentShop, 
    userProfile, 
    isDateClosed, 
    isCurrentDayClosed, 
    refreshClosures, 
    canModifyCurrentShop, 
    shopAccessMessage, 
    formatCurrency, 
    currencyPreference, 
    showSuccess 
  } = useShop()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [formData, setFormData] = useState({
    amount: '', category: 'Transport', description: '', expense_date: format(new Date(), 'yyyy-MM-dd')
  })

  const fetchExpenses = useCallback(async (nextPage = page) => {
    setLoading(true)
    const from = (nextPage - 1) * pageSize
    const to = from + pageSize - 1
    let query = supabase
      .from('expenses')
      .select('*', { count: 'exact' })
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (currentShop.id !== 'all') query = query.eq('shop_id', currentShop.id)
    
    const { data, error, count } = await query
    if (error) console.error(error)
    
    // Fetch creator names for each expense
    const expensesWithNames = data || []
    if (expensesWithNames.length > 0) {
      const creatorIds = [...new Set(expensesWithNames.map(e => e.created_by).filter(Boolean))]
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, role').in('id', creatorIds)
        const profileMap = (profiles || []).reduce((acc, p) => { acc[p.id] = p; return acc }, {})
        expensesWithNames.forEach(e => { e._creator = profileMap[e.created_by] || null })
      }
    }
    
    setExpenses(expensesWithNames)
    setTotalCount(count || 0)
    setLoading(false)
  }, [page, pageSize, currentShop])

  useEffect(() => {
    if (currentShop) {
      setPage(1)
      fetchExpenses(1)
      refreshClosures(currentShop.id)
    }
  }, [currentShop, fetchExpenses, refreshClosures])

  useEffect(() => {
    if (currentShop) fetchExpenses(page)
  }, [page, currentShop, fetchExpenses])

  const resetForm = () => {
    setEditingExpense(null)
    setFormData({
      amount: '',
      category: 'Transport',
      description: '',
      expense_date: format(new Date(), 'yyyy-MM-dd')
    })
  }

  const openCreateModal = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (expense) => {
    setEditingExpense(expense)
    setFormData({
      amount: String(expense.amount ?? ''),
      category: expense.category,
      description: expense.description || '',
      expense_date: expense.expense_date
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!currentShop || currentShop.id === 'all') {
      alert('Please select a specific shop to manage expenses.')
      return
    }

    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }

    // Only management can EDIT existing expenses
    if (editingExpense && !canEditExpenses(userProfile?.role)) {
      alert('Only management users can edit expenses.')
      return
    }

    if (isDateClosed(currentShop.id, formData.expense_date)) {
      alert(`Cannot save expense: The day ${formData.expense_date} has already been closed.`)
      return
    }

    if (!formData.amount || Number(formData.amount) <= 0) {
      alert('Expense amount must be a positive number greater than zero.')
      return
    }

    if (!formData.description || formData.description.trim().length < 3) {
      alert('Please provide a reason/description for this expense (at least 3 characters).')
      return
    }

    const payload = {
      shop_id: currentShop.id,
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      expense_date: formData.expense_date,
      updated_by: userProfile?.id
    }

    const request = editingExpense
      ? supabase.from('expenses').update(payload).eq('id', editingExpense.id)
      : supabase.from('expenses').insert([{ ...payload, created_by: userProfile?.id }])

    const { error } = await request

    if (error) {
      alert(error.message)
      return
    }

    setIsModalOpen(false)
    resetForm()
    fetchExpenses(page)
    showSuccess(editingExpense ? 'Expense updated successfully!' : 'Expense logged successfully!')
  }

  const handleDelete = async (id, date) => {
    if (!canEditExpenses(userProfile?.role)) {
      alert('Only management users can delete logged expenses.')
      return
    }

    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }

    if (isDateClosed(currentShop.id, date)) {
      alert(`Cannot delete expense: The day ${date} is already closed.`)
      return
    }

    if (!await confirmAction('Delete this expense?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      fetchExpenses(page)
      showSuccess('Expense deleted successfully')
    }
  }

  const handleExportPDF = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
      
      if (currentShop.id !== 'all') query = query.eq('shop_id', currentShop.id)
      
      const { data, error } = await query
      if (error) throw error

      const reportData = (data || []).map(e => [
        format(new Date(e.expense_date), 'dd MMM yyyy'),
        e.category,
        e.description || '-',
        formatCurrency(e.amount)
      ])

      const totalAmount = (data || []).reduce((sum, e) => sum + Number(e.amount), 0)

      downloadListReport({
        title: 'Expense Report',
        headers: ['Date', 'Category', 'Description', 'Amount'],
        data: reportData,
        shop: currentShop,
        fileName: 'expenses_report',
        summaryText: `Total Expenses: ${formatCurrency(totalAmount)}`
      })
    } catch (err) {
      alert('Error generating report: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalPages = getPageCount(totalCount, pageSize)
  const totalThisMonth = expenses.filter(e => e.expense_date.startsWith(format(new Date(), 'yyyy-MM'))).reduce((sum, e) => sum + Number(e.amount), 0)
  const totalToday = expenses.filter(e => e.expense_date === format(new Date(), 'yyyy-MM-dd')).reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Daily Expenses</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track operational costs for {currentShop?.id === 'all' ? 'All Shops' : currentShop?.name}</p>
          {currentShop?.id !== 'all' && isCurrentDayClosed && (
            <p style={{ color: 'var(--danger)', marginTop: '8px', fontSize: '13px' }}>
              Today is closed. Existing expenses for today are locked until the day is unlocked.
            </p>
          )}
          {currentShop?.id !== 'all' && !canModifyCurrentShop && (
            <p style={{ color: 'var(--danger)', marginTop: '8px', fontSize: '13px' }}>{shopAccessMessage}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={handleExportPDF} 
            className="btn" 
            style={{ background: 'var(--surface-muted)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
            disabled={loading}
          >
            <Download size={18} />
            <span>Export PDF</span>
          </button>
          
          <button 
            onClick={openCreateModal} className="btn btn-primary"
            disabled={!currentShop || currentShop.id === 'all'}
            style={{ opacity: (!currentShop || currentShop.id === 'all') ? 0.5 : 1 }}
          >
            <Plus size={20} /> Log Expense
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(220,53,69,0.1)', color: 'var(--danger)' }}><Banknote /></div>
          <div className="stat-info"><h3>Today's Expenses</h3><p>{formatCurrency(totalToday)}</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(13,202,240,0.1)', color: '#0a9e5d' }}><Calendar /></div>
          <div className="stat-info"><h3>This Month</h3><p>{formatCurrency(totalThisMonth)}</p></div>
        </div>
      </div>

      <div className="card">
        {loading ? <p>Loading...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {expenses.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No expenses logged yet.</div>
            )}
            {expenses.map(exp => (
              <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Receipt size={20} color="var(--text-muted)" />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px' }}>{exp.category}</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                      {format(new Date(exp.expense_date), 'dd MMM yyyy')} • {exp.description || 'No description'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Logged {format(new Date(exp.created_at), 'dd MMM yyyy HH:mm')}
                      {exp._creator ? ` by ${exp._creator.full_name} (${exp._creator.role})` : ''}
                      {exp.updated_at ? ` • Updated ${format(new Date(exp.updated_at), 'dd MMM yyyy HH:mm')}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--danger)' }}>{formatCurrency(exp.amount)}</span>
                  {isDateClosed(exp.shop_id, exp.expense_date) && (
                    <span title="Closed day" style={{ color: 'var(--danger)' }}>
                      <Lock size={16} />
                    </span>
                  )}
                  {canEditExpenses(userProfile?.role) && (
                    <>
                      <button
                        onClick={() => openEditModal(exp)}
                        disabled={isDateClosed(exp.shop_id, exp.expense_date)}
                        style={{ background: 'none', border: 'none', cursor: isDateClosed(exp.shop_id, exp.expense_date) ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', opacity: isDateClosed(exp.shop_id, exp.expense_date) ? 0.4 : 1 }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(exp.id, exp.expense_date)}
                        disabled={isDateClosed(exp.shop_id, exp.expense_date)}
                        style={{ background: 'none', border: 'none', cursor: isDateClosed(exp.shop_id, exp.expense_date) ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', opacity: isDateClosed(exp.shop_id, exp.expense_date) ? 0.4 : 1 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} • {totalCount} total expenses
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button>
            <button className="btn" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Next</button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px' }}>{editingExpense ? 'Edit Expense' : 'Log New Expense'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Amount ({currencyPreference})</label>
                <input type="number" required min="0.01" step="0.01" inputMode="decimal" value={formData.amount} onChange={e => setFormData({ ...formData, amount: sanitizePositiveDecimalInput(e.target.value) })}
                  placeholder="Enter amount"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Category</label>
                <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Reason / Description <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows="2" required
                  placeholder="Explain why this expense was done (required)"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', resize: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Date</label>
                <input type="date" required value={formData.expense_date} onChange={e => setFormData({ ...formData, expense_date: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm() }} className="btn" style={{ flex: 1, background: 'var(--surface-muted)', color: 'var(--text-main)' }}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={currentShop?.id !== 'all' && isDateClosed(currentShop?.id, formData.expense_date)}
                  title={!canModifyCurrentShop ? shopAccessMessage : ''}
                >
                  {editingExpense ? 'Save Changes' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Expenses
