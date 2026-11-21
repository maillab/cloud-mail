import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, {
  buildUpstreamUrl,
  isWebSocketUpgrade,
  makeForwardHeaders,
  makeResponseHeaders,
  normalizeUpstream,
  type Env,
} from '../src/index'

const env: Env = {
  UPSTREAM_URL: 'jadmin.example.com',
}

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://front.example.com${path}`, { headers })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeUpstream', () => {
  it('treats a bare hostname as an HTTPS origin', () => {
    expect(normalizeUpstream('jadmin.example.com').toString())
      .toBe('https://jadmin.example.com/')
  })

  it('keeps a full URL as-is', () => {
    expect(normalizeUpstream('http://127.0.0.1:8080/base').toString())
      .toBe('http://127.0.0.1:8080/base')
  })
})

describe('buildUpstreamUrl', () => {
  it('joins the incoming path and query onto the upstream origin', () => {
    const url = buildUpstreamUrl(request('/.well-known/jmap?foo=bar'), env)
    expect(url.toString()).toBe('https://jadmin.example.com/.well-known/jmap?foo=bar')
  })

  it('strips a configured path prefix', () => {
    const url = buildUpstreamUrl(request('/mail/jmap'), { ...env, PATH_PREFIX: '/mail' })
    expect(url.pathname).toBe('/jmap')
  })

  it('keeps a base path configured on the upstream URL', () => {
    const url = buildUpstreamUrl(request('/jmap'), {
      ...env,
      UPSTREAM_URL: 'https://jadmin.example.com/stalwart',
    })
    expect(url.pathname).toBe('/stalwart/jmap')
  })
})

describe('makeForwardHeaders', () => {
  it('sets the tunnel host and forwarded metadata from Cloudflare headers', () => {
    const req = request('/jmap', {
      host: 'front.example.com',
      'cf-connecting-ip': '203.0.113.10',
    })
    const headers = makeForwardHeaders(req, buildUpstreamUrl(req, env), env)

    expect(headers.get('host')).toBe('jadmin.example.com')
    expect(headers.get('x-forwarded-host')).toBe('front.example.com')
    expect(headers.get('x-forwarded-proto')).toBe('https')
    expect(headers.get('x-forwarded-port')).toBe('443')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.10')
  })

  it('drops client-supplied forwarded and Cloudflare headers', () => {
    const req = request('/jmap', {
      'x-forwarded-for': '198.51.100.99',
      'x-forwarded-host': 'evil.example.com',
      'cf-access-client-id': 'spoofed',
    })
    const headers = makeForwardHeaders(req, buildUpstreamUrl(req, env), env)

    expect(headers.get('x-forwarded-for')).toBeNull()
    expect(headers.get('x-forwarded-host')).toBe('front.example.com')
    expect(headers.get('cf-access-client-id')).toBeNull()
  })

  it('passes client Authorization through without injecting an upstream token', () => {
    const req = request('/jmap', { authorization: 'Bearer API_client' })
    const headers = makeForwardHeaders(req, buildUpstreamUrl(req, env), env)

    expect(headers.get('authorization')).toBe('Bearer API_client')
  })

  it('does not invent an Authorization header when the client has none', () => {
    const req = request('/jmap')
    const headers = makeForwardHeaders(req, buildUpstreamUrl(req, env), env)

    expect(headers.has('authorization')).toBe(false)
  })

  it('never attaches an Access service token, even when secrets are present', () => {
    const req = request('/jmap')
    const headers = makeForwardHeaders(req, buildUpstreamUrl(req, env), {
      ...env,
      ACCESS_CLIENT_ID: 'id.access',
      ACCESS_CLIENT_SECRET: 'secret',
    } as unknown as Env)

    expect(headers.has('cf-access-client-id')).toBe(false)
    expect(headers.has('cf-access-client-secret')).toBe(false)
  })
})

