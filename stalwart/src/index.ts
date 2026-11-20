/**
 * cloud-stalwart — optional JMAP edge front door for a private Stalwart server.
 *
 * Stalwart stays on the LAN and is published by a Cloudflare Tunnel at
 * jadmin.<DOMAIN>. That is the primary path and needs no Worker at all.
 * This Worker is an OPTIONAL, generic transparent proxy for deployments that
 * want an extra edge hop. It is not part of the default setup.
 *
 * The proxy is intentionally transparent. It forwards method, path, query,
 * body and client credentials unchanged. It does NOT rewrite JMAP discovery
 * documents, inject an upstream token, or alter STALWART_PUBLIC_URL. Stalwart
 * must be configured with the exact public URL users type (normally
 * https://jadmin.<DOMAIN>), so discovery stays canonical on every path.
 */

export interface Env {
  /** Tunnel hostname that reaches Stalwart, e.g. jadmin.example.com. */
  UPSTREAM_URL: string
  /** Optional Cloudflare Access service token for the Worker -> tunnel hop. */
  ACCESS_CLIENT_ID?: string
  ACCESS_CLIENT_SECRET?: string
  /** Optional path prefix stripped before forwarding. */
  PATH_PREFIX?: string
  /** Optional value for Access-Control-Allow-Origin. */
  CORS_ORIGIN?: string
}

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** Headers a client must not be able to spoof on the upstream hop. */
function isReservedRequestHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('cf-') || lower.startsWith('x-forwarded-')
}

function connectionTokens(headers: Headers): Set<string> {
  return new Set(
    (headers.get('connection') ?? '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isWebSocketUpgrade(request: Request): boolean {
  return (
    request.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
    connectionTokens(request.headers).has('upgrade')
  )
}

function clientIp(request: Request): string | undefined {
  return request.headers.get('cf-connecting-ip') ?? undefined
}

/** Accept a bare hostname (https:// on 443) or a full URL. */
export function normalizeUpstream(value: string): URL {
  const trimmed = value.trim()
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return new URL(candidate)
}

/** Combine the configured upstream base with the incoming path and query. */
export function buildUpstreamUrl(request: Request, env: Env): URL {
  const upstream = normalizeUpstream(env.UPSTREAM_URL)
  const incoming = new URL(request.url)

  let pathname = incoming.pathname
  const prefix = (env.PATH_PREFIX ?? '').replace(/\/+$/, '')
  if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    pathname = pathname.slice(prefix.length) || '/'
  }

  const base = upstream.pathname.replace(/\/+$/, '')
  upstream.pathname = `${base}${pathname}`
  upstream.search = incoming.search
  upstream.hash = ''
  return upstream
}

/** Build upstream-bound headers, dropping hop-by-hop and spoofable headers. */
export function makeForwardHeaders(request: Request, target: URL, env: Env): Headers {
  const headers = new Headers()
  const hopTokens = connectionTokens(request.headers)

  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (hopTokens.has(lower)) continue
    if (lower === 'host') continue
    if (isReservedRequestHeader(lower)) continue
    // Client Authorization is deliberately passed through: user JMAP bearer
    // tokens and basic credentials belong to Stalwart, not to this Worker.
    headers.set(name, value)
  }

  headers.set('host', target.host)
  headers.set('x-forwarded-host', request.headers.get('host') ?? new URL(request.url).host)
  headers.set('x-forwarded-proto', new URL(request.url).protocol.replace(':', ''))
  headers.set('x-forwarded-port', target.port || (target.protocol === 'https:' ? '443' : '80'))

  const ip = clientIp(request)
  if (ip) headers.set('x-forwarded-for', ip)

  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    headers.set('cf-access-client-id', env.ACCESS_CLIENT_ID)
    headers.set('cf-access-client-secret', env.ACCESS_CLIENT_SECRET)
  }

  return headers
}

/** Read all Set-Cookie values across Workers, Node and browsers. */
function getSetCookies(headers: Headers): string[] {
  const extended = headers as Headers & {
    getSetCookie?: () => string[]
    getAll?: (name: string) => string[]
  }
  if (typeof extended.getSetCookie === 'function') return extended.getSetCookie()
  if (typeof extended.getAll === 'function') return extended.getAll('set-cookie')
  const single = headers.get('set-cookie')
  return single ? [single] : []
}

/** Build client-bound response headers without changing upstream URLs. */
export function makeResponseHeaders(upstream: Response): Headers {
  const headers = new Headers()
  const hopTokens = connectionTokens(upstream.headers)
  const setCookies = getSetCookies(upstream.headers)

  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (hopTokens.has(lower)) continue
    // Append Set-Cookie values individually so multiple cookies survive.
    if (lower === 'set-cookie' && setCookies.length > 0) continue
    headers.set(name, value)
  }

  for (const cookie of setCookies) headers.append('set-cookie', cookie)

  return headers
}

function withCors(response: Response, env: Env): Response {
  if (!env.CORS_ORIGIN) return response
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', env.CORS_ORIGIN)
  headers.set('access-control-allow-headers', 'authorization, content-type')
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set('vary', 'origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const incoming = new URL(request.url)

  if (env.CORS_ORIGIN && request.method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), env)
  }

  if (incoming.pathname === '/health' || incoming.pathname === '/healthz') {
    return withCors(new Response('ok', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }), env)
  }

  if (!env.UPSTREAM_URL) {
    return withCors(errorResponse('UPSTREAM_URL is not configured', 500), env)
  }

  const target = buildUpstreamUrl(request, env)
  const forwardHeaders = makeForwardHeaders(request, target, env)

  try {
    if (isWebSocketUpgrade(request)) {
      const upstream = await fetch(target, {
        method: request.method,
        headers: forwardHeaders,
        body: request.body,
      })
      if (upstream.webSocket) return upstream
      return withCors(errorResponse('Upstream did not accept the WebSocket upgrade', 502), env)
    }

    const upstream = await fetch(target, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: 'manual',
    })

    return withCors(new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: makeResponseHeaders(upstream),
    }), env)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return withCors(errorResponse(`Upstream request failed: ${detail}`, 502), env)
  }
}

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env)
  },
} satisfies ExportedHandler<Env>
