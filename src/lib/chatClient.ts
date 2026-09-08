/**
 * Shared client for the chatjimmy.ai API.
 *
 * Endpoint contract (verified against the live service):
 *
 *   GET /api/models
 *     -> { "object": "list", "data": [{ "id": "llama3.1-8B", ... }] }
 *
 *   POST /api/chat
 *     body: {
 *       "chatOptions": { "selectedModel": "llama3.1-8B", "systemPrompt"?: string, "topK"?: number },
 *       "messages": [{ "role": "user" | "assistant" | "system", "content": string }],
 *       "stream"?: boolean
 *     }
 *     response: content-type "text/event-stream" but NOT SSE-framed — the body is
 *     raw text chunks concatenated in order, terminated by a stats sentinel:
 *       ...text...<|stats|>{...json stats...}<|/stats|>
 *     Errors come back as JSON: { "success": false, "error": "..." } with a 4xx code.
 *
 * The API sends no CORS headers, so browsers must reach it same-origin.
 * The Vite dev/preview server proxies /api -> https://chatjimmy.ai.
 * Set VITE_CHAT_API_BASE to call a different base explicitly.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const DEFAULT_MODEL = 'llama3.1-8B'

const API_BASE: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_CHAT_API_BASE ?? ''

const STATS_SENTINEL = '<|stats|>'

/** Remove the trailing <|stats|>...<|/stats|> sentinel from accumulated text. */
export function stripStats(text: string): string {
  const i = text.indexOf(STATS_SENTINEL)
  return i === -1 ? text : text.slice(0, i)
}

async function parseError(res: Response): Promise<never> {
  let detail = `HTTP ${res.status}`
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') detail = body.error
  } catch {
    /* non-JSON error body — keep the HTTP status */
  }
  throw new Error(detail)
}

/** Fetch the list of available model ids. */
export async function listModels(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/models`, { method: 'GET', signal })
  if (!res.ok) return parseError(res)
  const data = (await res.json()) as { data?: Array<{ id?: string }> }
  return (data.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
}

export interface StreamChatOptions {
  messages: ChatMessage[]
  model?: string
  /** Called after each chunk with the full text accumulated so far (sentinel stripped). */
  onDelta?: (fullText: string) => void
  signal?: AbortSignal
}

/**
 * Send a chat completion request and stream the reply.
 * Resolves with the complete reply text (stats sentinel stripped).
 */
export async function streamChat({
  messages,
  model = DEFAULT_MODEL,
  onDelta,
  signal,
}: StreamChatOptions): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatOptions: { selectedModel: model },
      messages,
      stream: true,
    }),
    signal,
  })
  if (!res.ok) return parseError(res)

  if (!res.body) {
    const text = stripStats(await res.text())
    onDelta?.(text)
    return text
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
    onDelta?.(stripStats(raw))
  }
  raw += decoder.decode()
  const full = stripStats(raw)
  onDelta?.(full)
  return full
}
