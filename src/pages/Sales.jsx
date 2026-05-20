import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, User, Package, Briefcase, WifiOff, Wifi, RefreshCw, ScanLine, CheckCircle, Smartphone, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useShop } from '../context/ShopContext'
import { enqueueSale, getQueueCount, processSyncQueue, isOnline } from '../lib/offlineQueue'
import { syncManager } from '../lib/syncManager'
import BarcodeScanner from '../components/BarcodeScanner'
import { downloadReceiptPdf } from '../lib/receiptPrinter'

const Sales = () => {
  const { currentShop, canModifyCurrentShop, shopAccessMessage, formatCurrency, currencyPreference, refreshData, showSuccess, userProfile, activeSession, logAuditEvent } = useShop()
  const [products, setProducts] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('Products')
  const [selectedCategory, setSelectedCategory] = useState('All')
  
  // Cart and Sale State
  const [cart, setCart] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [customers, setCustomers] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  
  // UI State
  const [isCartExpanded, setIsCartExpanded] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [quantityDialog, setQuantityDialog] = useState({ show: false, item: null, quantity: '' })

  // Network/Sync State
  const [isNetworkOnline, setIsNetworkOnline] = useState(isOnline())
  const [pendingSync, setPendingSync] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')

  // 1. Initial Data Fetching with Offline Fallback
  const loadData = useCallback(async () => {
    if (!currentShop) return
    setLoading(true)
    try {
      const [pData, sData, cData] = await Promise.all([
        syncManager.getProducts(currentShop.id),
        syncManager.getServices(currentShop.id),
        syncManager.getCustomers(currentShop.id)
      ])
      setProducts(pData || [])
      setServices(sData || [])
      setCustomers(cData || [])
    } finally {
      setLoading(false)
    }
  }, [currentShop])

  useEffect(() => {
    if (currentShop) {
      loadData()
    }
  }, [currentShop, loadData])

  // Monitor online status and background sync queue
  useEffect(() => {
    const updateStatus = async () => {
      setIsNetworkOnline(isOnline())
      const count = await getQueueCount()
      setPendingSync(count)
    }
    
    const handleOnline = async () => {
      setIsNetworkOnline(true)
      setSyncMessage('Back online! Syncing saved sales...')
      const results = await processSyncQueue((msg) => setSyncMessage(msg))
      setSyncMessage(results.success > 0 ? `Synced ${results.success} sales!` : '')
      const count = await getQueueCount()
      setPendingSync(count)
      setTimeout(() => setSyncMessage(''), 4000)
    }

    const handleOffline = () => setIsNetworkOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    updateStatus()
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 2. Computed Categories
  const categories = useMemo(() => {
    const items = activeTab === 'Products' ? products : services
    const cats = ['All', ...new Set(items.map(item => item.category).filter(Boolean))]
    return cats
  }, [activeTab, products, services])

  // 3. Filtered Items
  const filteredItems = useMemo(() => {
    const items = activeTab === 'Products' ? products : services
    return items.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           item.barcode?.includes(searchTerm)
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [activeTab, products, services, searchTerm, selectedCategory])

  // 4. Cart Actions
  const addToCart = (item, manualIsService = null) => {
    const isService = manualIsService !== null ? manualIsService : activeTab === 'Services'
    const existing = cart.find(c => c.id === item.id && c.isService === isService)
    
    if (existing) {
      if (!isService && existing.cartQuantity >= item.quantity) {
        alert('Cannot add more: Out of stock')
        return
      }
      setCart(cart.map(c => 
        (c.id === item.id && c.isService === isService) ? { ...c, cartQuantity: c.cartQuantity + 1 } : c
      ))
    } else {
      setCart([...cart, { ...item, cartQuantity: 1, isService }])
    }
  }

  const showQuantityDialog = (item) => {
    const isService = activeTab === 'Services'
    const maxQuantity = isService ? 999 : item.quantity
    setQuantityDialog({ show: true, item, quantity: '', maxQuantity })
  }

  const addToCartWithQuantity = () => {
    const { item, quantity } = quantityDialog
    const finalQty = parseInt(quantity)
    if (!item || !finalQty || finalQty < 1) return

    const isService = activeTab === 'Services'
    const existing = cart.find(c => c.id === item.id && c.isService === isService)
    
    if (existing) {
      const newQuantity = existing.cartQuantity + finalQty
      if (!isService && newQuantity > item.quantity) {
        alert('Cannot add more: Out of stock')
        return
      }
      setCart(cart.map(c => 
        (c.id === item.id && c.isService === isService) ? { ...c, cartQuantity: newQuantity } : c
      ))
    } else {
      setCart([...cart, { ...item, cartQuantity: finalQty, isService }])
    }
    
    setQuantityDialog({ show: false, item: null, quantity: '' })
  }

  // Barcode Scanner Logic for Sales
  const startScanner = () => setIsScanning(true)
  const stopScanner = () => setIsScanning(false)

  const handleBarcodeScan = async (decodedText) => {
    const cleanedCode = String(decodedText || '').trim()
    if (!cleanedCode) return

    // Find product in existing products list
    const product = products.find(p => String(p.barcode || '').trim() === cleanedCode)
    if (product) {
      addToCart(product, false)
      // Optional: Visual feedback or sound could go here
    } else {
      alert(`Product with barcode ${cleanedCode} not found in this shop.`)
    }
  }

  const updateQuantity = (id, isService, delta) => {
    setCart(cart.map(item => {
      if (item.id === id && item.isService === isService) {
        const product = products.find(p => p.id === id)
        const limit = isService ? 999 : (product?.quantity || 999)
        const newQty = Math.max(1, Math.min(limit, item.cartQuantity + delta))
        return { ...item, cartQuantity: newQty }
      }
      return item
    }))
  }

  const removeFromCart = (id, isService) => {
    setCart(cart.filter(item => !(item.id === id && item.isService === isService)))
  }

  const totalAmount = cart.reduce((sum, item) => sum + ((item.selling_price || item.price || 0) * item.cartQuantity), 0)

  // 5. Checkout Logic (PWA-tier)
  const handleCheckout = async () => {
    if (cart.length === 0 || isProcessing) return
    if (!canModifyCurrentShop) {
      alert(shopAccessMessage)
      return
    }

    setIsProcessing(true)
    
    try {
      const salePayload = {
        sale: { 
          shop_id:       currentShop.id, 
          customer_id:   selectedCustomerId, 
          total_amount:  totalAmount, 
          payment_method: paymentMethod,
          // ── Accountability fields ──────────────────────────
          session_id:    activeSession?.id    || null,
          employee_name: userProfile?.full_name || null,
          created_by:    userProfile?.id        || null
        },
        items: cart.map(item => ({
          product_id: item.isService ? null : item.id,
          service_id: item.isService ? item.id : null,
          quantity: item.cartQuantity,
          unit_price: item.selling_price || item.price,
          cost_price: item.isService ? 0 : (item.cost_price || 0),
          total_price: (item.selling_price || item.price) * item.cartQuantity
        }))
      }
      const receiptItems = cart.map((item) => ({
        name: item.name,
        quantity: item.cartQuantity,
        unit_price: item.selling_price || item.price,
        total_price: (item.selling_price || item.price) * item.cartQuantity
      }))
      const customerName = customers.find((customer) => customer.id === selectedCustomerId)?.name || 'Walk-in Customer'

      // Try live checkout first
      if (isOnline()) {
        console.log('Attempting online checkout')
        try {
          const { data: sale, error: saleErr } = await supabase.from('sales').insert([salePayload.sale]).select().single()
          if (saleErr) throw saleErr;
          
          const saleItems = salePayload.items.map(si => ({ ...si, sale_id: sale.id }));
          const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems);
          if (itemsErr) throw itemsErr;

          // Inventory update
          for (const item of cart) {
            if (!item.isService) {
              console.log('Decrementing inventory for product:', item.id, 'amount:', item.cartQuantity)
              const { data, error: rpcError } = await supabase.rpc('decrement_inventory', {
                row_id: item.id,
                amount: item.cartQuantity,
                action_type: 'SALE',
                notes: `Sale to ${customerName}`,
                user_id: userProfile?.id
              })

              if (rpcError) {
                console.error('Inventory decrement failed for item:', item.id, rpcError)
                throw new Error(`Inventory update failed for ${item.name}: ${rpcError.message}`)
              }
              
              console.log('Decrement inventory result:', data)
            }
          }
          
          // Log audit event for this sale (fire-and-forget)
          const itemSummary = cart.map(i => `${i.cartQuantity}x ${i.name}`).join(', ')
          logAuditEvent({
            actionType:  'SALE',
            description: `Sold: ${itemSummary} — Total: ${formatCurrency(totalAmount)}`,
            metadata: {
              sale_id:        sale.id,
              total_amount:   totalAmount,
              payment_method: paymentMethod,
              items_count:    cart.length,
              customer_name:  customerName,
            }
          })

          downloadReceiptPdf({
            sale,
            items: receiptItems,
            shop: currentShop,
            customerName,
            formatCurrency
          })

          setCart([])
          await loadData()
          refreshData(true)
          showSuccess('Sale Completed Successfully!')
          setIsProcessing(false)
          return
        } catch (err) {
          console.error('Live checkout failed, falling back to offline queue...', err)
        }
      }

      // Offline Fallback
      console.log('Falling back to offline checkout')
      await enqueueSale(salePayload)
      const count = await getQueueCount()
      setPendingSync(count)
      downloadReceiptPdf({
        sale: {
          ...salePayload.sale,
          id: `OFFLINE-${Date.now()}`,
          created_at: new Date().toISOString()
        },
        items: receiptItems,
        shop: currentShop,
        customerName,
        formatCurrency
      })
      showSuccess(`Sale saved locally! (${count} queued)`)
      setCart([])
      setIsProcessing(false)
      await loadData() // Refresh from local IndexedDB
    } catch (error) {
      console.error('Checkout failed:', error)
      alert('Failed to process sale: ' + (error.message || 'Unknown error'))
      setIsProcessing(false)
    }
  }

  // 6. UI Helpers
  const getItemInCartQty = (id, isService) => {
    return cart.find(c => c.id === id && c.isService === isService)?.cartQuantity || 0
  }

  return (
    <div className="pos-container">
      {/* Network Banners */}
      {!isNetworkOnline && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#dc3545', color: 'white', padding: '10px', zIndex: 2000, display: 'flex', gap: '10px', justifyContent: 'center', fontSize: '14px' }}>
          <WifiOff size={18} />
          <span>OFFLINE: Sales are saving to device. Don't clear browser cache. {pendingSync > 0 && <strong>({pendingSync} sales waiting for sync)</strong>}</span>
        </div>
      )}
      {syncMessage && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#2dce89', color: 'white', padding: '10px', zIndex: 2000, textAlign: 'center' }}>
          <Wifi size={18} style={{ marginRight: '8px' }} /> {syncMessage}
        </div>
      )}

      {/* Products Area */}
      <div className="pos-products-area" style={{ marginTop: (!isNetworkOnline || syncMessage) ? '45px' : '0' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h1 style={{ fontSize: '24px' }}>Point of Sale</h1>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: 'var(--surface-muted)', padding: '4px', borderRadius: '8px' }}>
                <button 
                  onClick={() => { setActiveTab('Products'); setSelectedCategory('All') }}
                  className={`btn ${activeTab === 'Products' ? 'btn-primary' : ''}`}
                  style={{ padding: '6px 16px', background: activeTab === 'Products' ? 'var(--primary)' : 'transparent', color: activeTab === 'Products' ? 'white' : 'var(--text-muted)', fontSize: '13px' }}
                >
                  Products
                </button>
                <button 
                  onClick={() => { setActiveTab('Services'); setSelectedCategory('All') }}
                  className={`btn ${activeTab === 'Services' ? 'btn-primary' : ''}`}
                  style={{ padding: '6px 16px', background: activeTab === 'Services' ? 'var(--primary)' : 'transparent', color: activeTab === 'Services' ? 'white' : 'var(--text-muted)', fontSize: '13px' }}
                >
                  Services
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
              <input 
                type="text" 
                placeholder="Search items or category..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '14px 14px 14px 44px', borderRadius: '12px', border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)' }}
              />
            </div>
            <button 
              className="btn btn-primary" 
              onClick={startScanner}
              style={{ padding: '0 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
            >
              <ScanLine size={20} />
              <span className="mobile-hide">Quick Scan</span>
            </button>
          </div>

          {/* Scanner Overlay for Sales */}
          {isScanning && (
            <BarcodeScanner
              open={isScanning}
              elementId="reader-sales"
              onDetected={handleBarcodeScan}
              onClose={stopScanner}
              closeOnDetect={false}
              variant="overlay"
              title="Fast Scan Active"
              description="Items add instantly to the cart. You can also type or paste a barcode."
            />
          )}

          {/* Category Tabs */}
          <div className="category-scroll-bar">
            {categories.map(cat => (
              <div 
                key={cat} 
                className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </div>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading items...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '16px' }}>
            {filteredItems.map(item => {
              const inCartQty = getItemInCartQty(item.id, item.isService)
              const isLowStock = !item.isService && item.quantity <= (item.min_quantity || 5)
              
              return (
                <div 
                  key={`${item.id}-${item.isService}`} 
                  className={`card pos-product-card ${isLowStock ? 'low-stock' : ''} ${inCartQty > 0 ? 'in-cart' : ''}`}
                  onClick={() => showQuantityDialog(item)}
                  style={{ padding: '12px', cursor: 'pointer', position: 'relative' }}
                >
                  {inCartQty > 0 && <div className="cart-qty-badge">{inCartQty}</div>}
                  
                  <div style={{ width: '100%', height: '100px', background: 'var(--surface-muted)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', overflow: 'hidden' }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      item.isService ? <Briefcase size={32} color="var(--primary)" opacity={0.5} /> : <Package size={32} color="var(--primary)" opacity={0.5} />
                    )}
                  </div>

                  <div style={{ minHeight: '40px', marginBottom: '8px' }}>
                    <p style={{ fontWeight: '600', fontSize: '13px', lineHeight: '1.2' }}>{item.name}</p>
                    {!item.isService && (
                      <p style={{ fontSize: '11px', color: isLowStock ? 'var(--danger)' : 'var(--text-muted)' }}>
                        In Stock: {item.quantity}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(item.selling_price || item.price)}</span>
                    <div style={{ background: 'var(--primary)', color: 'white', borderRadius: '6px', padding: '4px' }}>
                      <Plus size={16} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Cart Area */}
      <div className={`pos-cart-area ${!isCartExpanded ? 'collapsed' : ''}`}>
        <div className="cart-handle mobile-only" onClick={() => setIsCartExpanded(!isCartExpanded)}></div>
        
        <div className="cart-header-row" onClick={() => window.innerWidth < 1024 && setIsCartExpanded(!isCartExpanded)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={20} color="var(--primary)" />
            <span style={{ fontWeight: 'bold' }}>Review ({cart.length})</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL ({currencyPreference})</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--primary)' }}>{formatCurrency(totalAmount)}</div>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="cart-items-list">
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <ShoppingCart size={48} opacity={0.1} style={{ margin: '0 auto 16px' }} />
              <p style={{ fontSize: '14px' }}>No items added yet</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={`${item.id}-${item.isService}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '600', fontSize: '14px' }}>{item.name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatCurrency(item.selling_price || item.price)} each</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => updateQuantity(item.id, item.isService, -1)} className="btn" style={{ padding: '6px', border: '1px solid var(--border)', background: 'var(--surface-elevated)', borderRadius: '6px' }}><Minus size={12} /></button>
                  <span style={{ fontWeight: '700', width: '20px', textAlign: 'center', fontSize: '14px' }}>{item.cartQuantity}</span>
                  <button onClick={() => updateQuantity(item.id, item.isService, 1)} className="btn" style={{ padding: '6px', border: '1px solid var(--border)', background: 'var(--surface-elevated)', borderRadius: '6px' }}><Plus size={12} /></button>
                  <button onClick={() => removeFromCart(item.id, item.isService)} style={{ color: 'var(--danger)', marginLeft: '8px', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Customer & Payment */}
        <div className="cart-footer" style={{ borderTop: '2px solid var(--border)', paddingTop: '16px' }}>
          <div className="customer-section" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CUSTOMER</label>
            <div style={{ position: 'relative' }}>
               <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
               <select 
                 value={selectedCustomerId || ''} 
                 onChange={(e) => setSelectedCustomerId(e.target.value || null)}
                 style={{ width: '100%', padding: '12px 12px 12px 38px', borderRadius: '10px', fontSize: '14px', outline: 'none', appearance: 'none', background: 'var(--surface-muted)' }}
               >
                 <option value="">Guest (Standard Sale)</option>
                 {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
               </select>
            </div>
          </div>

          <div className="payment-section">
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', marginBottom: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>PAYMENT METHOD</label>
            <div className="payment-toggle-group">
              {[
                { id: 'Cash', label: 'CASH', icon: Wallet },
                { id: 'Mobile Money', label: 'MOBILE', icon: Smartphone },
                { id: 'Credit', label: 'CREDIT', icon: CreditCard },
              ].map(mode => (
                <div 
                  key={mode.id} 
                  className={`payment-toggle-btn ${paymentMethod === mode.id ? 'active' : ''}`}
                  onClick={() => setPaymentMethod(mode.id)}
                >
                  <mode.icon size={22} />
                  <span>{mode.label}</span>
                </div>
              ))}
            </div>
          </div>

          <button 
            className={`btn btn-primary ${isProcessing ? 'disabled' : ''}`} 
            style={{ width: '100%', padding: '16px', borderRadius: '14px', fontSize: '17px', height: '60px', border: 'none', transition: 'all 0.3s ease' }}
            disabled={cart.length === 0 || isProcessing || !canModifyCurrentShop}
            onClick={handleCheckout}
          >
            {isProcessing ? (
              <RefreshCw className="spin" size={20} />
            ) : (
              <CheckCircle size={22} />
            )}
            <span style={{ marginLeft: '12px', fontWeight: '700' }}>
              {isProcessing ? 'PROCESSING...' : 'FINISH SALE'}
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
        .disabled { opacity: 0.7; cursor: not-allowed; pointer-events: none; }
      `}</style>

      {/* Quantity Dialog */}
      {quantityDialog.show && quantityDialog.item && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', textAlign: 'center' }}>Add to Cart</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{ width: '60px', height: '60px', background: 'var(--surface-muted)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {quantityDialog.item.image_url ? (
                  <img src={quantityDialog.item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                ) : (
                  quantityDialog.item.isService ? <Briefcase size={24} color="var(--primary)" /> : <Package size={24} color="var(--primary)" />
                )}
              </div>
              <div>
                <p style={{ fontWeight: '600', marginBottom: '4px' }}>{quantityDialog.item.name}</p>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  {formatCurrency(quantityDialog.item.selling_price || quantityDialog.item.price)}
                  {!quantityDialog.item.isService && ` • In Stock: ${quantityDialog.item.quantity}`}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Quantity
              </label>
              <input
                type="number"
                min="1"
                placeholder="Enter amount"
                max={quantityDialog.maxQuantity}
                value={quantityDialog.quantity}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '') {
                    setQuantityDialog(prev => ({ ...prev, quantity: '' }))
                    return
                  }
                  const num = parseInt(val) || 0
                  setQuantityDialog(prev => ({ ...prev, quantity: Math.max(0, Math.min(quantityDialog.maxQuantity, num)) }))
                }}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', outline: 'none', fontSize: '16px', background: 'var(--surface-muted)' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn" 
                onClick={() => setQuantityDialog({ show: false, item: null, quantity: '' })}
                style={{ flex: 1, background: 'var(--surface-muted)', color: 'var(--text-main)' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={addToCartWithQuantity}
                disabled={!quantityDialog.quantity || parseInt(quantityDialog.quantity) < 1}
                style={{ flex: 1, opacity: (!quantityDialog.quantity || parseInt(quantityDialog.quantity) < 1) ? 0.5 : 1 }}
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sales
