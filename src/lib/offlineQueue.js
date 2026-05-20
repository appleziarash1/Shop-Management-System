import { v4 as uuidv4 } from 'uuid';
import { idbService } from './idb';
import { supabase } from './supabaseClient';

const OFFLINE_OVERRIDE_KEY = 'shopms_force_offline'

export const isOnline = () => {
  const manualOffline = localStorage.getItem(OFFLINE_OVERRIDE_KEY) === 'true';
  return navigator.onLine && !manualOffline;
};

export const setManualOffline = (isOffline) => {
  localStorage.setItem(OFFLINE_OVERRIDE_KEY, isOffline ? 'true' : 'false');
  window.dispatchEvent(new Event(isOffline ? 'offline' : 'online'));
};

/**
 * SALES QUEUE logic
 */
export const enqueueSale = async (salePayload) => {
  const offline_id = uuidv4();
  const queuedSale = {
    ...salePayload,
    offline_id,
    queued_at: new Date().toISOString(),
    sync_attempts: 0
  };
  
  await idbService.put('sales_queue', queuedSale);
  
  // Optimistic update of local product cache
  for (const item of salePayload.items) {
    if (item.product_id) {
      const product = await idbService.get('products', item.product_id);
      if (product) {
        product.quantity -= item.quantity;
        if (product.quantity <= 0) {
          // Delete product from local cache when quantity reaches 0
          await idbService.delete('products', item.product_id);
        } else {
          await idbService.put('products', product);
        }
      }
    }
  }
  
  return offline_id;
};

/**
 * PURCHASE QUEUE logic (Restocking deliveries)
 */
export const enqueuePurchase = async (purchasePayload) => {
  const offline_id = uuidv4();
  const queuedPurchase = {
    ...purchasePayload,
    offline_id,
    queued_at: new Date().toISOString(),
    sync_attempts: 0
  };
  
  await idbService.put('purchase_queue', queuedPurchase);
  
  // Optimistic update of local product cache
  for (const item of purchasePayload.items) {
    if (item.product_id) {
      const product = await idbService.get('products', item.product_id);
      if (product) {
        product.quantity += item.quantity;
        await idbService.put('products', product);
      }
    }
  }
  
  return offline_id;
};

/**
 * INVENTORY ACTIONS QUEUE logic (Product CRUD operations)
 */
export const enqueueInventoryAction = async (actionType, queueData) => {
  const offline_id = uuidv4();
  const queuedAction = {
    actionType,
    data: queueData,
    offline_id,
    queued_at: new Date().toISOString(),
    sync_attempts: 0
  };
  
  await idbService.put('inventory_queue', queuedAction);
  
  // Optimistic update of local product cache
  if (actionType === 'INSERT') {
    // Add to local cache with pending flag
    const newProduct = { ...queueData, _isPending: true };
    await idbService.put('products', newProduct);
  } else if (actionType === 'UPDATE') {
    // Update local cache
    const existingProduct = await idbService.get('products', queueData.id);
    if (existingProduct) {
      const updatedProduct = { ...existingProduct, ...queueData };
      await idbService.put('products', updatedProduct);
    }
  } else if (actionType === 'DELETE') {
    // Remove from local cache
    await idbService.delete('products', queueData.id);
  }
  
  return offline_id;
};

export const getQueueCount = async () => {
  const sales = await idbService.getAll('sales_queue');
  const inventory = await idbService.getAll('inventory_queue');
  const purchases = await idbService.getAll('purchase_queue');
  return sales.length + inventory.length + purchases.length;
};

/**
 * Background Sync Logic
 */
