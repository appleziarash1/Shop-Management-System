import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testOperations() {
  console.log(`Supabase URL: ${supabaseUrl ? 'Found' : 'MISSING'}`);
  console.log(`Supabase Anon Key: ${supabaseAnonKey ? 'Found' : 'MISSING'}`);
  console.log("--- Testing Database Operations ---");

  // 1. Try to fetch products (using head first to test consistency with check_tables.js)
  console.log("Testing HEAD on 'products'...");
  const { error: headError } = await supabase.from('products').select('*', { count: 'exact', head: true }).limit(1);
  if (headError) {
    console.error(`❌ HEAD error: ${headError.message}`);
  } else {
    console.log(`✅ HEAD success.`);
  }

  console.log("Testing SELECT on 'products'...");
  const { data: selectData, error: selectError } = await supabase.from('products').select('*').limit(1);
  if (selectError) {
    console.error(`❌ SELECT error: ${selectError.message}`);
  } else {
    console.log(`✅ SELECT success: ${selectData.length} records found.`);
  }

  // 2. Try to insert a dummy product (likely to fail if RLS is strict)
  console.log("Testing INSERT on 'products' (expect failure if RLS is active without policy)...");
  const dummyProduct = {
    name: "Test Product " + Date.now(),
    category: "Test",
    cost_price: 10,
    selling_price: 20,
    quantity: 1
  };
  const { error: insertError } = await supabase.from('products').insert([dummyProduct]);
  if (insertError) {
    console.log(`❌ INSERT error (Expected if policies are missing): ${insertError.message}`);
  } else {
    console.log(`✅ INSERT success! This means RLS is either disabled or permits inserts by anon.`);
  }
}

testOperations();
