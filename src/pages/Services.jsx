import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Search, Briefcase, Clock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { confirmAction } from '../lib/dialogs'
import { sanitizePositiveDecimalInput, sanitizePositiveIntegerInput } from '../lib/numberInput'

const Services = () => {
  const { currentShop, userProfile, showSuccess, formatCurrency, currencyPreference } = useShop()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingService, setEditingService] = useState(null)
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    is_active: true
  })

  const fetchServices = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('shop_id', currentShop.id)
      .order('name')
    
    if (error) console.error('Error fetching services:', error)
    else setServices(data)
    setLoading(false)
  }, [currentShop])

  useEffect(() => {
    if (currentShop) {
      fetchServices()
    }
  }, [currentShop, fetchServices])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    if (!formData.price || Number(formData.price) <= 0 || (formData.duration && Number(formData.duration) <= 0)) {
      alert('Use positive numbers greater than zero for price and duration.')
      setLoading(false)
      return
    }
    
    const serviceData = {
      ...formData,
      shop_id: currentShop.id,
      price: parseFloat(formData.price),
      duration: formData.duration ? parseInt(formData.duration) : null
    }

    try {
      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('services')
          .insert([serviceData])
        if (error) throw error
      }
      
      setIsModalOpen(false)
      setEditingService(null)
      setFormData({ name: '', description: '', price: '', duration: '', is_active: true })
      showSuccess(editingService ? 'Service updated successfully!' : 'Service added successfully!')
      fetchServices()
    } catch (error) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (service) => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || '',
      price: service.price.toString(),
      duration: service.duration ? service.duration.toString() : '',
      is_active: service.is_active
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id) => {
    if (!await confirmAction('Are you sure you want to delete this service?')) return
    
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id)
    
    if (error) alert(error.message)
    else {
      showSuccess('Service deleted successfully!')
      fetchServices()
    }
  }

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Service Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage professional services offered at {currentShop?.name}</p>
        </div>
        {(userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && (
          <button onClick={() => { setEditingService(null); setFormData({ name: '', description: '', price: '', duration: '', is_active: true }); setIsModalOpen(true) }} className="btn btn-primary">
            <Plus size={20} />
            <span>Add Service</span>
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={20} />
          <input 
            type="text" 
            placeholder="Search services by name or description..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 45px', borderRadius: '10px', border: '1px solid var(--border)', outline: 'none' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading services...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {filteredServices.map(service => (
            <div key={service.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: `4px solid ${service.is_active ? 'var(--primary)' : 'var(--text-muted)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(184, 134, 11, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px' }}>{service.name}</h3>
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: service.is_active ? 'rgba(34, 139, 34, 0.1)' : '#f0f0f0', color: service.is_active ? 'var(--success)' : 'var(--text-muted)' }}>
                      {service.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </div>
                </div>
                {(userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleEdit(service)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={18} /></button>
                    <button onClick={() => handleDelete(service.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={18} /></button>
                  </div>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', flex: 1 }}>{service.description || 'No description provided.'}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--primary)' }}>
                    <span>{formatCurrency(service.price)}</span>
                  </div>
                  {service.duration && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: 'var(--text-muted)' }}>
                      <Clock size={16} />
                      <span>{service.duration} mins</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filteredServices.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', background: 'var(--surface-elevated)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
              <p style={{ color: 'var(--text-muted)' }}>No services found. Add your first service to get started!</p>
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }}>
            <h2 style={{ marginBottom: '24px' }}>{editingService ? 'Edit Service' : 'Add New Service'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Service Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Haircut, Phone Screen Repair" 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Price ({currencyPreference})</label>
                <input 
                  type="number" 
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: sanitizePositiveDecimalInput(e.target.value)})}
                  placeholder="Enter price" 
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  required 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Duration (Optional mins)</label>
                  <input 
                    type="number" 
                    min="1"
                    inputMode="numeric"
                    value={formData.duration}
                    onChange={(e) => setFormData({...formData, duration: sanitizePositiveIntegerInput(e.target.value)})}
                    placeholder="e.g. 30" 
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '28px' }}>
                  <input 
                    type="checkbox" 
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                    id="is_active"
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="is_active" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Is Active</label>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Description</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows="3"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', resize: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'var(--surface-muted)', border: 'none', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={loading}>
                  {loading ? 'Saving...' : (editingService ? 'Update Service' : 'Create Service')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Services
