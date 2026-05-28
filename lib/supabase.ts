import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side only — uses service role key (full access, bypasses RLS)
export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
})

// Lightweight connection test
export async function testConnection() {
  const { data, error } = await supabase
    .from('skill_runs')
    .select('id')
    .limit(1)
  if (error) throw new Error(`Supabase: ${error.message}`)
  return { ok: true, table: 'skill_runs', rows: data?.length ?? 0 }
}
