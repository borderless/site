import { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { FormParams, Request, RequestType } from "./index.js";
import getRawBody from "raw-body";
import { URLSearchParams } from "node:url";

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

const FORM_CONTENT_TYPE_RE = /^application\/x-www-form-urlencoded(?:;|$)/i;

/**
 * Transform a node.js request into a supported site request.
 */
export function fromNodeRequest(req: IncomingMessage): Request {
  const method = req.method?.toUpperCase() ?? "GET";
  const url = new URL(req.url ?? "", `http://localhost`);
  const contentType = req.headers["content-type"] ?? "";

  if (FORM_CONTENT_TYPE_RE.test(contentType)) {
    return {
      method,
      type: RequestType.FORM,
      pathname: url.pathname,
      search: url.searchParams,
      headers: new NodeParams(req.headers),
      form: () => toFormParams(req),
    };
  }

  return {
    method,
    type: RequestType.UNKNOWN,
    pathname: url.pathname,
    search: url.searchParams,
    headers: new NodeParams(req.headers),
  };
}

/**
 * Transform a form into parameters.
 */
function toFormParams(req: IncomingMessage): Promise<FormParams> {
  return getRawBody(req).then((value) => new URLSearchParams(value.toString()));
}
