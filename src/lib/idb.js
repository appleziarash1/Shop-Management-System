import { openDB } from 'idb';

const DB_NAME = 'sms-offline-db';
const DB_VERSION = 2; // Bumped for new inventory_queue

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Products cache
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      // Services cache
      if (!db.objectStoreNames.contains('services')) {
        db.createObjectStore('services', { keyPath: 'id' });
      }
      // Customers cache
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      // Offline Sales Queue
      if (!db.objectStoreNames.contains('sales_queue')) {
        db.createObjectStore('sales_queue', { keyPath: 'offline_id' });
      }
      // Offline Inventory Adjustments Queue
      if (!db.objectStoreNames.contains('inventory_queue')) {
        db.createObjectStore('inventory_queue', { keyPath: 'offline_id' });
      }
      // Settings/Profile cache
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
};

export const idbService = {
  async getAll(table) {
    const db = await initDB();
    return db.getAll(table);
  },
  async get(table, id) {
    const db = await initDB();
    return db.get(table, id);
  },
  async put(table, data) {
    const db = await initDB();
    return db.put(table, data);
  },
  async delete(table, id) {
    const db = await initDB();
    return db.delete(table, id);
  },
  async clear(table) {
    const db = await initDB();
    return db.clear(table);
  },
  async putBatch(table, items) {
    const db = await initDB();
    const tx = db.transaction(table, 'readwrite');
    await Promise.all([
      ...items.map(item => tx.store.put(item)),
      tx.done,
    ]);
  }
};
