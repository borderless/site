import {
  Request as SiteRequest,
  Headers as SiteHeaders,
  FormParams as SiteFormParams,
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
    const res = await server(new WorkerRequest(req), getContext(req));

    const init = {
      status: res.status,
      headers: Array.from(res.headers.entries()),
    };

    if (typeof res.body === "object") {
      const { prefix, suffix, stream } = await res.body.readableStream(options);
      const { readable, writable } = new TransformStream();

      const write = (text: Uint8Array) => {
        const writer = writable.getWriter();
        return writer.write(text).then(() => writer.releaseLock());
      };

      write(prefix())
        .then(() => stream.pipeTo(writable, { preventClose: true }))
        .then(() => write(suffix()).then(() => writable.close()));

      return new Response(readable, init);
    }

    return new Response(res.body, init);
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

class WorkerForm implements SiteFormParams {
  constructor(private formData: FormData) {}

  get(name: string) {
    const value = this.formData.get(name);
    if (typeof value === "string") return value;
    return null;
  }

  getAll(name: string) {
    const values = this.formData.getAll(name);
    return values.filter((value): value is string => typeof value === "string");
  }

  has(name: string) {
    return this.formData.has(name);
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

  async form() {
    return new WorkerForm(await this.req.formData());
  }

  json() {
    return this.req.json();
  }

  text() {
    return this.req.text();
  }
}
