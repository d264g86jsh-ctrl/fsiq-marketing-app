// SharePoint map — typed helpers over the sharepoint_map table.
// Agents use these instead of calling the Graph API directly.

import { supabase } from './supabase'

export type SharePointItem = {
  id: number
  path: string
  item_type: 'folder' | 'file'
  parent_path: string
  sharepoint_item_id: string | null
  display_name: string
  expected_name: string | null
  naming_valid: boolean
  agent_owner: string
  last_verified_at: string
  created_at: string
}

// Returns the row for an exact path, or null if not found.
export async function getItemByPath(path: string): Promise<SharePointItem | null> {
  const { data } = await supabase
    .from('sharepoint_map')
    .select('*')
    .eq('path', path)
    .single()
  return data as SharePointItem | null
}

// Returns all direct children of a given path (one level deep only).
export async function getChildrenOf(parentPath: string): Promise<SharePointItem[]> {
  const { data } = await supabase
    .from('sharepoint_map')
    .select('*')
    .eq('parent_path', parentPath)
    .order('path')
  return (data ?? []) as SharePointItem[]
}

// Returns all folders tagged to a specific agent_owner.
export async function getFoldersByAgent(agentOwner: string): Promise<SharePointItem[]> {
  const { data } = await supabase
    .from('sharepoint_map')
    .select('*')
    .eq('agent_owner', agentOwner)
    .eq('item_type', 'folder')
    .order('path')
  return (data ?? []) as SharePointItem[]
}

// Upserts a single item by path. Pass partial fields — path is required.
export async function upsertItem(
  item: Omit<SharePointItem, 'id' | 'created_at'> & { path: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('sharepoint_map')
    .upsert({ ...item, last_verified_at: new Date().toISOString() }, { onConflict: 'path' })
  return { error: error?.message ?? null }
}

// Returns all items that fail naming validation.
export async function getNamingViolations(): Promise<SharePointItem[]> {
  const { data } = await supabase
    .from('sharepoint_map')
    .select('*')
    .eq('naming_valid', false)
    .order('path')
  return (data ?? []) as SharePointItem[]
}
