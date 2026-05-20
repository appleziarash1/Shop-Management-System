import { supabase } from './supabaseClient'

export const buildLowStockWhatsappMessage = ({ shopName, productName, quantity, minQuantity }) => (
  `Low stock alert for ${shopName}: ${productName} is at ${quantity} item(s), below the minimum level of ${minQuantity}. Please restock this product.`
)

export const syncLowStockAlerts = async ({ ownerId, ownerPhone, shops = [] }) => {
  if (!ownerId || !ownerPhone || !shops.length) {
    return { created: 0, resolved: 0 }
  }

  try {
    const shopIds = shops.map((shop) => shop.id)
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id, shop_id, name, quantity, min_quantity, shops(name)')
      .in('shop_id', shopIds)

    if (productError) throw productError

    const { data: openAlerts, error: alertError } = await supabase
      .from('low_stock_alerts')
      .select('id, product_id, shop_id, resolved_at')
      .eq('owner_id', ownerId)
      .is('resolved_at', null)

    if (alertError) throw alertError

    const lowStockProducts = (products || []).filter((product) => Number(product.quantity || 0) <= Number(product.min_quantity || 0))
    const openAlertMap = new Map((openAlerts || []).map((alert) => [`${alert.shop_id}:${alert.product_id}`, alert]))

    let created = 0
    let resolved = 0

    for (const product of lowStockProducts) {
      const key = `${product.shop_id}:${product.id}`
      if (openAlertMap.has(key)) continue

      const message = buildLowStockWhatsappMessage({
        shopName: product.shops?.name || 'shop',
        productName: product.name,
        quantity: Number(product.quantity || 0),
        minQuantity: Number(product.min_quantity || 0)
      })

      const { error } = await supabase.from('low_stock_alerts').insert([{
        shop_id: product.shop_id,
        product_id: product.id,
        owner_id: ownerId,
        owner_phone: ownerPhone,
        product_name: product.name,
        shop_name: product.shops?.name || '',
        quantity: Number(product.quantity || 0),
        min_quantity: Number(product.min_quantity || 0),
        channel: 'whatsapp',
        status: 'pending',
        message
      }])

      if (!error) {
        created += 1
      }
    }

    const lowStockKeys = new Set(lowStockProducts.map((product) => `${product.shop_id}:${product.id}`))
    for (const alert of openAlerts || []) {
      const key = `${alert.shop_id}:${alert.product_id}`
      if (lowStockKeys.has(key)) continue

      const { error } = await supabase
        .from('low_stock_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alert.id)

      if (!error) {
        resolved += 1
      }
    }

    return { created, resolved }
  } catch (error) {
    console.warn('Low stock alert sync skipped:', error?.message || error)
    return { created: 0, resolved: 0 }
  }
}