export const processSyncQueue = async (onProgress) => {
  if (!isOnline()) return { success: 0, failed: 0 };
  
  let successCount = 0;
  let failCount = 0;

  // 1. Process Inventory Actions First (Dependencies)
  const invQueue = await idbService.getAll('inventory_queue');
  for (const item of invQueue) {
    try {
      if (onProgress) onProgress(`Syncing inventory: ${item.data.name || item.actionType}...`);
      
      const { actionType, data } = item;
      let error;

      if (actionType === 'INSERT') {
        const { id: _tempId, _isPending, ...insertData } = data; // Remove temp IDs
        const res = await supabase.from('products').insert([insertData]).select().single();
        error = res.error;
        if (!error && res.data && res.data.quantity > 0) {
           const { data: authData } = await supabase.auth.getUser();
           await supabase.from('purchases').insert([{
              shop_id: insertData.shop_id,
              product_id: res.data.id,
              quantity: res.data.quantity,
              cost_price: res.data.cost_price,
              selling_price: res.data.selling_price,
              created_by: authData?.user?.id
           }]);
        }
      } else if (actionType === 'UPDATE') {
        const { id, _isPending, ...updateData } = data;
        const res = await supabase.from('products').update(updateData).eq('id', id);
        error = res.error;
      } else if (actionType === 'DELETE') {
        const res = await supabase.from('products').delete().eq('id', data.id);
        error = res.error;
      }

      if (error) throw error;
      await idbService.delete('inventory_queue', item.offline_id);
      successCount++;
    } catch (err) {
      console.error('Inventory sync failed:', item.offline_id, err);
      failCount++;
      item.sync_attempts = (item.sync_attempts || 0) + 1;
      await idbService.put('inventory_queue', item);
    }
  }

  // 2. Process Sales Queue
  const salesQueue = await idbService.getAll('sales_queue');
  for (const item of salesQueue) {
    try {
      if (onProgress) onProgress(`Syncing sale ${successCount + 1}...`);
      
      const { sale, items } = item;
      const { data: newSale, error: saleErr } = await supabase.from('sales').insert([sale]).select().single();
      if (saleErr) throw saleErr;
      
      const saleItems = items.map(si => ({ ...si, sale_id: newSale.id }));
      const { error: itemsErr } = await supabase.from('sale_items').insert(saleItems);
      if (itemsErr) throw itemsErr;
      
      // Update inventory for products
      for (const item of items) {
        if (item.product_id) {
          await supabase.rpc('decrement_inventory', { 
            row_id: item.product_id, 
            amount: item.quantity,
            action_type: 'SALE',
            notes: 'Offline sale sync',
            user_id: item.created_by || null
          })
        }
      }
      
      await idbService.delete('sales_queue', item.offline_id);
      successCount++;
    } catch (err) {
      console.error('Sale sync failed:', item.offline_id, err);
      failCount++;
      item.sync_attempts = (item.sync_attempts || 0) + 1;
      await idbService.put('sales_queue', item);
    }
  }

  // 3. Process Purchase Queue
  const purchaseQueue = await idbService.getAll('purchase_queue');
  for (const item of purchaseQueue) {
    try {
      if (onProgress) onProgress(`Syncing purchase ${successCount + 1}...`);
      
      const { purchase, items } = item;
      const { data: newPurchase, error: purchaseErr } = await supabase.from('purchases').insert([purchase]).select().single();
      if (purchaseErr) throw purchaseErr;
      
      // Update inventory for products (increment quantities)
      for (const purchaseItem of items) {
        if (purchaseItem.product_id) {
          // For purchases, we increment inventory instead of decrementing
          const { data: product } = await supabase.from('products').select('quantity').eq('id', purchaseItem.product_id).single();
          if (product) {
            const newQuantity = (product.quantity || 0) + purchaseItem.quantity;
            await supabase.from('products').update({ quantity: newQuantity }).eq('id', purchaseItem.product_id);
          }
        }
      }
      
      await idbService.delete('purchase_queue', item.offline_id);
      successCount++;
    } catch (err) {
      console.error('Purchase sync failed:', item.offline_id, err);
      failCount++;
      item.sync_attempts = (item.sync_attempts || 0) + 1;
      await idbService.put('purchase_queue', item);
    }
  }
  
  return { success: successCount, failed: failCount };
};
