import { supabase } from './src/lib/supabaseClient.js';
async function test() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  let { data, error } = await supabase
    .from('sale_items')
    .select('id, total_price, created_at, services(name), profiles:staff_id(full_name), sales!inner(shop_id)')
    .not('service_id', 'is', null)
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString());
    
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
