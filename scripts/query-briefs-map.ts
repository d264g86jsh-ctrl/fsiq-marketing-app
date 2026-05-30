import { createClient } from '@supabase/supabase-js'

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: briefs, error } = await sb
    .from('sharepoint_map')
    .select('id, path, sharepoint_item_id, display_name')
    .like('path', '%Campaign Brief%')
    .eq('item_type', 'file')
    .order('path')
  if (error) { console.error('ERR:', error); process.exit(1) }
  console.log(JSON.stringify(briefs, null, 2))
  process.stderr.write('COUNT: ' + (briefs?.length ?? 0) + '\n')
}
main().catch(e => { console.error(e); process.exit(1) })
