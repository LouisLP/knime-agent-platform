import type {
  ApiErrorBody,
  Conversation,
  ConversationId,
  ErrorCode,
  SendMessageResult,
} from '@/types/conversation'

/**
 * The only place that knows the backend exists. Every response is typed as the
 * shared contract (`@/types/conversation`), and every failure — network down,
 * non-2xx, malformed body — surfaces as one `ApiError` so callers have a single
 * thing to catch.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/**
 * A transport-level failure: the turn never made it into the transcript. Errors
 * the backend *did* record come back as `error` conversation items instead.
 */
export class ApiError extends Error {
  /** Absent when the request never reached the server. */
  readonly status?: number
  readonly code?: ErrorCode

  constructor(message: string, options: { status?: number, code?: ErrorCode, cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
  }
}

export interface ChatClient {
  createConversation: () => Promise<Conversation>
  getConversation: (id: ConversationId) => Promise<Conversation>
  sendMessage: (id: ConversationId, content: string) => Promise<SendMessageResult>
}

export const chatClient: ChatClient = {
  createConversation: () => request<Conversation>('POST', '/api/conversations'),
  getConversation: id => request<Conversation>('GET', `/api/conversations/${id}`),
  sendMessage: (id, content) =>
    request<SendMessageResult>('POST', `/api/conversations/${id}/messages`, { content }),
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }
  catch (cause) {
    // fetch only rejects when the request never completed — the backend is not
    // running, CORS refused it, or the connection dropped.
    throw new ApiError('Could not reach the server. Is the backend running?', { cause })
  }

  if (!response.ok)
    throw await toApiError(response)

  try {
    return await response.json() as T
  }
  catch (cause) {
    throw new ApiError('The server sent a response we could not read.', {
      status: response.status,
      cause,
    })
  }
}

/** Prefers the backend's `{ error: { code, message } }` body, falls back to the status. */
async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null) as ApiErrorBody | null
  const error = body?.error

  return new ApiError(
    error?.message ?? `Request failed with status ${response.status}.`,
    { status: response.status, code: error?.code },
  )
}
