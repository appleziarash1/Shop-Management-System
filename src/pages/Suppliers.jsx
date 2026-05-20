import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Building2, Phone, Mail, Edit2, Trash2, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { confirmAction } from '../lib/dialogs'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { downloadListReport } from '../lib/reportGenerator'

const Suppliers = () => {
  const { currentShop, userProfile, showSuccess } = useShop()
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ name: '', contact_person: '', phone: '', email: '', registration_number: '', tpin: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState(null)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('suppliers').select('*').order('created_at', { ascending: false })
    if (currentShop && currentShop.id !== 'all') {
      query = query.eq('shop_id', currentShop.id)
    }
    const { data } = await query
    setSuppliers(data || [])
    setLoading(false)
  }, [currentShop])

  useEffect(() => {
    if (currentShop) fetchSuppliers()
  }, [currentShop, fetchSuppliers])

  const normalizeSupplierPayload = () => {
    const companyName = formData.name.trim()
    const contactPerson = formData.contact_person.trim()
    const primaryName = companyName || contactPerson

    return {
      name: primaryName,
      contact_person: contactPerson,
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      registration_number: formData.registration_number.trim(),
      tpin: formData.tpin.trim()
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const supplierPayload = normalizeSupplierPayload()

    if (!supplierPayload.name) {
      alert('Enter a supplier name or an individual person name.')
      return
    }

    try {
      if (isEditing) {
        const { error } = await supabase.from('suppliers').update(supplierPayload).eq('id', editId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert([{ ...supplierPayload, shop_id: currentShop.id }])
        if (error) throw error
      }
      setShowModal(false)
      resetForm()
      showSuccess(isEditing ? 'Supplier updated successfully!' : 'Supplier added successfully!')
      fetchSuppliers()
    } catch (error) {
      alert('Could not save supplier details: ' + getFriendlyErrorMessage(error))
    }
  }

  const handleDelete = async (id) => {
    if (!await confirmAction('Delete this supplier?')) return
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) {
      alert(getFriendlyErrorMessage(error))
      return
    }
    showSuccess('Supplier deleted successfully!')
    fetchSuppliers()
  }

  const resetForm = () => {
    setFormData({ name: '', contact_person: '', phone: '', email: '', registration_number: '', tpin: '' })
    setIsEditing(false)
    setEditId(null)
  }

  const handleExportPDF = () => {
    const reportData = filteredItems.map(s => [
      s.name,
      s.contact_person || '-',
      s.phone || '-',
      s.email || '-',
      s.registration_number || '-',
      s.tpin || '-'
    ])

    downloadListReport({
      title: 'Supplier Directory',
      headers: ['Supplier Name', 'Contact Person', 'Phone', 'Email', 'Reg No.', 'TPIN'],
      data: reportData,
      shop: currentShop,
      fileName: 'suppliers_list',
      orientation: 'l'
    })
  }

  const filteredItems = suppliers.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (userProfile?.role !== 'Owner' && userProfile?.role !== 'Admin') {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Access Denied</h2>
        <p>You do not have permission to manage suppliers. This section is restricted to shop owners or admins only.</p>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Suppliers</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage your vendors and supply chain.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={handleExportPDF} 
            className="btn" 
            style={{ background: 'var(--surface-muted)', color: 'var(--text-main)', border: '1px solid var(--border)' }}
          >
            <Download size={18} />
            <span>Export PDF</span>
          </button>
          
          <button 
            className="btn btn-primary" 
            onClick={() => setShowModal(true)}
            disabled={!currentShop || currentShop.id === 'all'}
            title={!currentShop ? "Please create a shop first" : currentShop.id === 'all' ? "Please select a specific shop to add a supplier" : ""}
            style={{ opacity: (!currentShop || currentShop.id === 'all') ? 0.5 : 1, cursor: (!currentShop || currentShop.id === 'all') ? 'not-allowed' : 'pointer', width: 'fit-content' }}
          >
            <Plus size={20} />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
          <input 
            type="text" 
            placeholder="Search suppliers..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
          />
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Supplier Name</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Contact Person</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Phone</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Registration No.</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>TPIN</th>
              <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '16px', fontWeight: 'bold' }}>{s.name}</td>
                <td style={{ padding: '16px' }}>{s.contact_person || '-'}</td>
                <td style={{ padding: '16px' }}>{s.phone || '-'}</td>
                <td style={{ padding: '16px' }}>{s.registration_number || '-'}</td>
                <td style={{ padding: '16px' }}>{s.tpin || '-'}</td>
                <td style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => { setFormData({ name: s.name, contact_person: s.contact_person, phone: s.phone, email: s.email, registration_number: s.registration_number || '', tpin: s.tpin || '' }); setEditId(s.id); setIsEditing(true); setShowModal(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={18} /></button>
                    <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && !loading && (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No suppliers found.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '24px' }}>{isEditing ? 'Edit Supplier' : 'Add New Supplier'}</h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Company / Supplier Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Optional if this is an individual person" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Individual Person / Contact Person</label>
                <input type="text" value={formData.contact_person} onChange={e => setFormData({ ...formData, contact_person: e.target.value })} placeholder="Enter person's name if supplier is not a company" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>You can save either a company supplier, an individual person, or both.</p>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Phone Number</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Email Address</label>
                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Registration Number</label>
                <input type="text" value={formData.registration_number} onChange={e => setFormData({ ...formData, registration_number: e.target.value })} placeholder="Optional" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>TPIN</label>
                <input type="text" value={formData.tpin} onChange={e => setFormData({ ...formData, tpin: e.target.value })} placeholder="Optional" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => { setShowModal(false); resetForm() }} style={{ background: 'var(--surface-muted)', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Suppliers
