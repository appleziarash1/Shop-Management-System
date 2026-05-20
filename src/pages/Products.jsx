import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, Package, AlertTriangle, ScanLine, X, Loader2, CloudOff, Cloud, Download } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { lookupBarcode } from '../lib/barcodeLookup'
import { isOnline, enqueueInventoryAction } from '../lib/offlineQueue'
import { syncManager } from '../lib/syncManager'
import { confirmAction } from '../lib/dialogs'
import BarcodeScanner from '../components/BarcodeScanner'
import { sanitizePositiveDecimalInput, sanitizePositiveIntegerInput } from '../lib/numberInput'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { downloadListReport } from '../lib/reportGenerator'

const Products = () => {
  const { currentShop, userProfile, refreshLowStock, canModifyCurrentShop, shopAccessMessage, formatCurrency, currencyPreference, showSuccess } = useShop()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    category: 'Groceries',
    brand: '',
    unit_size: '',
    image_url: '',
    quantity: '',
    min_quantity: '',
    cost_price: '',
    selling_price: ''
  })
  const [isScanning, setIsScanning] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState(null)
  const [categories, setCategories] = useState(['Groceries', 'Electronics', 'Clothing', 'Cosmetics', 'Hardware'])
  const [isNewCategory, setIsNewCategory] = useState(false)
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [adjustingProduct, setAdjustingProduct] = useState(null)
  const [adjustmentForm, setAdjustmentForm] = useState({
    adjustment_type: 'adjustment_increase',
    quantity: '',
    notes: ''
  })

  const fetchProducts = useCallback(async () => {
    if (!currentShop) return
    setLoading(true)
    try {
      const data = await syncManager.getProducts(currentShop.id)
      setProducts(data || [])
      
      // Extract unique categories
      const uniqueCategories = [...new Set([
        'Groceries', 'Electronics', 'Clothing', 'Cosmetics', 'Hardware',
        ...(data || []).map(p => p.category).filter(Boolean)
      ])].sort()
      setCategories(uniqueCategories)
    } catch (err) {
      console.error('Error fetching products:', err)
    } finally {
      setLoading(false)
    }
  }, [currentShop])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleBarcodeLookup = async (code) => {
    const cleanedCode = String(code || '').trim()
    if (!cleanedCode) return

    setFormData(prev => ({ ...prev, barcode: cleanedCode }))
    setIsLookingUp(true)

    // First, check if barcode already exists in current inventory
    const existingProduct = products.find(p => p.barcode?.toLowerCase() === cleanedCode.toLowerCase())
    
    if (existingProduct) {
      // Product exists in inventory - populate with existing details
      setFormData(prev => ({
        ...prev,
        barcode: cleanedCode,
        name: existingProduct.name,
        brand: existingProduct.brand || '',
        category: existingProduct.category,
        unit_size: existingProduct.unit_size || '',
        image_url: existingProduct.image_url || '',
        quantity: '', // Empty so user enters quantity to add
        min_quantity: existingProduct.min_quantity,
        cost_price: existingProduct.cost_price,
        selling_price: existingProduct.selling_price
      }))
      setIsEditing(true)
      setEditId(existingProduct.id)
      setIsLookingUp(false)
      return
    }

    // If not found locally, try Open Food Facts API
    const details = await lookupBarcode(cleanedCode)
    if (details) {
      setFormData(prev => ({
        ...prev,
        barcode: cleanedCode,
        name: details.name,
        brand: details.brand,
        category: details.category || prev.category,
        unit_size: details.unit_size,
        image_url: details.image_url
      }))
    } else {
      setFormData(prev => ({ ...prev, barcode: cleanedCode }))
    }
    setIsLookingUp(false)
  }

  const handleSaveProduct = async (e) => {
    e.preventDefault()
    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }

    if (!formData.quantity || Number(formData.quantity) <= 0 || !formData.min_quantity || Number(formData.min_quantity) <= 0 || !formData.cost_price || Number(formData.cost_price) <= 0 || !formData.selling_price || Number(formData.selling_price) <= 0) {
      alert('Please enter valid positive numbers for quantity, minimum quantity, and prices.')
      return
    }

    if (Number(formData.selling_price) < Number(formData.cost_price)) {
      alert('Selling price cannot be lower than cost price.')
      return
    }

    const finalData = {
      ...formData,
      quantity: parseInt(formData.quantity) || 0,
      min_quantity: parseInt(formData.min_quantity) || 0,
      cost_price: parseFloat(formData.cost_price) || 0,
      selling_price: parseFloat(formData.selling_price) || 0,
      shop_id: currentShop?.id
    }

    if (!isEditing) {
      finalData.opening_stock = finalData.quantity
    }

    // Tiered Save Logic (Online -> Offline Queue)
    if (isOnline()) {
      try {
        let error;
        if (isEditing) {
          // Get original product to calculate quantity change
          const originalProduct = products.find(p => p.id === editId)
          const originalQuantity = originalProduct?.quantity || 0
          const quantityAdded = finalData.quantity - originalQuantity

          const res = await supabase.from('products').update(finalData).eq('id', editId)
          error = res.error

          // If stock was added via barcode lookup, create purchase record for tracking
          if (!error && quantityAdded > 0) {
            const { data: authData } = await supabase.auth.getUser()
            await supabase.from('purchases').insert([{
              shop_id: finalData.shop_id,
              product_id: editId,
              quantity: quantityAdded,
              cost_price: finalData.cost_price,
              selling_price: finalData.selling_price,
              created_by: authData?.user?.id
            }]).catch(err => console.warn('Purchases record creation failed:', err))
          }
        } else {
          const res = await supabase.from('products').insert([finalData]).select()
          error = res.error

          if (!error && res.data?.[0]) {
            const newProduct = res.data[0]
            if (newProduct.quantity > 0) {
              const { data: authData } = await supabase.auth.getUser()
              await supabase.from('purchases').insert([{
                shop_id: finalData.shop_id,
                product_id: newProduct.id,
                quantity: newProduct.quantity,
                cost_price: newProduct.cost_price,
                selling_price: newProduct.selling_price,
                created_by: authData?.user?.id
              }])
            }
          }
        }

        if (!error) {
          setShowModal(false)
          resetForm()
          fetchProducts()
          refreshLowStock()
          
          // More contextual success message
          let successMsg = 'Product added successfully!'
          if (isEditing) {
            const originalProduct = products.find(p => p.id === editId)
            if (originalProduct?.barcode === formData.barcode) {
              successMsg = `Stock added successfully! (+${finalData.quantity - (originalProduct?.quantity || 0)} units)`
            } else {
              successMsg = 'Product updated successfully!'
            }
          }
          showSuccess(successMsg)
          return
        } else {
          console.warn('Supabase save failed, falling back to offline queue...', error)
        }
      } catch (err) {
        console.warn('Network error during save, falling back to offline queue...', err)
      }
    }

    // Offline Queue Fallback
    const actionType = isEditing ? 'UPDATE' : 'INSERT'
    const queueData = isEditing ? { ...finalData, id: editId } : finalData
    
    await enqueueInventoryAction(actionType, queueData)
    
    // Contextual offline message
    let offlineMsg = 'Product saved locally! It will sync when online.'
    if (isEditing) {
      const originalProduct = products.find(p => p.id === editId)
      if (originalProduct?.barcode === formData.barcode) {
        offlineMsg = 'Stock addition saved locally! It will sync when online.'
      }
    }
    alert(`ESCOM outage? ${offlineMsg}`)
    
    setShowModal(false)
    resetForm()
    fetchProducts() // This will refresh from IndexedDB including the optimistic update
  }

  const handleDeleteProduct = async (id) => {
    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }
    if (userProfile?.role !== 'Owner' && userProfile?.role !== 'Admin') {
      alert('Unauthorized: Only shop owners or admins can delete products.')
      return
    }

    if (!await confirmAction('Are you sure you want to delete this product?')) return
    if (isOnline()) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (!error) {
          fetchProducts()
          refreshLowStock()
          showSuccess('Product deleted successfully')
          return
        }
      } catch {
        console.warn('Delete failed, falling back to offline queue...')
      }
    }

    await enqueueInventoryAction('DELETE', { id })
    alert('Product marked for deletion locally.')
    fetchProducts()
  }

  const handleExportPDF = () => {
    const reportData = filteredProducts.map(p => [
      p.name,
      p.brand || '-',
      p.unit_size || '-',
      p.category,
      p.quantity,
      formatCurrency(p.cost_price),
      formatCurrency(p.selling_price)
    ])

    const totalStockValue = filteredProducts.reduce((sum, p) => sum + (Number(p.quantity) * Number(p.cost_price)), 0)
    const totalPossibleRevenue = filteredProducts.reduce((sum, p) => sum + (Number(p.quantity) * Number(p.selling_price)), 0)

    downloadListReport({
      title: 'Inventory Status Report',
      headers: ['Product Name', 'Brand', 'Unit', 'Category', 'Stock', `Cost (${currencyPreference})`, `Price (${currencyPreference})`],
      data: reportData,
      shop: currentShop,
      fileName: 'inventory_report',
      orientation: 'l',
      summaryText: `Total Inventory Cost: ${formatCurrency(totalStockValue)} | Estimated Potential Sales: ${formatCurrency(totalPossibleRevenue)}`
    })
  }

  const resetForm = () => {
    setIsEditing(false)
    setEditId(null)
    setFormData({ name: '', barcode: '', category: 'Groceries', brand: '', unit_size: '', image_url: '', quantity: '', min_quantity: '', cost_price: '', selling_price: '' })
    setIsNewCategory(false)
  }

  const handleEditClick = (product) => {
    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }
    setFormData({
      name: product.name,
      barcode: product.barcode || '',
      category: product.category,
      brand: product.brand || '',
      unit_size: product.unit_size || '',
      image_url: product.image_url || '',
      quantity: product.quantity,
      min_quantity: product.min_quantity,
      cost_price: product.cost_price,
      selling_price: product.selling_price
    })
    setEditId(product.id)
    setIsEditing(true)
    setIsNewCategory(false)
    setShowModal(true)
  }

  const startScanner = () => setIsScanning(true)
  const stopScanner = () => setIsScanning(false)

  const resetAdjustmentState = () => {
    setAdjustmentForm({
      adjustment_type: 'adjustment_increase',
      quantity: '',
      notes: ''
    })
    setAdjustingProduct(null)
  }

  const openAdjustmentModal = (product) => {
    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }

    setAdjustingProduct(product)
    setAdjustmentForm({
      adjustment_type: 'adjustment_increase',
      quantity: '',
      notes: ''
    })
    setShowAdjustmentModal(true)
  }

  const handleSaveAdjustment = async (e) => {
    e.preventDefault()

    if (!adjustingProduct) return

    const quantity = parseInt(adjustmentForm.quantity || 0, 10)
    if (!quantity || quantity <= 0) {
      alert('Enter a positive quantity for the stock movement.')
      return
    }

    if (!isOnline()) {
      alert('Stock adjustments need an internet connection right now.')
      return
    }

    const currentQuantity = Number(adjustingProduct.quantity || 0)
    const quantityChange = adjustmentForm.adjustment_type === 'adjustment_increase' ? quantity : -quantity
    const nextQuantity = currentQuantity + quantityChange

    if (nextQuantity < 0) {
      alert('This adjustment would reduce stock below zero.')
      return
    }

    setSavingAdjustment(true)
    try {
      const { error: productError } = await supabase
        .from('products')
        .update({ quantity: nextQuantity })
        .eq('id', adjustingProduct.id)

      if (productError) throw productError

      const { error: adjustmentError } = await supabase
        .from('stock_adjustments')
        .insert([{
          shop_id: currentShop.id,
          product_id: adjustingProduct.id,
          adjustment_type: adjustmentForm.adjustment_type,
          quantity,
          notes: adjustmentForm.notes.trim(),
          created_by: userProfile?.id || null
        }])

      if (adjustmentError) throw adjustmentError

      await fetchProducts()
      refreshLowStock()
      setShowAdjustmentModal(false)
      resetAdjustmentState()
      showSuccess(adjustmentForm.adjustment_type === 'damage' ? 'Damage recorded successfully!' : 'Stock adjustment recorded successfully!')
    } catch (error) {
      alert('Could not save stock movement: ' + getFriendlyErrorMessage(error))
    } finally {
      setSavingAdjustment(false)
    }
  }

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.unit_size?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="fade-in">
      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Inventory Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Track and manage your shop's stock levels offline or online.</p>
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
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            disabled={!currentShop || currentShop.id === 'all' || !canModifyCurrentShop}
          >
            <Plus size={20} />
            <span>{!currentShop || currentShop.id === 'all' ? 'Select Branch to Add' : 'Add Product'}</span>
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
            <input 
              type="text" 
              placeholder="Search by name, brand, category, barcode, or unit size..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
            />
          </div>
          <button className="btn" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-main)' }}>
            <Filter size={20} />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading inventory...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Product</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Details</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Category</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>In Stock</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Cost</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Price</th>
                <th style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '500' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: p._isPending ? 0.7 : 1 }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ position: 'relative' }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'contain', background: '#f8f9fa' }} />
                        ) : (
                          <div style={{ width: '40px', height: '40px', background: 'var(--surface-muted)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Package size={20} color="var(--text-muted)" />
                          </div>
                        )}
                        {p._isPending && (
                          <div style={{ position: 'absolute', top: -5, right: -5, background: 'var(--warning)', color: 'white', borderRadius: '50%', padding: '2px', border: '2px solid white' }}>
                            <CloudOff size={10} />
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {p.name}
                          {p._isPending && <span style={{ fontSize: '9px', background: 'rgba(255,193,7,0.1)', color: '#b8860b', padding: '1px 4px', borderRadius: '4px' }}>Syncing...</span>}
                        </div>
                        {p.barcode && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.barcode}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px' }}>
                    <div style={{ fontWeight: '500' }}>{p.brand}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{p.unit_size}</div>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ padding: '4px 8px', background: 'var(--surface-muted)', borderRadius: '4px', fontSize: '12px' }}>{p.category}</span>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 'bold', color: p.quantity <= p.min_quantity ? 'var(--danger)' : 'inherit', fontSize: '15px' }}>
                        {p.quantity}
                      </span>
                      {p.quantity <= p.min_quantity && <AlertTriangle size={14} color="var(--danger)" />}
                    </div>
                  </td>
                  <td style={{ padding: '16px' }}>{formatCurrency(p.cost_price)}</td>
                  <td style={{ padding: '16px', fontWeight: 'bold' }}>{formatCurrency(p.selling_price)}</td>
                  <td style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {(userProfile?.role === 'Owner' || userProfile?.role === 'Admin' || userProfile?.role === 'Manager') ? (
                        <>
                          <button 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}
                            onClick={() => openAdjustmentModal(p)}
                            title="Adjust or record damaged stock"
                          >
                            <Package size={18} />
                          </button>
                          <button 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            onClick={() => handleEditClick(p)}
                            title="Edit Product"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                            onClick={() => handleDeleteProduct(p.id)}
                            title="Delete Product"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Read Only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No products found matching your search.</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '95vh', overflowY: 'auto' }}>
            <form onSubmit={handleSaveProduct}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '24px' }}>
                  {isEditing && products.find(p => p.id === editId)?.barcode === formData.barcode 
                    ? 'Add Stock to Product' 
                    : isEditing 
                    ? 'Edit Product' 
                    : 'Add New Product'}
                </h2>
                <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
              </div>

              {isEditing && products.find(p => p.id === editId) && (
                <div style={{ marginBottom: '20px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', color: '#1a7d1a', fontSize: '13px' }}>
                  ✓ Product found in inventory! Scan quantity to add to existing stock.
                </div>
              )}

              <div style={{ marginBottom: '20px', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', background: 'var(--surface-elevated)' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Global Scan & Lookup</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <input 
                    type="text" 
                    value={formData.barcode}
                    onChange={(e) => setFormData({...formData, barcode: e.target.value})}
                    onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup(formData.barcode)}
                    placeholder="Scan or enter barcode"
                    style={{ flex: 1, minWidth: 0, padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none' }}
                  />
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ background: 'var(--primary)', color: 'white', border: 'none', flexShrink: 0, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                    onClick={startScanner}
                  >
                    <ScanLine size={20} />
                  </button>
                </div>
                {isScanning && (
                  <BarcodeScanner
                    open={isScanning}
                    elementId="reader-inventory"
                    onDetected={handleBarcodeLookup}
                    onClose={stopScanner}
                    title="Inventory Scan"
                    description="Scan with the camera or type the code directly to fill product details."
                  />
                )}
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Scan a barcode to automatically fetch name, brand, category, and unit size.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="mobile-stack">
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Product Name</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
                      required
                      placeholder="e.g. Milk Tin"
                    />
                    {isLookingUp && <div style={{ position: 'absolute', right: 12, top: 12 }}><Loader2 size={18} className="spin" /></div>}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Brand</label>
                  <input type="text" value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} placeholder="e.g. Nestle" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Unit Size</label>
                  <input type="text" value={formData.unit_size} onChange={(e) => setFormData({...formData, unit_size: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} placeholder="e.g. 500g" />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === 'ADD_NEW') {
                        setIsNewCategory(true)
                        setFormData({...formData, category: ''})
                      } else {
                        setFormData({...formData, category: e.target.value})
                      }
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    <option value="ADD_NEW">+ Add New Category...</option>
                  </select>
                </div>
                {isNewCategory && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>New Category Name</label>
                    <input type="text" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '2px solid var(--primary)' }} autoFocus />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                    {isEditing && products.find(p => p.id === editId)?.barcode === formData.barcode 
                      ? 'Quantity to Add' 
                      : isEditing 
                      ? 'Current Stock' 
                      : 'Opening Stock'}
                  </label>
                  <input type="number" min="1" inputMode="numeric" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: sanitizePositiveIntegerInput(e.target.value)})} placeholder={
                    isEditing && products.find(p => p.id === editId)?.barcode === formData.barcode 
                      ? 'Enter qty to add to existing stock' 
                      : isEditing 
                      ? 'Enter current stock quantity' 
                      : 'Enter opening stock quantity'
                  } style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Low Stock Alert</label>
                  <input type="number" min="1" inputMode="numeric" value={formData.min_quantity} onChange={(e) => setFormData({...formData, min_quantity: sanitizePositiveIntegerInput(e.target.value)})} placeholder="Enter low stock limit" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} required />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Cost Price ({currencyPreference})</label>
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={formData.cost_price} onChange={(e) => setFormData({...formData, cost_price: sanitizePositiveDecimalInput(e.target.value)})} placeholder="Enter cost price" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Selling Price ({currencyPreference})</label>
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={formData.selling_price} onChange={(e) => setFormData({...formData, selling_price: sanitizePositiveDecimalInput(e.target.value)})} placeholder="Enter selling price" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '2px solid var(--primary)' }} required />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '32px' }}>
                <button type="button" className="btn" style={{ background: 'var(--surface-muted)', color: 'var(--text-main)' }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0 32px' }}>
                  {isEditing && products.find(p => p.id === editId)?.barcode === formData.barcode 
                    ? 'Add Stock' 
                    : isEditing 
                    ? 'Update Product' 
                    : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdjustmentModal && adjustingProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px' }}>
            <form onSubmit={handleSaveAdjustment}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>Adjust Stock</h2>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{adjustingProduct.name}</p>
                </div>
                <button type="button" onClick={() => { setShowAdjustmentModal(false); resetAdjustmentState() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X /></button>
              </div>

              <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface-muted)', color: 'var(--text-main)', fontSize: '14px' }}>
                Current stock: <strong>{adjustingProduct.quantity}</strong>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Movement Type</label>
                <select value={adjustmentForm.adjustment_type} onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, adjustment_type: e.target.value }))} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <option value="adjustment_increase">Stock Increase Adjustment</option>
                  <option value="adjustment_decrease">Stock Decrease Adjustment</option>
                  <option value="damage">Damaged / Lost Stock</option>
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Quantity</label>
                <input type="number" min="1" inputMode="numeric" value={adjustmentForm.quantity} onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, quantity: sanitizePositiveIntegerInput(e.target.value) }))} placeholder="Enter quantity" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }} required />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>Notes</label>
                <textarea value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional reason, e.g. broken items or manual stock recount" rows={3} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn" style={{ background: 'var(--surface-muted)', color: 'var(--text-main)' }} onClick={() => { setShowAdjustmentModal(false); resetAdjustmentState() }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingAdjustment}>{savingAdjustment ? 'Saving...' : 'Save Movement'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

export default Products
