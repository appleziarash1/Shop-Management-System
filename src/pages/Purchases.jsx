import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Truck, Package, User, ScanLine, Trash2, CheckCircle, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { format } from 'date-fns'
import { lookupBarcode } from '../lib/barcodeLookup'
import BarcodeScanner from '../components/BarcodeScanner'
import { isOnline, enqueuePurchase, getQueueCount } from '../lib/offlineQueue'
import { CloudOff, Cloud } from 'lucide-react'

const Purchases = () => {
  const { currentShop, userProfile, canModifyCurrentShop, formatCurrency, currencyPreference, refreshData } = useShop()
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  
  // Cart for bulk restocking
  const [cart, setCart] = useState([])
  const [supplierId, setSupplierId] = useState('')
  
  // New Item Form State
  const [isScanning, setIsScanning] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [itemFormData, setItemFormData] = useState({
    name: '',
    barcode: '',
    category: 'Groceries',
    brand: '',
    unit_size: '',
    image_url: '',
    quantity: '',
    cost_price: '',
    selling_price: ''
  })

  const fetchPurchases = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('purchases').select(`*, products(*), suppliers(*)`).order('p_date', { ascending: false })
    if (currentShop && currentShop.id !== 'all') {
      query = query.eq('shop_id', currentShop.id)
    }
    const { data } = await query
    setPurchases(data || [])
    setLoading(false)
  }, [currentShop])

  const fetchSuppliers = useCallback(async () => {
    if (!currentShop || currentShop.id === 'all') {
      setSuppliers([])
      return
    }
    const { data } = await supabase.from('suppliers').select('*').eq('shop_id', currentShop.id)
    setSuppliers(data || [])
  }, [currentShop])

  useEffect(() => {
    if (currentShop) {
      fetchPurchases()
      fetchSuppliers()
    }
  }, [currentShop, fetchPurchases, fetchSuppliers])

  const handleBarcodeLookup = async (code) => {
    const cleanedCode = String(code || '').trim()
    if (!cleanedCode) return

    setItemFormData(prev => ({ ...prev, barcode: cleanedCode }))
    setIsLookingUp(true)
    const details = await lookupBarcode(cleanedCode)
    if (details) {
      setItemFormData(prev => ({
        ...prev,
        barcode: cleanedCode,
        name: details.name,
        brand: details.brand,
        category: details.category || 'Groceries',
        unit_size: details.unit_size,
        image_url: details.image_url
      }))
    } else {
      setItemFormData(prev => ({ ...prev, barcode: cleanedCode }))
    }
    setIsLookingUp(false)
  }

  const startScanner = async () => {
    setIsScanning(true)
  }

  const stopScanner = () => {
    setIsScanning(false)
  }

  const addToCart = () => {
    if (!itemFormData.name || !itemFormData.quantity || !itemFormData.cost_price) {
      alert('Please fill in Product Name, Quantity, and Cost Price.')
      return
    }

    if (Number(itemFormData.quantity) <= 0 || Number(itemFormData.cost_price) <= 0 || (itemFormData.selling_price && Number(itemFormData.selling_price) <= 0)) {
      alert('Use positive numbers greater than zero for quantity and prices.')
      return
    }

    const newItem = {
      ...itemFormData,
      id: Date.now(), // Temporary ID for cart
      quantity: parseInt(itemFormData.quantity) || 0,
      cost_price: parseFloat(itemFormData.cost_price) || 0,
      selling_price: parseFloat(itemFormData.selling_price) || 0
    }

    setCart([...cart, newItem])
    // Reset form for next item
    setItemFormData({
      name: '',
      barcode: '',
      category: 'Groceries',
      brand: '',
      unit_size: '',
      image_url: '',
      quantity: '',
      cost_price: '',
      selling_price: ''
    })
  }

  const removeFromCart = (tempId) => {
    setCart(cart.filter(item => item.id !== tempId))
  }

  const processBulkDelivery = async () => {
    if (cart.length === 0) return
    if (!supplierId) {
      alert('Please select a supplier for this delivery.')
      return
    }

    setSaving(true)
    try {
      const purchasePayload = {
        purchase: { shop_id: currentShop.id, supplier_id: supplierId },
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          cost_price: item.cost_price,
          selling_price: item.selling_price || 0
        }))
      }

      // Try live processing first
      if (isOnline()) {
        // Process each item in the cart
        for (const item of cart) {
          let productId = null

          // 1. Check if product exists by barcode or name
          let productQuery = supabase.from('products').select('*').eq('shop_id', currentShop.id)
          if (item.barcode) {
            productQuery = productQuery.eq('barcode', item.barcode)
          } else {
            productQuery = productQuery.ilike('name', item.name)
          }

          const { data: existingProducts } = await productQuery

          if (existingProducts && existingProducts.length > 0) {
            const matched = existingProducts[0]
            productId = matched.id
            
            // Update existing product
            await supabase.from('products').update({
              quantity: matched.quantity + item.quantity,
              cost_price: item.cost_price,
              selling_price: item.selling_price || matched.selling_price,
              brand: item.brand || matched.brand,
              unit_size: item.unit_size || matched.unit_size,
              image_url: item.image_url || matched.image_url
            }).eq('id', productId)
          } else {
            // Create new product
            const { data: newProd, error: prodErr } = await supabase.from('products').insert([{
              shop_id: currentShop.id,
              name: item.name,
              barcode: item.barcode,
              category: item.category,
              brand: item.brand,
              unit_size: item.unit_size,
              image_url: item.image_url,
              opening_stock: item.quantity,
              quantity: item.quantity,
              cost_price: item.cost_price,
              selling_price: item.selling_price || 0,
              min_quantity: 5
            }]).select().single()
            
            if (prodErr) throw prodErr
            productId = newProd.id
          }

          // 2. Record the purchase
          await supabase.from('purchases').insert([{
            shop_id: currentShop.id,
            product_id: productId,
            supplier_id: supplierId,
            quantity: item.quantity,
            cost_price: item.cost_price,
            selling_price: item.selling_price || 0,
            p_date: new Date().toISOString(),
            created_by: userProfile.id
          }])
        }

        alert('Delivery processed successfully! Inventory updated.')
        setShowModal(false)
        setCart([])
        fetchPurchases()
        refreshData()
      } else {
        // Offline fallback
        await enqueuePurchase(purchasePayload)
        const count = await getQueueCount()
        alert(`Purchase saved locally! (${count} items queued)`)
        setShowModal(false)
        setCart([])
      }
    } catch (error) {
      console.error('Processing error:', error)
      alert('Failed to process delivery: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredPurchases = purchases.filter(p => 
    p.products?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.suppliers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (userProfile?.role !== 'Owner' && userProfile?.role !== 'Manager') {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: '16px' }}>Access Denied</h2>
        <p>You do not have permission to manage purchases.</p>
      </div>
    )
  }

  return (
    <div className="fade-in">
      {/* Network Status Banner */}
      {!isOnline() && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#dc3545', color: 'white', padding: '10px', zIndex: 2000, display: 'flex', gap: '10px', justifyContent: 'center', fontSize: '14px' }}>
          <CloudOff size={18} />
          <span>OFFLINE: Purchases are saving to device. Don't clear browser cache.</span>
        </div>
      )}

      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px', marginTop: (!isOnline() ? '45px' : '0') }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Inventory Restock</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage incoming stock shipments.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => { setCart([]); setShowModal(true) }}
          disabled={!currentShop || currentShop.id === 'all' || !canModifyCurrentShop}
        >
          <Plus size={20} />
          <span>New Delivery</span>
        </button>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
          <input 
            type="text" 
            placeholder="Search recent restocks..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
          />
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Date</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Product</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Details</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Supplier</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Qty</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '16px', fontSize: '13px' }}>{format(new Date(p.p_date), 'dd MMM yyyy, HH:mm')}</td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {p.products?.image_url ? (
                        <img src={p.products.image_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'contain', background: '#f8f8f8' }} />
                      ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Package size={16} color="var(--text-muted)" />
                        </div>
                      )}
                      <span style={{ fontWeight: '600' }}>{p.products?.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {p.products?.brand} {p.products?.unit_size}
                  </td>
                  <td style={{ padding: '16px' }}>{p.suppliers?.name}</td>
                  <td style={{ padding: '16px', color: 'var(--success)', fontWeight: 'bold' }}>+{p.quantity}</td>
                  <td style={{ padding: '16px', fontWeight: 'bold' }}>{formatCurrency(p.cost_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredPurchases.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No restock records found.</div>
          )}
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '1000px', maxHeight: '95vh', overflowY: 'auto', display: 'grid', gridTemplateColumns: cart.length > 0 ? '1fr 350px' : '1fr', gap: '24px' }}>
            
            {/* Left Side: Product Entry */}
            <div style={{ padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '24px' }}>Log Delivery Shipment</h2>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X /></button>
              </div>

              <div className="card" style={{ background: 'var(--bg-main)', marginBottom: '20px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Scan Barcode</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        placeholder="Scan or type barcode..." 
                        value={itemFormData.barcode}
                        onChange={(e) => setItemFormData({...itemFormData, barcode: e.target.value})}
                        onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup(itemFormData.barcode)}
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                      />
                      <button onClick={startScanner} className="btn" style={{ background: 'var(--primary)', color: 'white', border: 'none' }}>
                        <ScanLine size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                {isScanning && (
                  <BarcodeScanner
                    open={isScanning}
                    elementId="restock-scanner"
                    onDetected={handleBarcodeLookup}
                    onClose={stopScanner}
                    title="Delivery Scan"
                    description="Scan with the camera or type the code to prefill this incoming item."
                  />
                )}

                <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Product Name</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="text" 
                        value={itemFormData.name} 
                        onChange={(e) => setItemFormData({...itemFormData, name: e.target.value})}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: '600' }}
                        placeholder="Product identity"
                        required
                      />
                      {isLookingUp && <div style={{ position: 'absolute', right: 12, top: 12 }}><Loader2 size={20} className="spin" /></div>}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Brand / Manufacturer</label>
                    <input type="text" value={itemFormData.brand} onChange={(e) => setItemFormData({...itemFormData, brand: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} placeholder="e.g. Coca-Cola" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Unit Size</label>
                    <input type="text" value={itemFormData.unit_size} onChange={(e) => setItemFormData({...itemFormData, unit_size: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} placeholder="e.g. 500ml, 1kg" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Quantity arriving</label>
                    <input type="number" min="1" inputMode="numeric" value={itemFormData.quantity} onChange={(e) => setItemFormData({...itemFormData, quantity: sanitizePositiveIntegerInput(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '2px solid var(--primary)' }} placeholder="Enter quantity" required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Cost Price ({currencyPreference})</label>
                    <input type="number" min="0.01" step="0.01" inputMode="decimal" value={itemFormData.cost_price} onChange={(e) => setItemFormData({...itemFormData, cost_price: sanitizePositiveDecimalInput(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '2px solid var(--primary)' }} placeholder="Enter cost price" required />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Selling Price (Optional)</label>
                    <input type="number" min="0.01" step="0.01" inputMode="decimal" value={itemFormData.selling_price} onChange={(e) => setItemFormData({...itemFormData, selling_price: sanitizePositiveDecimalInput(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} placeholder="Recommended price" />
                  </div>
                  <div style={{ alignSelf: 'end' }}>
                    <button onClick={addToCart} className="btn btn-primary" style={{ width: '100%', height: '44px' }}>
                      <Plus size={18} /> <span>Add to Cart</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side: Delivery Cart */}
            {cart.length > 0 && (
              <div style={{ borderLeft: '1px solid var(--border)', padding: '8px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Delivery Supplier</label>
                  <select 
                    value={supplierId} 
                    onChange={(e) => setSupplierId(e.target.value)} 
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-elevated)' }}
                    required
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.tpin ? ` - TPIN ${s.tpin}` : ''}{s.registration_number ? ` - Reg ${s.registration_number}` : ''}</option>)}
                  </select>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--text-muted)' }}>Products in this delivery ({cart.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {cart.map(item => (
                      <div key={item.id} className="card" style={{ padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--border)', fontSize: '13px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 'bold' }}>{item.name}</p>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Qty: {item.quantity} | Cost: {formatCurrency(item.cost_price)}</p>
                          </div>
                          <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ paddingTop: '16px', borderTop: '2px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <span style={{ fontWeight: 'bold' }}>Total Value:</span>
                    <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{formatCurrency(cart.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0))}</span>
                  </div>
                  <button 
                    onClick={processBulkDelivery} 
                    className="btn btn-primary" 
                    style={{ width: '100%', height: '50px', fontSize: '16px' }}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="spin" /> : <CheckCircle size={20} />}
                    <span>{saving ? 'Processing...' : 'Confirm Delivery'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @media (max-width: 768px) {
          .bulk-restock-container { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

export default Purchases