describe('isWebSocketUpgrade', () => {
  it('detects a WebSocket upgrade request', () => {
    const req = request('/jmap/ws', {
      upgrade: 'websocket',
      connection: 'keep-alive, Upgrade',
    })
    expect(isWebSocketUpgrade(req)).toBe(true)
  })

  it('returns false for a normal request', () => {
    expect(isWebSocketUpgrade(request('/jmap'))).toBe(false)
  })
})

describe('makeResponseHeaders', () => {
  it('removes hop-by-hop headers and keeps useful ones', () => {
    const upstream = new Response(null, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        connection: 'keep-alive',
        'x-powered-by': 'stalwart',
      },
    })
    const headers = makeResponseHeaders(upstream)

    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('connection')).toBeNull()
    expect(headers.get('x-powered-by')).toBe('stalwart')
  })

  it('preserves a redirect location exactly as Stalwart published it', () => {
    const upstream = new Response(null, {
      status: 302,
      headers: { location: 'https://jadmin.example.com/admin' },
    })
    expect(makeResponseHeaders(upstream).get('location'))
      .toBe('https://jadmin.example.com/admin')
  })
})

describe('worker.fetch', () => {
  it('answers /health without contacting the upstream', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await worker.fetch(request('/health'), env, {} as ExecutionContext)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a missing UPSTREAM_URL with a 500', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await worker.fetch(request('/jmap'), {} as Env, {} as ExecutionContext)

    expect(res.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes JMAP discovery bodies through untouched', async () => {
    const session = JSON.stringify({
      apiUrl: 'https://jadmin.example.com/jmap/',
      downloadUrl: 'https://jadmin.example.com/jmap/download/{accountId}/{blobId}/{name}',
      uploadUrl: 'https://jadmin.example.com/jmap/upload/{accountId}/',
    })
    const fetchMock = vi.fn(async () => new Response(session, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await worker.fetch(
      request('/.well-known/jmap'),
      env,
      {} as ExecutionContext,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(session)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('passes the method, body and query through to the tunnel host', async () => {
    const fetchMock = vi.fn(
      async (_target: URL | RequestInfo, _init?: RequestInit) => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const req = new Request('https://front.example.com/jmap?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer API_x' },
      body: '[]',
    })
    const res = await worker.fetch(req, env, {} as ExecutionContext)

    expect(res.status).toBe(200)
    const [target, init] = fetchMock.mock.calls[0]
    expect(String(target)).toBe('https://jadmin.example.com/jmap?x=1')
    expect((init as RequestInit).method).toBe('POST')
    expect(((init as RequestInit).headers as Headers).get('authorization')).toBe('Bearer API_x')
    expect((init as RequestInit).body).toBe(req.body)
  })

  it('returns 502 when the upstream request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('tunnel down')
    }))

    const res = await worker.fetch(request('/jmap'), env, {} as ExecutionContext)

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Upstream request failed: tunnel down' })
  })

  it('forwards Upgrade/Connection headers on WebSocket upgrades', async () => {
    const fetchMock = vi.fn(
      async (_target: URL | RequestInfo, _init?: RequestInit) => ({
        status: 101,
        webSocket: { accept() {}, close() {} },
      }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)

    const req = request('/jmap/ws', {
      upgrade: 'websocket',
      connection: 'Upgrade',
      authorization: 'Bearer API_x',
      'sec-websocket-protocol': 'jmap',
    })
    const res = await worker.fetch(req, env, {} as ExecutionContext)

    expect(res.status).toBe(101)
    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Headers
    expect(headers.get('upgrade')).toBe('websocket')
    expect(headers.get('connection')).toBe('Upgrade')
    expect(headers.get('authorization')).toBe('Bearer API_x')
    expect(headers.get('sec-websocket-protocol')).toBe('jmap')
  })

  it('returns 502 when an upgrade is not accepted upstream', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 101 })))

    const req = request('/jmap/ws', { upgrade: 'websocket', connection: 'Upgrade' })
    const res = await worker.fetch(req, env, {} as ExecutionContext)

    expect(res.status).toBe(502)
  })
})
