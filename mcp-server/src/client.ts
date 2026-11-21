type QueryValue = string | number | boolean | undefined | null;
type Query = Record<string, QueryValue>;

interface Envelope {
  code: number;
  message: string;
  data?: unknown;
}

export class CloudMailClient {
  private readonly baseUrl: string;
  private readonly user: string;
  private readonly password: string;
  private token: string | null = null;

  constructor(baseUrl: string, user: string, password: string) {
    this.baseUrl = baseUrl;
    this.user = user;
    this.password = password;
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.user, password: this.password }),
    });
    const envelope = (await res.json()) as Envelope;
    if (envelope.code !== 200) {
      throw new Error(envelope.message);
    }
    const data = envelope.data as { token: string };
    this.token = data.token;
  }

  private buildUrl(path: string, query?: Query): string {
    const url = `${this.baseUrl}/api${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }

  async request(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
    retried = false
  ): Promise<unknown> {
    if (!this.token) {
      await this.login();
    }

    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = { Authorization: this.token as string };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const res = await fetch(url, { method, headers, body });
    const envelope = (await res.json()) as Envelope;

    if (envelope.code === 401 && !retried) {
      this.token = null;
      await this.login();
      return this.request(method, path, opts, true);
    }

    if (envelope.code !== 200) {
      throw new Error(`cloud-mail ${envelope.code}: ${envelope.message}`);
    }

    return envelope.data;
  }

  get(path: string, query?: Query): Promise<unknown> {
    return this.request('GET', path, { query });
  }

  post(path: string, body?: unknown): Promise<unknown> {
    return this.request('POST', path, { body });
  }

  put(path: string, body?: unknown): Promise<unknown> {
    return this.request('PUT', path, { body });
  }

  del(path: string, query?: Query): Promise<unknown> {
    return this.request('DELETE', path, { query });
  }
}
