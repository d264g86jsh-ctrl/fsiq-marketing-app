import { createClient } from '@supabase/supabase-js'

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await sb
    .from('creative_pipeline')
    .select('ad_id, concept_name, hook_type, awareness_level, lp_code, duration, cp2ql_lifetime, status')
    .not('cp2ql_lifetime', 'is', null)
    .order('cp2ql_lifetime', { ascending: true })
  if (error) { console.error('ERR:', error); process.exit(1) }
  console.log(JSON.stringify(data, null, 2))
  process.stderr.write('COUNT: ' + (data?.length ?? 0) + '\n')
}
main().catch(e => { console.error(e); process.exit(1) })
