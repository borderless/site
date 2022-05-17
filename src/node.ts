import { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { Headers, Request } from "./index.js";

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
}

export function fromNodeRequest(req: IncomingMessage): Request {
  const url = new URL(req.url ?? "", `http://localhost`);
  return {
    pathname: url.pathname,
    search: url.searchParams,
    headers: new NodeHeaders(req.headers),
  };
}
