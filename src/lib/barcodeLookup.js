/**
 * Barcode Lookup Service
 * Uses Open Food Facts API for food products.
 * Returns normalized product data.
 */

const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v0/product/';

export const lookupBarcode = async (barcode) => {
  if (!barcode) return null;

  try {
    const response = await fetch(`${OPEN_FOOD_FACTS_URL}${barcode}.json`, {
      headers: {
        'User-Agent': 'ShopMS - Shop Management System - Web - Version 0.1'
      }
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const data = await response.json();

    if (data.status === 1) {
      const product = data.product;
      
      // Attempt to find brand in several places
      const brand = product.brands || product.brand_owner || '';
      
      // Clean categories (comes as a string with many tiers)
      const rawCategories = product.categories || 'Groceries';
      const mainCategory = rawCategories.split(',')[0].trim();

      // Unit size (e.g., 500g, 1L)
      const unitSize = product.quantity || product.serving_size || '';

      return {
        name: product.product_name || product.generic_name || 'Unknown Product',
        brand,
        category: mainCategory,
        unit_size: unitSize,
        image_url: product.image_url || product.image_front_url || '',
        barcode: barcode
      };
    } else {
      console.warn('Product not found in Open Food Facts database.');
      return null;
    }
  } catch (error) {
    console.error('Barcode lookup error:', error);
    return null;
  }
};
