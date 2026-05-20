const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

async function checkRest() {
  console.log("Checking Supabase REST root...");
  const url = `${supabaseUrl}/rest/v1/`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  const body = await response.json();
  console.log("Visible tables/entities:", Object.keys(body.definitions || {}));
}

checkRest();
