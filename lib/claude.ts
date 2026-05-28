// claude.ts — Shared Anthropic client and prompt utilities
// All skills should use this client rather than instantiating their own.

import Anthropic from '@anthropic-ai/sdk'

export const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

export async function askClaude(prompt: string, maxTokens = 4096): Promise<string> {
  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}

export async function askClaudeJson<T>(prompt: string, maxTokens = 4096): Promise<T> {
  const text = await askClaude(prompt, maxTokens)
  try {
    return JSON.parse(text) as T
  } catch {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as T
  }
}
