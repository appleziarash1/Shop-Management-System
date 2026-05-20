import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, UserCircle, Shield, Trash2, Store, Lock, User, AlertTriangle, CheckCircle, Banknote } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format, isPast, parseISO } from 'date-fns'
import { confirmAction } from '../lib/dialogs'
import { sanitizePositiveDecimalInput } from '../lib/numberInput'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { downloadListReport } from '../lib/reportGenerator'
import { Download } from 'lucide-react'

const Staff = () => {
  const navigate = useNavigate()
  const { currentShop, shops, userProfile, formatCurrency, currencyPreference, showSuccess } = useShop()
  
  const [activeTab, setActiveTab] = useState('directory') // 'directory' | 'salaries'
  const [filter, setFilter] = useState('outstanding') // 'all' | 'outstanding' | 'settled'

  const [staff, setStaff] = useState([])
  const [staffSalaries, setStaffSalaries] = useState([])

  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    password: '',
    shop_id: currentShop?.id || '',
    role: 'Cashier'
  })

  const [salaryFormData, setSalaryFormData] = useState({
    profile_id: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'), notes: ''
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const shopIds = shops.map(s => s.id)
    
    const [staffRes, salariesRes] = await Promise.all([
      supabase.from('profiles').select('*').in('shop_id', shopIds).neq('role', 'Owner'),
      // Also fetch salaries specifically for the currently viewed shop data context (if current shop isn't ALL)
      currentShop && currentShop.id !== 'all' 
        ? supabase.from('staff_salaries').select('*').eq('shop_id', currentShop.id).order('created_at', { ascending: false })
        : supabase.from('staff_salaries').select('*').in('shop_id', shopIds).order('created_at', { ascending: false })
    ])
    
    setStaff(staffRes.data || [])
    setStaffSalaries(salariesRes.data || [])
    setLoading(false)
  }, [shops, currentShop])

  useEffect(() => {
    if (userProfile?.role === 'Owner') {
      fetchData()
    }
  }, [userProfile, currentShop, fetchData])

  // --- Directory Handlers ---
  const handleAddStaff = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const selectedShop = shops.find(s => s.id === formData.shop_id)
      if (!selectedShop) throw new Error('Please select a shop')
      
      const staffEmail = `${formData.name.toLowerCase().replace(/\s/g, '')}.${selectedShop.name.toLowerCase().replace(/\s/g, '')}@sms.com`
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: staffEmail,
        password: formData.password,
        options: { data: { full_name: formData.name } }
      })
      if (authError) throw authError

      const { error: profileError } = await supabase.from('profiles').upsert([{ 
        id: authData.user.id, full_name: formData.name, role: formData.role, shop_id: formData.shop_id 
      }])
      if (profileError) throw profileError

      await supabase.auth.signOut()
      alert(`Staff ${formData.name} added successfully!\n\nIMPORTANT: For security, you have been signed out. Please log back in with your Owner account.`)
      
      setShowModal(false)
      navigate('/login')
    } catch (err) {
      alert('Error adding staff: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteStaff = async (id) => {
    if (!await confirmAction('Remove this staff member?')) return
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) alert(error.message)
    else { showSuccess('Staff removed'); fetchData() }
  }

  const handleSubmitSalary = async (e) => {
    e.preventDefault()
    if (!currentShop || currentShop.id === 'all') { alert('Please select a specific shop context first to issue salaries.'); return; }
    if (!salaryFormData.amount || Number(salaryFormData.amount) <= 0) { alert('Salary amount must be positive.'); return }
    if (!salaryFormData.profile_id) { alert('You must select a registered staff member.'); return }

    const prof = staff.find(p => p.id === salaryFormData.profile_id)
    const finalName = prof ? prof.full_name : 'Unknown Staff'

    const { error } = await supabase.from('staff_salaries').insert([{
      shop_id: currentShop.id, 
      staff_name: finalName,
      profile_id: salaryFormData.profile_id,
      amount: parseFloat(salaryFormData.amount), 
      due_date: salaryFormData.due_date,
      notes: salaryFormData.notes,
      created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    if (error) { alert(error.message); return }
    setIsSalaryModalOpen(false)
    setSalaryFormData({ profile_id: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'), notes: '' })
    fetchData()
  }

  const handleMarkSettledSalary = async (id) => {
    if (!await confirmAction('Mark this staff salary as paid?')) return
    
    const salaryToSettle = staffSalaries.find(s => s.id === id)
    const { error } = await supabase.from('staff_salaries').update({ is_settled: true, settled_at: new Date().toISOString() }).eq('id', id)
    
    if (error) {
      alert(getFriendlyErrorMessage(error))
      return
    }

    if (salaryToSettle) {
      const { data: userData } = await supabase.auth.getUser()
      await supabase.from('expenses').insert([{
        shop_id: salaryToSettle.shop_id,
        amount: salaryToSettle.amount,
        category: 'Wages/Labor',
        description: `Salary Payment for ${salaryToSettle.staff_name}${salaryToSettle.notes ? ` - ${salaryToSettle.notes}` : ''}`,
        expense_date: format(new Date(), 'yyyy-MM-dd'),
        created_by: userData?.user?.id
      }])
    }

    showSuccess('Salary marked as paid and logged as expense!')
    fetchData()
  }

  const handleExportSalariesPDF = () => {
    const reportData = filteredSalaries.map(s => [
      s.staff_name,
      formatCurrency(s.amount),
      format(parseISO(s.due_date), 'dd MMM yyyy'),
      s.is_settled ? 'Paid' : 'Unpaid',
      s.notes || '-'
    ])

    const total = filteredSalaries.reduce((sum, s) => sum + Number(s.amount), 0)

    downloadListReport({
      title: filter === 'settled' ? 'Salary Payment History' : `${filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)} Staff Salaries`,
      headers: ['Staff Name', `Amount (${currencyPreference})`, 'Due Date', 'Status', 'Notes'],
      data: reportData,
      shop: currentShop,
      fileName: 'staff_salaries',
      summaryText: `Total Amount: ${formatCurrency(total)}`
    })
  }

  const filteredSalaries = staffSalaries.filter(c => filter === 'all' || (filter === 'outstanding' && !c.is_settled) || (filter === 'settled' && c.is_settled))
  const totalSalariesOwed = staffSalaries.filter(s => !s.is_settled).reduce((s, sal) => s + Number(sal.amount), 0)
  const overdueSalariesCount = staffSalaries.filter(s => !s.is_settled && s.due_date && isPast(parseISO(s.due_date))).length

  if (userProfile?.role !== 'Owner') {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center', border: '1px solid rgba(220,53,69,0.2)' }}>
        <Shield size={48} color="var(--danger)" style={{ marginBottom: '16px', opacity: 0.5 }} />
        <h2 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ color: 'var(--text-muted)' }}>Only business owners can manage store personnel and payroll data.</p>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Staff & HR</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage your branches' personnel and payroll schedules.</p>
        </div>
        
        <div style={{ display: 'flex', background: 'var(--surface-muted)', borderRadius: '12px', padding: '4px', overflowX: 'auto' }}>
          <button 
            onClick={() => setActiveTab('directory')} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: 'none', background: activeTab === 'directory' ? 'white' : 'transparent', color: activeTab === 'directory' ? 'var(--primary)' : 'var(--text-main)', fontWeight: '600', boxShadow: activeTab === 'directory' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
          >
            <Shield size={18} /> Staff Directory
          </button>
          <button 
            onClick={() => setActiveTab('salaries')} 
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: 'none', background: activeTab === 'salaries' ? 'white' : 'transparent', color: activeTab === 'salaries' ? '#6f42c1' : 'var(--text-main)', fontWeight: '600', boxShadow: activeTab === 'salaries' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
          >
            <Banknote size={18} /> Payroll & Wages
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {activeTab === 'salaries' && (
            <button 
              onClick={handleExportSalariesPDF} 
              className="btn" 
              style={{ background: 'var(--surface-muted)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
            >
              <Download size={18} />
              <span>Export PDF</span>
            </button>
          )}

          <button 
            onClick={() => {
              if (activeTab === 'directory') setShowModal(true)
              else setIsSalaryModalOpen(true)
            }} 
            className="btn btn-primary"
            style={{ background: activeTab === 'salaries' ? '#6f42c1' : 'var(--primary)', borderColor: activeTab === 'salaries' ? '#6f42c1' : 'var(--primary)' }}
          >
            <Plus size={20} /> {activeTab === 'directory' ? 'Add New Staff' : 'Log Unpaid Salary'}
          </button>
        </div>
      </div>

      {activeTab === 'salaries' && (
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #6f42c1' }}>
            <div className="stat-icon" style={{ background: 'rgba(111,66,193,0.1)', color: '#6f42c1' }}><User /></div>
            <div className="stat-info">
              <h3>Unpaid Wages</h3>
              <p>{formatCurrency(totalSalariesOwed)}</p>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--warning)' }}>
            <div className="stat-icon" style={{ background: 'rgba(255,193,7,0.1)', color: 'var(--warning)' }}><AlertTriangle /></div>
            <div className="stat-info">
              <h3>Overdue Paychecks</h3>
              <p>{overdueSalariesCount}</p>
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid var(--success)' }}>
            <div className="stat-icon" style={{ background: 'rgba(34,139,34,0.1)', color: 'var(--success)' }}><CheckCircle /></div>
            <div className="stat-info">
              <h3>Paid Tickets</h3>
              <p>{staffSalaries.filter(c => c.is_settled).length}</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'salaries' && (
         <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
         {[
           { key: 'outstanding', label: 'Outstanding' }, 
           { key: 'settled', label: 'Payment History' }, 
           { key: 'all', label: 'All' }
         ].map(f => (
           <button key={f.key} onClick={() => setFilter(f.key)}
             style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', background: filter === f.key ? '#6f42c1' : 'var(--surface-muted)', color: filter === f.key ? 'white' : 'var(--text-main)' }}>
             {f.label}
           </button>
         ))}
       </div>
      )}

      {/* VIEW RENDERERS */}
      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {activeTab === 'directory' && (
            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Full Name</th>
                    <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Assigned Shop</th>
                    <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Role</th>
                    <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', background: 'var(--surface-muted)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <UserCircle size={20} color="var(--primary)" />
                        </div>
                        <span style={{ fontWeight: '600' }}>{s.full_name}</span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Store size={16} color="var(--text-muted)" />
                          <span>{shops.find(shop => shop.id === s.shop_id)?.name || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '12px', background: 'rgba(184, 134, 11, 0.1)', color: 'var(--primary)', fontWeight: '500' }}>
                          {s.role}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <button onClick={() => handleDeleteStaff(s.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {staff.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No staff members found.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {activeTab === 'salaries' && (
            <>
              {(!currentShop || currentShop.id === 'all') && (
                <div style={{ background: '#fff3cd', color: '#856404', padding: '12px 20px', borderRadius: '10px', marginBottom: '16px', borderLeft: '4px solid #ffeeba' }}>
                  Please select a specific shop from the top-right menu to record new salaries. You are currently viewing aggregate data.
                </div>
              )}
              {filteredSalaries.length === 0 && <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No {filter} staff salaries.</div>}
              {filteredSalaries.map(salary => {
                const isOverdue = !salary.is_settled && salary.due_date && isPast(parseISO(salary.due_date))
                return (
                  <div key={salary.id} className="card" style={{ borderLeft: `4px solid ${salary.is_settled ? 'var(--success)' : isOverdue ? 'var(--warning)' : '#6f42c1'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(111,66,193,0.1)', color: '#6f42c1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {salary.staff_name.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontWeight: '700', fontSize: '16px' }}>{salary.staff_name}</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Due: {format(parseISO(salary.due_date), 'dd MMMM yyyy')}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '22px', fontWeight: 'bold', color: salary.is_settled ? 'var(--success)' : isOverdue ? 'var(--text-warning-strong)' : '#6f42c1' }}>
                          {formatCurrency(salary.amount)}
                        </p>
                        <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '12px', background: salary.is_settled ? 'rgba(34,139,34,0.1)' : isOverdue ? 'rgba(255,193,7,0.1)' : 'rgba(111,66,193,0.1)', color: salary.is_settled ? 'var(--success)' : isOverdue ? 'var(--text-warning-strong)' : '#6f42c1', fontWeight: '600' }}>
                          {salary.is_settled ? '✅ Paid' : isOverdue ? '⏱ Overdue Wage' : '📆 Upcoming Payable'}
                        </span>
                      </div>
                    </div>
                    {salary.notes && (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '12px' }}>📝 {salary.notes}</p>
                    )}
                    {!salary.is_settled && (
                      <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                        <button onClick={() => handleMarkSettledSalary(salary.id)} className="btn" style={{ fontSize: '13px', padding: '8px 16px', background: '#6f42c1', color: 'white', border: 'none' }}>
                          <CheckCircle size={16} /> Mark as Paid
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

      {/* Directory ADD Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: '450px' }}>
            <h2 style={{ marginBottom: '24px' }}>Add Seller to Shop</h2>
            <form onSubmit={handleAddStaff}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <UserCircle style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text-main)' }} placeholder="Enter staff name" required />
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Assign to Shop Branch</label>
                <div style={{ position: 'relative' }}>
                  <Store style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                  <select value={formData.shop_id} onChange={e => setFormData({ ...formData, shop_id: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} required>
                    <option value="">Select Shop...</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name} ({s.location})</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Staff Role</label>
                <div style={{ position: 'relative' }}>
                  <Shield style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                  <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }}>
                    <option value="Cashier">Cashier / Seller</option>
                    <option value="Manager">Shop Manager</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Create Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={16} />
                  <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--text-main)' }} placeholder="Enter password" required minLength={6} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)} style={{ background: 'var(--surface-muted)', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Staff Member'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salaries ADD Modal */}
      {isSalaryModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: '480px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px' }}>Log Salary Owed</h2>
            <form onSubmit={handleSubmitSalary} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Registered Staff Member</label>
                <select value={salaryFormData.profile_id} onChange={e => setSalaryFormData({ ...salaryFormData, profile_id: e.target.value })} required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', marginBottom: '8px', background: 'var(--surface-muted)', color: 'var(--text-main)' }}>
                  <option value="">-- Select Staff --</option>
                  {staff.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Salary Amount ({currencyPreference})</label>
                <input type="number" min="0.01" step="0.01" inputMode="decimal" value={salaryFormData.amount} onChange={e => setSalaryFormData({ ...salaryFormData, amount: sanitizePositiveDecimalInput(e.target.value) })} required
                  placeholder="Total amount owed" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Date to be given (Due Date)</label>
                <input type="date" value={salaryFormData.due_date} onChange={e => setSalaryFormData({ ...salaryFormData, due_date: e.target.value })} required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Notes</label>
                <textarea value={salaryFormData.notes} onChange={e => setSalaryFormData({ ...salaryFormData, notes: e.target.value })} rows="2"
                  placeholder="For period (e.g., Nov 2026), overtime, deductions..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', resize: 'none', background: 'var(--surface-muted)', color: 'var(--text-main)' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsSalaryModalOpen(false)} className="btn" style={{ flex: 1, background: 'var(--surface-muted)', border: 'none', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', background: '#6f42c1', border: 'none' }}>Log Unpaid Salary</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default Staff
