import React, { useState } from 'react'
import { Plus, Building2, MapPin, Phone, Trash2, Edit2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { confirmAction } from '../lib/dialogs'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { formatShopAddress, getShopComplianceLines, normalizeShopPayload } from '../lib/shopDetails'

const EMPTY_FORM = {
  name: '',
  location: '',
  contact_info: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  district: '',
  registration_number: '',
  tpin: '',
  vat_registered: false,
  vat_number: ''
}

const Shops = () => {
  const { shops, refreshData, userProfile, showSuccess } = useShop()
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingShop, setEditingShop] = useState(null)
  
  const [formData, setFormData] = useState(EMPTY_FORM)

  const resetForm = () => {
    setFormData(EMPTY_FORM)
    setEditingShop(null)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const shopPayload = normalizeShopPayload(formData)
      if (editingShop) {
        const { error } = await supabase
          .from('shops')
          .update(shopPayload)
          .eq('id', editingShop.id)
        if (error) throw error
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
          .from('shops')
          .insert([{ ...shopPayload, owner_id: user.id }])
        if (error) throw error
      }
      
      await refreshData(true)
      showSuccess(editingShop ? 'Branch updated successfully!' : 'New branch registered!')
      setShowModal(false)
      resetForm()
    } catch (err) {
      alert('Could not save branch details: ' + getFriendlyErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (!await confirmAction('Are you sure you want to delete this shop? All linked data (products, sales) will be lost if RLS allows it.')) return
    const { error } = await supabase.from('shops').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      await refreshData(true)
      showSuccess('Branch deleted successfully')
    }
  }

  const openEdit = (shop) => {
    setEditingShop(shop)
    setFormData({
      name: shop.name,
      location: shop.location || '',
      contact_info: shop.contact_info || '',
      address_line_1: shop.address_line_1 || '',
      address_line_2: shop.address_line_2 || '',
      city: shop.city || '',
      district: shop.district || '',
      registration_number: shop.registration_number || '',
      tpin: shop.tpin || '',
      vat_registered: Boolean(shop.vat_registered),
      vat_number: shop.vat_number || ''
    })
    setShowModal(true)
  }

  if (userProfile?.role !== 'Owner') {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center', border: '1px solid rgba(220,53,69,0.2)' }}>
        <Building2 size={48} color="var(--danger)" style={{ marginBottom: '16px', opacity: 0.5 }} />
        <h2 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ color: 'var(--text-muted)' }}>Only business owners can manage shop branches. Please contact your administrator for assistance.</p>
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', gap: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ padding: '8px', background: 'rgba(184, 134, 11, 0.1)', color: 'var(--primary)', borderRadius: '8px' }}>
               <Building2 size={24} />
            </div>
            <h1 style={{ fontSize: '32px', margin: 0, fontWeight: '800', letterSpacing: '-0.5px' }}>Business Locations</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>Manage and monitor your retail network across Malawi.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => { resetForm(); setShowModal(true); }} 
          style={{ padding: '12px 24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(184,134,11,0.2)', transition: 'transform 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={20} />
          <span style={{ fontWeight: '600' }}>Add New Branch</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '32px' }}>
        {shops.map(shop => {
          const branchAddress = formatShopAddress(shop)
          const complianceLines = getShopComplianceLines(shop)

          return (
          <div key={shop.id} className="card" style={{ 
            padding: '24px', 
            borderRadius: '20px', 
            transition: 'all 0.3s ease',
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-8px)'
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)'
            e.currentTarget.style.borderColor = 'var(--primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ 
                width: '56px', 
                height: '56px', 
                background: 'linear-gradient(135deg, rgba(184, 134, 11, 0.1), rgba(184, 134, 11, 0.05))', 
                color: 'var(--primary)', 
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Building2 size={28} />
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                  onClick={() => openEdit(shop)} 
                  className="btn-icon"
                  style={{ background: 'var(--surface-muted)', border: 'none', padding: '8px', borderRadius: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => handleDelete(shop.id)} 
                  className="btn-icon"
                  style={{ background: 'rgba(220,53,69,0.05)', border: 'none', padding: '8px', borderRadius: '10px', color: 'var(--danger)', cursor: 'pointer' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px', letterSpacing: '-0.3px' }}>{shop.name}</h3>
              <span style={{ fontSize: '12px', background: 'rgba(184, 134, 11, 0.1)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '20px', fontWeight: '600' }}>Active Branch</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ color: 'var(--text-main)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '12px', background: 'var(--surface-muted)' }}>
                <MapPin size={18} color="var(--primary)" />
                <span style={{ fontWeight: '500' }}>{branchAddress || shop.location || 'No address set'}</span>
              </div>
              <div style={{ color: 'var(--text-main)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '12px', background: 'var(--surface-muted)' }}>
                <Phone size={18} color="var(--primary)" />
                <span style={{ fontWeight: '500' }}>{shop.contact_info || 'No contact info'}</span>
              </div>
              {complianceLines.length > 0 && (
                <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(184, 134, 11, 0.08)', border: '1px solid rgba(184, 134, 11, 0.15)' }}>
                  {complianceLines.map((line) => (
                    <div key={line} style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '600', marginBottom: '4px' }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>ID: {shop.id.slice(0, 8)}</span>
               <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white' }}>{shop.name.charAt(0)}</div>
               </div>
            </div>
          </div>
        )})}
      </div>

      {showModal && (
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(15, 23, 42, 0.45)', 
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="card fade-in" style={{ 
            width: '100%', 
            maxWidth: '460px', 
            padding: '40px', 
            borderRadius: '24px', 
            background: 'var(--surface-elevated)',
            color: 'var(--text-main)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>{editingShop ? 'Edit Branch' : 'New Branch'}</h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Configure your business location details.</p>
              </div>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                  <Building2 size={14} color="var(--primary)" /> Shop Name
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Lilongwe Mega Store"
                  required
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                  <MapPin size={14} color="var(--primary)" /> Location
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Area 47, Lilongwe"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                  Business Address Line 1
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.address_line_1}
                  onChange={e => setFormData({ ...formData, address_line_1: e.target.value })}
                  placeholder="e.g. Plot 22, Mchesi Market Road"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                  Business Address Line 2
                </label>
                <input
                  type="text"
                  className="input"
                  value={formData.address_line_2}
                  onChange={e => setFormData({ ...formData, address_line_2: e.target.value })}
                  placeholder="Optional extra address details"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="mobile-stack">
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                    City / Town
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Lilongwe"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                    District
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.district}
                    onChange={e => setFormData({ ...formData, district: e.target.value })}
                    placeholder="e.g. Lilongwe"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                  <Phone size={14} color="var(--primary)" /> Contact Info
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={formData.contact_info}
                  onChange={e => setFormData({ ...formData, contact_info: e.target.value })}
                  placeholder="e.g. 088xxxxxx"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="mobile-stack">
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                    Registration Number
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.registration_number}
                    onChange={e => setFormData({ ...formData, registration_number: e.target.value })}
                    placeholder="Optional"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                    TPIN
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.tpin}
                    onChange={e => setFormData({ ...formData, tpin: e.target.value })}
                    placeholder="Optional"
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="mobile-stack">
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                    VAT Status
                  </label>
                  <select
                    className="input"
                    value={formData.vat_registered ? 'registered' : 'not_registered'}
                    onChange={e => setFormData({ ...formData, vat_registered: e.target.value === 'registered', vat_number: e.target.value === 'registered' ? formData.vat_number : '' })}
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px' }}
                  >
                    <option value="not_registered">Not Registered / Optional</option>
                    <option value="registered">VAT Registered</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                    VAT Number
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.vat_number}
                    onChange={e => setFormData({ ...formData, vat_number: e.target.value })}
                    placeholder="Optional"
                    disabled={!formData.vat_registered}
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', background: 'var(--surface-muted)', border: '1px solid var(--border)', fontSize: '15px', opacity: formData.vat_registered ? 1 : 0.65 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  className="btn" 
                  onClick={() => setShowModal(false)} 
                  style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'var(--surface-muted)', color: 'var(--text-main)', border: '1px solid var(--border)', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={loading}
                  style={{ flex: 1, padding: '14px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(184,134,11,0.2)', fontWeight: '700' }}
                >
                  {loading ? 'Saving...' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Shops
