// Test barcode lookup functionality
const testBarcodes = {
  '5060335122959': 'Coca-Cola 330ml (UK)',  
  '8720100703089': 'Heineken Beer',
  '4006381333912': 'Milka Chocolate',
  '3017620425035': 'Nutella Hazelnut'
};

async function testBarcodeLookup(barcode, description) {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'ShopMS - Shop Management System - Web - Version 0.1'
        }
      }
    );

    if (!response.ok) {
      console.log(`❌ [${description}] Failed: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();

    if (data.status === 1) {
      const product = data.product;
      console.log(`✅ [${description}] Found:`);
      console.log(`   Name: ${product.product_name || 'N/A'}`);
      console.log(`   Brand: ${product.brands || 'N/A'}`);
      console.log(`   Category: ${product.categories || 'N/A'}`);
      console.log(`   Unit Size: ${product.quantity || 'N/A'}`);
      console.log(`   Image: ${product.image_front_url ? 'Yes' : 'No'}`);
    } else {
      console.log(`⚠️  [${description}] Not found in database (status: ${data.status})`);
    }
  } catch (error) {
    console.log(`❌ [${description}] Error:`, error.message);
  }
}

async function runTests() {
  console.log('Testing Open Food Facts API for Barcode Lookup\n');
  console.log('Testing barcodes...\n');

  for (const [barcode, description] of Object.entries(testBarcodes)) {
    await testBarcodeLookup(barcode, description);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
  }

  console.log('\n✅ Test complete');
}

runTests();
