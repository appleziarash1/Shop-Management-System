const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function checkApi() {
  console.log("Checking Supabase API directly...");
  const url = `${supabaseUrl}/rest/v1/products?select=*&limit=1`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  const body = await response.text();
  console.log(`Body: ${body}`);

  const headResponse = await fetch(url, {
    method: 'HEAD',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });
  console.log(`HEAD Status: ${headResponse.status} ${headResponse.statusText}`);
}

checkApi();
