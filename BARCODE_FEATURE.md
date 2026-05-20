/**
 * BARCODE INVENTORY LOOKUP FEATURE
 * 
 * This feature enables quick stock additions to existing products via barcode scan.
 * 
 * WORKFLOW:
 * 1. User opens "Add Product" modal
 * 2. User scans/enters a barcode
 * 3. System checks inventory for matching barcode (priority 1)
 * 4. If found locally:
 *    - Form populates with existing product data
 *    - Modal title changes to "Add Stock to Product"
 *    - Quantity field becomes "Quantity to Add"
 *    - User enters quantity to add
 *    - Saves to products table AND creates purchase record for tracking
 * 5. If not found locally, tries Open Food Facts API
 * 
 * BENEFITS:
 * ✓ Quick stock replenishment without re-entering product details
 * ✓ Automatic purchase tracking for inventory audits
 * ✓ Visual feedback when product is found in inventory
 * ✓ Reduced data entry errors
 * 
 * TECHNICAL DETAILS:
 * - Function: handleBarcodeLookup() in Products.jsx
 * - Checks: products array for barcode match (case-insensitive)
 * - Updates: products table + purchases table
 * - Offline support: Enqueues action if offline
 * 
 * EDGE CASES HANDLED:
 * - Product not in inventory → Falls back to Open Food Facts API
 * - API not available → User can manually enter product details
 * - Duplicate barcodes → First match used
 * - Offline mode → Actions queued and synced later
 */

console.log('✅ Barcode Inventory Lookup Feature Implemented');
