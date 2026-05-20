import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Truck, Package, MapPin, User, CheckCircle, Clock, XCircle, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format } from 'date-fns'
import { sanitizePositiveIntegerInput } from '../lib/numberInput'

const STATUS_COLORS = {
  Pending: { bg: 'rgba(255,193,7,0.1)', color: 'var(--text-warning-strong)' },
  Dispatched: { bg: 'rgba(13,202,240,0.1)', color: 'var(--text-info-strong)' },
  Delivered: { bg: 'rgba(34,139,34,0.1)', color: 'var(--success)' },
  Cancelled: { bg: 'rgba(220,53,69,0.1)', color: 'var(--danger)' },
}
const STATUS_ICONS = { Pending: Clock, Dispatched: Truck, Delivered: CheckCircle, Cancelled: XCircle }

const Deliveries = () => {
  const { currentShop, userProfile } = useShop()
  const [deliveries, setDeliveries] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [formData, setFormData] = useState({
    customer_id: '', product_id: '', quantity: '',
    destination: '', driver_name: '', notes: '', delivery_date: ''
  })

  const fetchDeliveries = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('deliveries')
      .select(`*, customers(name, phone), products(name)`)
      .eq('shop_id', currentShop.id)
      .order('created_at', { ascending: false })
    setDeliveries(data || [])
    setLoading(false)
  }, [currentShop])

  const fetchCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, name').eq('shop_id', currentShop.id).order('name')
    setCustomers(data || [])
  }, [currentShop])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('id, name').eq('shop_id', currentShop.id).order('name')
    setProducts(data || [])
  }, [currentShop])

  useEffect(() => {
    if (currentShop) {
      fetchDeliveries()
      fetchCustomers()
      fetchProducts()
    }
  }, [currentShop, fetchDeliveries, fetchCustomers, fetchProducts])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.quantity || Number(formData.quantity) <= 0) {
      alert('Quantity must be a positive number greater than zero.')
      return
    }
    const { error } = await supabase.from('deliveries').insert([{
      ...formData,
      customer_id: formData.customer_id || null,
      product_id: formData.product_id || null,
      delivery_date: formData.delivery_date || null,
      driver_name: formData.driver_name.trim() || null,
      notes: formData.notes.trim() || null,
      shop_id: currentShop.id,
      quantity: parseInt(formData.quantity),
      created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    if (error) { alert(error.message); return }
    setIsModalOpen(false)
    setFormData({ customer_id: '', product_id: '', quantity: '', destination: '', driver_name: '', notes: '', delivery_date: '' })
    fetchDeliveries()
  }

  const updateStatus = async (id, status) => {
    const { error } = await supabase.from('deliveries').update({ status }).eq('id', id)
    if (error) alert(error.message)
    else fetchDeliveries()
  }

  const filtered = filterStatus === 'all' ? deliveries : deliveries.filter(d => d.status === filterStatus)

  const statusCounts = deliveries.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Delivery Tracking</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track farm inputs, seeds, fertilizer — {currentShop?.name}</p>
        </div>
        {(userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && (
          <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
            <Plus size={20} /> New Delivery
          </button>
        )}
      </div>

      {/* Status Summary */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        {['Pending', 'Dispatched', 'Delivered'].map(s => {
          const Icon = STATUS_ICONS[s]
          return (
            <div key={s} className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS[s].color}` }}>
              <div className="stat-icon" style={{ background: STATUS_COLORS[s].bg, color: STATUS_COLORS[s].color }}><Icon /></div>
              <div className="stat-info"><h3>{s}</h3><p>{statusCounts[s] || 0}</p></div>
            </div>
          )
        })}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'Pending', 'Dispatched', 'Delivered', 'Cancelled'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', background: filterStatus === s ? 'var(--primary)' : 'var(--surface-muted)', color: filterStatus === s ? 'white' : 'var(--text-main)' }}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Deliveries */}
      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No deliveries found for this filter.
            </div>
          )}
          {filtered.map(d => {
            const Icon = STATUS_ICONS[d.status] || Clock
            const colors = STATUS_COLORS[d.status] || STATUS_COLORS.Pending
            return (
              <div key={d.id} className="card" style={{ borderLeft: `4px solid ${colors.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Package size={18} color="var(--text-muted)" />
                      <span style={{ fontWeight: '700', fontSize: '16px' }}>{d.products?.name || 'General Delivery'}</span>
                      <span style={{ fontSize: '13px', fontWeight: '600', padding: '2px 10px', borderRadius: '12px', background: colors.bg, color: colors.color }}>
                        <Icon size={12} style={{ display: 'inline', marginRight: '4px' }} />{d.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      <span><User size={13} style={{ display: 'inline' }} /> {d.customers?.name || 'N/A'}</span>
                      <span><MapPin size={13} style={{ display: 'inline' }} /> {d.destination}</span>
                      {d.driver_name && <span><Truck size={13} style={{ display: 'inline' }} /> {d.driver_name}</span>}
                      {d.delivery_date && <span><Calendar size={13} style={{ display: 'inline' }} /> {format(new Date(d.delivery_date), 'dd MMM yyyy')}</span>}
                      <span>Qty: <strong>{d.quantity}</strong></span>
                    </div>
                    {d.notes && <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>📝 {d.notes}</p>}
                  </div>

                  {/* Status Progression */}
                  {(userProfile?.role === 'Owner' || userProfile?.role === 'Manager') && d.status !== 'Cancelled' && d.status !== 'Delivered' && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {d.status === 'Pending' && (
                        <button onClick={() => updateStatus(d.id, 'Dispatched')} className="btn" style={{ fontSize: '12px', padding: '6px 14px', background: 'var(--info)', color: 'white', border: 'none' }}>
                          <Truck size={14} /> Dispatch
                        </button>
                      )}
                      {d.status === 'Dispatched' && (
                        <button onClick={() => updateStatus(d.id, 'Delivered')} className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 14px' }}>
                          <CheckCircle size={14} /> Mark Delivered
                        </button>
                      )}
                      <button onClick={() => updateStatus(d.id, 'Cancelled')} className="btn" style={{ fontSize: '12px', padding: '6px 14px', background: 'var(--surface-danger-muted)', color: 'var(--danger)', border: 'none' }}>
                        <XCircle size={14} /> Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New Delivery Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '24px' }}>New Delivery</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Customer / Recipient</label>
                <select value={formData.customer_id} onChange={e => setFormData({ ...formData, customer_id: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}>
                  <option value="">Walk-in / Not registered</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Product (Optional)</label>
                  <select value={formData.product_id} onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}>
                    <option value="">Select product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Quantity</label>
                  <input type="number" min="1" inputMode="numeric" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: sanitizePositiveIntegerInput(e.target.value) })}
                    placeholder="Enter quantity" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }} required />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Destination / Village</label>
                <input type="text" required value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })}
                  placeholder="e.g. Kasungu, TA Mwase" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Driver Name</label>
                  <input type="text" value={formData.driver_name} onChange={e => setFormData({ ...formData, driver_name: e.target.value })}
                    placeholder="Optional" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Expected Date</label>
                  <input type="date" value={formData.delivery_date} onChange={e => setFormData({ ...formData, delivery_date: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Notes</label>
                <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows="3"
                  placeholder="e.g. 5 x 50kg bags D compound fertilizer..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', resize: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ flex: 1, background: 'var(--surface-muted)', border: 'none', color: 'var(--text-main)' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }}>Create Delivery</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Deliveries
