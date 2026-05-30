// Fetches .docx file IDs from all Campaign Brief folders in sharepoint_map
import { createClient } from '@supabase/supabase-js'
import { listChildren, getGraphToken } from '../lib/graph'

const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: folders } = await sb
    .from('sharepoint_map')
    .select('path, sharepoint_item_id, display_name')
    .ilike('path', '%/Campaign Brief')
    .eq('item_type', 'folder')
    .not('sharepoint_item_id', 'is', null)
    .order('path')

  if (!folders || folders.length === 0) {
    console.error('No Campaign Brief folders found')
    process.exit(1)
  }

  console.error(`Found ${folders.length} Campaign Brief folders`)

  const results: Array<{ folder_path: string; file_id: string; file_name: string }> = []

  for (const folder of folders) {
    const children = await listChildren(folder.sharepoint_item_id)
    const docxFiles = children.filter(c => c.name.toLowerCase().endsWith('.docx'))

    for (const f of docxFiles) {
      results.push({
        folder_path: folder.path,
        file_id: f.id,
        file_name: f.name,
      })
    }

    if (docxFiles.length === 0) {
      console.error(`  ⚠ No .docx found in: ${folder.path}`)
    }
  }

  console.log(JSON.stringify(results, null, 2))
  console.error(`Total files: ${results.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
