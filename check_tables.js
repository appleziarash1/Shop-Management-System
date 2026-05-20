import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tables = [
  'profiles',
  'shops',
  'products',
  'customers',
  'suppliers',
  'sales',
  'sale_items',
  'purchases'
];

async function checkTables() {
  console.log(`Supabase URL: ${supabaseUrl ? 'Found' : 'MISSING'}`);
  console.log(`Supabase Anon Key: ${supabaseAnonKey ? 'Found' : 'MISSING'}`);
  console.log("Checking tables in Supabase...");
  for (const table of tables) {
    const { error, data } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(1);
    if (error) {
       console.log(`❌ Table '${table}' error:`, error);
    } else {
      console.log(`✅ Table '${table}' exists. Data:`, data);
    }
  }
}

checkTables();
