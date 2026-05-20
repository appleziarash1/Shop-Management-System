import { supabase } from './supabaseClient';
import { idbService } from './idb';
import { isOnline } from './offlineQueue';

export const syncManager = {
  /**
   * Syncs all core data from Supabase to IndexedDB
   */
  async syncAllData(shopId) {
    if (!isOnline()) return;

    try {
      console.log('Syncing all data for shop:', shopId);
      
      const [productsRes, servicesRes, customersRes] = await Promise.all([
        supabase.from('products').select('*').eq('shop_id', shopId).gt('quantity', 0),
        supabase.from('services').select('*').eq('shop_id', shopId).eq('is_active', true),
        supabase.from('customers').select('*').eq('shop_id', shopId)
      ]);

      if (productsRes.data) await idbService.putBatch('products', productsRes.data);
      if (servicesRes.data) await idbService.putBatch('services', servicesRes.data);
      if (customersRes.data) await idbService.putBatch('customers', customersRes.data);

      console.log('Successfully synced all data to IndexedDB');
    } catch (err) {
      console.error('Error during full sync:', err);
    }
  },

  /**
   * Get products with offline fallback
   */
  async getProducts(shopId) {
    if (isOnline()) {
      const { data, error } = await supabase.from('products').select('*').eq('shop_id', shopId).gt('quantity', 0);
      if (!error && data) {
        await idbService.putBatch('products', data);
        return data;
      }
    }
    // Fallback to IndexedDB - filter out products with quantity <= 0
    const allProducts = await idbService.getAll('products');
    return allProducts.filter(p => p.quantity > 0);
  },

  /**
   * Get services with offline fallback
   */
  async getServices(shopId) {
    if (isOnline()) {
      const { data, error } = await supabase.from('services').select('*').eq('shop_id', shopId).eq('is_active', true);
      if (!error && data) {
        await idbService.putBatch('services', data);
        return data;
      }
    }
    // Fallback to IndexedDB
    return idbService.getAll('services');
  },

  /**
   * Get customers with offline fallback
   */
  async getCustomers(shopId) {
    if (isOnline()) {
      const { data, error } = await supabase.from('customers').select('*').eq('shop_id', shopId);
      if (!error && data) {
        await idbService.putBatch('customers', data);
        return data;
      }
    }
    // Fallback to IndexedDB
    return idbService.getAll('customers');
  }
};
