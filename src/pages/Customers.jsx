import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Search, User, Phone, Mail, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { confirmAction } from '../lib/dialogs'

const Customers = () => {
  const { currentShop, showSuccess, userProfile } = useShop()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', phone: '', email: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState(null)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (currentShop && currentShop.id !== 'all') {
      query = query.eq('shop_id', currentShop.id)
    }
    const { data } = await query
    setCustomers(data || [])
    setLoading(false)
  }, [currentShop])

  useEffect(() => {
    if (currentShop) fetchCustomers()
  }, [currentShop, fetchCustomers])

  const handleSave = async (e) => {
    e.preventDefault()

    try {
      if (isEditing) {
        const { error } = await supabase.from('customers').update(formData).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert([{ ...formData, shop_id: currentShop.id }])
        if (error) throw error
      }

      setShowModal(false)
      resetForm()
      showSuccess(isEditing ? 'Customer updated successfully!' : 'Customer added successfully!')
      fetchCustomers()
    } catch (error) {
      alert(error.message)
    }
  }

  const handleDelete = async (id) => {
    if (!await confirmAction('Delete this customer?')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    showSuccess('Customer deleted successfully!')
    fetchCustomers()
  }

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '' })
    setIsEditing(false)
    setEditId(null)
  }

  const filteredItems = customers.filter(c => 
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  )

  return (
    <div className="fade-in">
      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Customers</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage your shop's customer base and loyalty.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowModal(true)}
          disabled={!currentShop || currentShop.id === 'all'}
          title={!currentShop ? "Please create a shop first" : currentShop.id === 'all' ? "Please select a specific shop to add a customer" : ""}
          style={{ opacity: (!currentShop || currentShop.id === 'all') ? 0.5 : 1, cursor: (!currentShop || currentShop.id === 'all') ? 'not-allowed' : 'pointer', width: 'fit-content' }}
        >
          <Plus size={20} />
          <span>Add Customer</span>
        </button>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
          <input 
            type="text" 
            placeholder="Search customers..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
          />
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Name</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Phone</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Email</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 'bold' }}>{c.name}</td>
                <td style={{ padding: '16px' }}>{c.phone || '-'}</td>
                <td style={{ padding: '16px' }}>{c.email || '-'}</td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => { setFormData({ name: c.name, phone: c.phone, email: c.email }); setEditId(c.id); setIsEditing(true); setShowModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={18} /></button>
                    {(userProfile?.role === 'Owner' || userProfile?.role === 'Manager' || userProfile?.role === 'Admin') && (
                      <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={18} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && !loading && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No customers found.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '24px' }}>{isEditing ? 'Edit Customer' : 'Add New Customer'}</h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Full Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} required />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Phone Number</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Email Address</label>
                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => { setShowModal(false); resetForm() }} style={{ background: 'var(--surface-muted)', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Customers
