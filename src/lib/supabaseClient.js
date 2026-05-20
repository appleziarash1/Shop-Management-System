import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fzxzfsneymtupebzblap.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6eHpmc25leW10dXBlYnpibGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwODY2MjQsImV4cCI6MjA4OTY2MjYyNH0.NxENuIwC6GQngu1g6ux5-BR9-_5nYh8fdRseFbiHcQo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
