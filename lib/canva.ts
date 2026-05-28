// canva.ts — Canva Connect API client
// Used by organic content and paid media agents for design creation.
// Uses Canva MCP connector in conversation context; REST API for skill runtime.
// TODO: implement OAuth flow and REST client

export async function createDesign(templateId: string, fields: Record<string, unknown>) {
  throw new Error('canva.ts not yet implemented — stub only')
}

export async function exportDesign(designId: string, format: 'png' | 'jpg' | 'pdf' = 'png') {
  throw new Error('canva.ts not yet implemented — stub only')
}
