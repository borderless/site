import {
  Request as SiteRequest,
  Headers as SiteHeaders,
  Server,
  StreamOptions,
} from "../server.js";

/**
 * Worker compatible handler.
 */
export type Handler = (request: Request) => Promise<Response>;

/**
 * Get context from the request instance.
 */
export type GetContext<C> = (req: Request) => C;

/**
 * Worker compatible request handler.
 */
export function createHandler<C>(
  server: Server<C>,
  getContext: GetContext<C>,
  options?: StreamOptions
): Handler {
  return async function handler(req) {
    const url = new URL(req.url);

    const res = await server(new WorkerRequest(req), getContext(req));
    const body =
      typeof res.body === "object" ? await res.body.readableStream() : res.body;

    return new Response(body, {
      status: res.status,
      headers: Array.from(res.headers.entries()),
    });
  };
}

class WorkerHeaders implements SiteHeaders {
  constructor(private headers: Headers) {}

  get(name: string) {
    return this.headers.get(name);
  }

  getAll(name: string): never {
    throw new TypeError("Not implemented in workers");
  }

  has(name: string) {
    return this.headers.has(name);
  }
}

class WorkerRequest implements SiteRequest {
  pathname: string;
  search: URLSearchParams;

  method = this.req.method;
  headers = new WorkerHeaders(this.req.headers);

  constructor(private req: Request) {
    const url = new URL(req.url ?? "", `http://localhost`);
    this.pathname = url.pathname;
    this.search = url.searchParams;
  }

  arrayBuffer() {
    return this.req.arrayBuffer();
  }

  form() {
    return this.req.text().then((value) => new URLSearchParams(value));
  }

  json() {
    return this.req.json();
  }

  text() {
    return this.req.text();
  }
}
