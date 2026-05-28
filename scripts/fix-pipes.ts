import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
async function main() {
  const { rows } = await pool.query("UPDATE pending_renames SET proposed_name = REPLACE(proposed_name, ' | ', ' - ') WHERE proposed_name LIKE '%|%' RETURNING id, proposed_name")
  console.log('Updated', rows.length, 'rows')
  rows.forEach((r: {proposed_name: string}) => console.log(' ', r.proposed_name))

  // Also update sharepoint_map expected_name
  const { rows: sm } = await pool.query("UPDATE sharepoint_map SET expected_name = REPLACE(expected_name, ' | ', ' - ') WHERE expected_name LIKE '%|%' RETURNING display_name, expected_name")
  console.log('sharepoint_map updated:', sm.length, 'rows')

  await pool.end()
}
main().catch(console.error)
