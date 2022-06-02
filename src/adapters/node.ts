import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { URLSearchParams } from "node:url";
import { PassThrough } from "node:stream";
import getRawBody from "raw-body";
import { Request, Headers, Server, StreamOptions } from "../server.js";

/**
 * Node.js connect/express compatible handler.
 */
export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err: Error) => void
) => void;

/**
 * Get context from the request instance.
 */
export type GetContext<C> = (req: IncomingMessage, res: ServerResponse) => C;

/**
 * Node.js server handler.
 */
export function createHandler<C>(
  server: Server<C>,
  getContext: GetContext<C>,
  options?: StreamOptions
): Handler {
  return function handler(req, res, next) {
    server(new NodeRequest(req), getContext(req, res))
      .then(async (response) => {
        res.statusCode = response.status;
        for (const [key, value] of response.headers) {
          res.setHeader(key, value);
        }
        if (typeof response.body === "object") {
          const { prefix, suffix, stream } = await response.body.nodeStream(
            options
          );
          const proxy = new PassThrough({
            flush(cb) {
              return cb(null, suffix());
            },
          });
          proxy.write(prefix());
          stream.pipe(proxy);
          proxy.pipe(res, { end: false });
        } else {
          res.end(response.body);
        }
      })
      .catch(next);
  };
}

/**
 * Node.js compatible version of the `Headers`.
 */
class NodeHeaders implements Headers {
  constructor(private headers: IncomingHttpHeaders) {}

  get(name: string): string | null {
    const value = this.headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string") return value;
    return null;
  }

  getAll(name: string): string[] {
    const value = this.headers[name.toLowerCase()];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    return [];
  }

  has(name: string) {
    return name.toLowerCase() in this.headers;
  }
}

/**
 * Node.js compatible request instance.
 */
class NodeRequest implements Request {
  pathname: string;
  search: URLSearchParams;

  method = this.req.method?.toUpperCase() ?? "GET";
  headers = new NodeHeaders(this.req.headers);

  constructor(private req: IncomingMessage) {
    const url = new URL(req.url ?? "", `http://localhost`);
    this.pathname = url.pathname;
    this.search = url.searchParams;
  }

  arrayBuffer() {
    return getRawBody(this.req);
  }

  form() {
    return getRawBody(this.req).then(
      (value) => new URLSearchParams(value.toString())
    );
  }

  json() {
    return getRawBody(this.req).then((value) => JSON.parse(value.toString()));
  }

  text() {
    return getRawBody(this.req).then((value) => value.toString());
  }
}
