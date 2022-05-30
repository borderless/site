import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { URLSearchParams } from "node:url";
import getRawBody from "raw-body";
import { Request, Server, StreamOptions } from "../server.js";

/**
 * Node.js compatible version of the `Headers`.
 */
class NodeParams {
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
 * Transform a node.js request into a supported site request.
 */
export function fromNodeRequest(req: IncomingMessage): Request {
  return new NodeRequest(req);
}

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err: Error) => void
) => void;

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
    server(fromNodeRequest(req), getContext(req, res))
      .then((response) => {
        res.statusCode = response.status;
        for (const [key, value] of response.headers) {
          res.setHeader(key, value);
        }
        if (typeof response.body === "object") {
          response.body.nodeStream(options).then((x) => x.pipe(res), next);
        } else {
          res.end(response.body);
        }
      })
      .catch(next);
  };
}

class NodeRequest implements Request {
  method: string;
  pathname: string;
  search: URLSearchParams;

  headers = new NodeParams(this.req.headers);

  constructor(private req: IncomingMessage) {
    const url = new URL(req.url ?? "", `http://localhost`);

    this.method = req.method?.toUpperCase() ?? "GET";
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

  text() {
    return getRawBody(this.req).then((value) => value.toString());
  }

  json() {
    return getRawBody(this.req).then((value) => JSON.parse(value.toString()));
  }
}
