/// <reference lib="webworker" />

import React from "react";
import * as ReactDOM from "react-dom/server";
import { zip, map } from "iterative";
import { createRouter } from "@borderless/router";
import { FilledContext, HelmetProvider } from "react-helmet-async";
import { PassThrough } from "stream";
import { PageData, PageDataContext } from "./shared.js";
import type { AppProps } from "./app.js";
import type { HeadOptions, TailOptions } from "./document.js";

/**
 * Headers sent to the server for the request.
 */
export interface Headers {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}

/**
 * Parameters sent using form encoding to the server.
 */
export interface FormParams {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}

/**
 * Standardized request format for server implementations.
 */
export interface Request {
  method: string;
  pathname: string;
  search: URLSearchParams;
  headers: Headers;
  form: () => Promise<FormParams>;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

/**
 * Parameters provided from matching path segments, e.g. `/[param]`.
 */
export type Params = ReadonlyMap<string, string>;

/**
 * The request context used for server side functions.
 */
export interface ServerSideContext<C> {
  key: string;
  request: Request;
  params: Params;
  context: C;
  render: () => Promise<Response>;
  formData: object | undefined;
}

/**
 * Valid return type of `getServerSideProps`.
 */
export interface ServerSideProps<P> {
  props: P;
  hydrate?: boolean;
  status?: number;
  redirect?: { url: string };
}

/**
 * Function signature for `getServerSideProps`.
 */
export type GetServerSideProps<P, C> = (
  context: ServerSideContext<C>
) => ServerSideProps<P> | undefined | null;

/**
 * Generic node.js stream support in the API.
 */
export interface NodeStream {
  pipe<Writable extends NodeJS.WritableStream>(destination: Writable): Writable;
}

/**
 * Stream rendering options.
 */
export interface StreamOptions {
  head?: string;
  tail?: string;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
  waitForAllReady?: boolean;
}

/**
 * Raw node.js stream result.
 */
export interface RawNodeStream {
  prefix: () => string;
  suffix: () => string;
  stream: ReactDOM.PipeableStream;
}

/**
 * Raw web stream result.
 */
export interface RawReadableStream {
  prefix: () => Uint8Array;
  suffix: () => Uint8Array;
  stream: ReactDOM.ReactDOMServerReadableStream;
}

/**
 * Supported body interfaces.
 */
export interface Body {
  rawNodeStream(options?: StreamOptions): Promise<RawNodeStream>;
  nodeStream(options?: StreamOptions): Promise<NodeStream>;
  rawReadableStream(options?: StreamOptions): Promise<RawReadableStream>;
  readableStream(options?: StreamOptions): Promise<ReadableStream>;
}

/**
 * Simple `Response` interface for returning site pages.
 */
export interface Response {
  status: number;
  headers: ReadonlyMap<string, string>;
  body: Body | string | undefined;
}

/**
 * Handle all incoming requests to the current route.
 */
export type OnRequestHandler<C> = (
  context: ServerSideContext<C>,
  next: () => Promise<Response>
) => Response | Promise<Response>;

/**
 * The server module page allows creation of loader and form handling.
 */
export interface PageServerModule<C> {
  getServerSideProps?: GetServerSideProps<{}, C>;
  onRequest?: Record<string, OnRequestHandler<C> | undefined>;
}

/**
 * The page component exports the component to be rendered as HTML.
 */
export interface PageModule {
  default?: React.ComponentType<{}>;
}

/**
 * The application module exports a react component that wraps every page.
 */
export interface AppModule {
  default?: React.ComponentType<AppProps>;
}

/**
 * The document module exports a function that returns the HTML header and footer.
 */
export interface DocumentModule {
  renderHead?: (options: HeadOptions) => string;
  renderTail?: (options: TailOptions) => string;
}

/**
 * Supported component loader input types (promises and functions).
 */
export type ServerLoader<T> = T | Promise<T> | (() => T | Promise<T>);

/**
 * Server-side only components.
 */
export interface ServerFile<T> {
  module: ServerLoader<T>;
}

/**
 * Server-side page component.
 */
export interface ServerPage<C> {
  module?: ServerLoader<PageModule>;
  serverModule?: ServerLoader<PageServerModule<C>>;
  scripts?: string[];
  css?: string[];
}

/**
 * Create a server instance from pages.
 */
export interface ServerOptions<C> {
  pages: Record<string, ServerPage<C>>;
  notFound?: ServerPage<C>;
  app?: ServerFile<AppModule>;
  document?: ServerFile<DocumentModule>;
}

/**
 * The server is just a `Request` in and `Response` out.
 */
export type Server<C> = (request: Request, context: C) => Promise<Response>;

/**
 * Create a simple SSR service given pages and apps.
 */
export function createServer<C>(options: ServerOptions<C>): Server<C> {
  const router = createPageRouter(options.pages);

  // The not found page is a fallback component used to render.
  const notFoundRoute: Route<C> = options.notFound
    ? {
        key: "_404",
        module: fn(options.notFound.module),
        serverModule: fn(options.notFound.serverModule),
        scripts: options.notFound.scripts ?? [],
        css: options.notFound.css ?? [],
        params: new Map(),
      }
    : {
        key: "_404",
        module: fn(import("./404.js")),
        serverModule: fn({}),
        scripts: [],
        css: [],
        params: new Map(),
      };

  // The app component is used to wrap pages on the client and server side.
  const serverApp = options.app
    ? {
        module: fn(options.app.module),
      }
    : { module: fn(import("./app.js")) };

  // The document component is used to wrap the output HTML server-side.
  const serverDocument = options.document
    ? {
        module: fn(options.document.module),
      }
    : { module: fn(import("./document.js")) };

  return async function handler(request, context): Promise<Response> {
    const method = request.method.toUpperCase();
    const pathname = request.pathname.slice(1);
    const route = router(pathname) ?? notFoundRoute;

    const [page = {}, server = {}, app, document] = await Promise.all([
      route.module(),
      route.serverModule(),
      serverApp.module(),
      serverDocument.module(),
    ]);

    const { onRequest = {} } = server;
    const { key, params, scripts, css } = route;
    const ctx: ServerSideContext<C> = {
      key,
      request,
      context,
      params,
      render,
      formData: undefined,
    };

    async function render() {
      // Assert rendering is available for everything else.
      const App = must(
        app.default,
        `The "_app" module is missing a default export`
      );
      const Component = must(
        page.default,
        `The page for "${route.key}" module is missing a default export`
      );
      const renderHead = must(
        document.renderHead,
        `The "_document" module is missing the "renderHead" export`
      );
      const renderTail = must(
        document.renderTail,
        `The "_document" module is missing the "renderTail" export`
      );

      const serverSideProps: Partial<ServerSideProps<object>> =
        (await server.getServerSideProps?.(ctx)) ?? {};

      // Skip rendering props when `redirect` is returned.
      if (serverSideProps.redirect) {
        return redirect(
          serverSideProps.redirect.url,
          serverSideProps.status ?? 302
        );
      }

      const { formData } = ctx;
      const { props = {}, hydrate = true } = serverSideProps;
      const pageData: PageData = { props, formData };
      const helmetContext = {};

      const renderContext: RenderContext<C> = {
        css,
        helmetContext,
        hydrate,
        pageData,
        renderHead,
        renderTail,
        scripts,
      };

      // The 404 route should not render in an application wrapper.
      if (route === notFoundRoute) {
        return {
          status: serverSideProps.status ?? 404,
          headers: new Map([["content-type", "text/html"]]),
          body: new ReactBody(<Component />, renderContext),
        };
      }

      return {
        status: serverSideProps.status ?? 200,
        headers: new Map([["content-type", "text/html"]]),
        body: new ReactBody(
          (
            <App>
              <Component />
            </App>
          ),
          renderContext
        ),
      };
    }

    // Process using `onRequest` first when the method exists.
    const handler = onRequest[method];
    if (handler) {
      return handler(ctx, () =>
        Promise.resolve({
          status: 415,
          headers: new Map(),
          body: undefined,
        })
      );
    }

    // Render any GET requests to pages that exist.
    if (method === "GET" && page.default) {
      return ctx.render();
    }

    // Generate list of allowed methods.
    const allowed = new Set(Object.keys(onRequest));
    if (page.default) allowed.add("GET");

    if (allowed.size) {
      return {
        status: 405,
        headers: new Map([["allow", Array.from(allowed).join(",")]]),
        body: undefined,
      };
    }

    return {
      status: 404,
      headers: new Map(),
      body: undefined,
    };
  };
}

type Loader<T> = () => T | Promise<T>;

/**
 * Route matches return information needed to render.
 */
type Route<C> = {
  key: string;
  module: Loader<PageModule | undefined>;
  serverModule: Loader<PageServerModule<C> | undefined>;
  scripts: string[];
  css: string[];
  params: ReadonlyMap<string, string>;
};

/**
 * Create a router for matching path names to pages.
 */
function createPageRouter<C>(
  pages: Record<string, ServerPage<C>>
): (pathname: string) => Route<C> | undefined {
  const routes = new Map(
    Object.entries(pages).map(
      ([key, contents]): [string, Omit<Route<C>, "key" | "params">] => {
        return [
          key,
          {
            module: fn(contents.module),
            serverModule: fn(contents.serverModule),
            scripts: contents.scripts ?? [],
            css: contents.css ?? [],
          },
        ];
      }
    )
  );

  const router = createRouter(routes.keys());

  return (pathname) => {
    for (const { route, keys, values } of router(pathname)) {
      const { module, serverModule, scripts, css } = routes.get(route)!;
      const params = new Map(zip(keys, map(values, decode)));
      return { key: route, module, serverModule, params, scripts, css };
    }
  };
}

/**
 * Context required for rendering the application on client or server.
 */
interface RenderContext<C> {
  css: string[];
  helmetContext: {};
  hydrate: boolean;
  pageData: PageData;
  renderHead: (options: HeadOptions) => string;
  renderTail: (options: TailOptions) => string;
  scripts: string[];
}

/**
 * Decode path parameters for users.
 */
function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Turn value into function, but keep existing function as a function.
 */
function fn<T>(value: T | (() => T)): () => T {
  return typeof value === "function" ? (value as () => T) : () => value;
}

/**
 * Asserts that a value is defined.
 */
function must<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new TypeError(message);
  return value;
}

/**
 * React body renderer that supports multiple ways of returning the application.
 */
class ReactBody<C> implements Body {
  constructor(private page: JSX.Element, private context: RenderContext<C>) {}

  private getApp() {
    const { hydrate, pageData, helmetContext, scripts } = this.context;

    const app = (
      <HelmetProvider context={helmetContext}>
        <PageDataContext.Provider value={pageData}>
          {this.page}
        </PageDataContext.Provider>
      </HelmetProvider>
    );

    const renderOptions = hydrate
      ? {
          bootstrapModules: scripts,
          bootstrapScriptContent: `window.__DATA__=${JSON.stringify(pageData)}`,
        }
      : undefined;

    return { app, renderOptions };
  }

  private renderPrefix(initialHead: string): string {
    const { helmetContext, css } = this.context;
    const { helmet } = helmetContext as FilledContext;

    const htmlAttributes = helmet.htmlAttributes.toString();
    const bodyAttributes = helmet.bodyAttributes.toString();
    let head = initialHead;

    head += helmet.title.toString();
    head += helmet.priority.toString();
    head += helmet.base.toString();
    head += helmet.meta.toString();
    head += helmet.link.toString();

    for (const href of css) {
      head += `<link rel="stylesheet" href="${href}">`;
    }

    head += helmet.style.toString();
    head += helmet.script.toString();

    return this.context.renderHead({ htmlAttributes, bodyAttributes, head });
  }

  private renderSuffix(initialTail: string): string {
    const tail = initialTail;
    return this.context.renderTail({ tail });
  }

  async rawReadableStream(
    options: StreamOptions = {}
  ): Promise<RawReadableStream> {
    const { signal, onError, waitForAllReady, head = "", tail = "" } = options;
    const { app, renderOptions } = this.getApp();
    const encoder = new TextEncoder();

    const stream = await ReactDOM.renderToReadableStream(app, {
      signal,
      onError,
      ...renderOptions,
    });

    if (waitForAllReady) await stream.allReady;

    return {
      prefix: () => encoder.encode(this.renderPrefix(head)),
      suffix: () => encoder.encode(this.renderSuffix(tail)),
      stream,
    };
  }

  async readableStream(options: StreamOptions = {}): Promise<ReadableStream> {
    const { prefix, suffix, stream } = await this.rawReadableStream(options);
    const { readable, writable } = new TransformStream();

    const write = (text: Uint8Array) => {
      const writer = writable.getWriter();
      return writer.write(text).then(() => writer.releaseLock());
    };

    write(prefix())
      .then(() => stream.pipeTo(writable, { preventClose: true }))
      .then(() => write(suffix()).then(() => writable.close()))
      .catch(options.onError);

    return readable;
  }

  rawNodeStream(options: StreamOptions = {}): Promise<RawNodeStream> {
    const { signal, onError, waitForAllReady, head = "", tail = "" } = options;

    return new Promise((resolve, reject) => {
      const prefix = () => this.renderPrefix(head);
      const suffix = () => this.renderSuffix(tail);

      const onAllReady = () => {
        signal?.removeEventListener("abort", onAbort);
        if (waitForAllReady) {
          return resolve({ prefix, suffix, stream });
        }
      };

      const onShellReady = waitForAllReady
        ? undefined
        : () => resolve({ prefix, suffix, stream });

      const onShellError = (err: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        return reject(err);
      };

      const { app, renderOptions } = this.getApp();
      const stream = ReactDOM.renderToPipeableStream(app, {
        onAllReady,
        onError,
        onShellReady,
        onShellError,
        ...renderOptions,
      });

      const onAbort = () => stream.abort();
      signal?.addEventListener("abort", onAbort);
    });
  }

  async nodeStream(options: StreamOptions = {}): Promise<NodeStream> {
    const { prefix, suffix, stream } = await this.rawNodeStream(options);
    const proxy = new PassThrough({
      flush(cb) {
        return cb(null, suffix());
      },
    });
    proxy.write(prefix());
    stream.pipe(proxy);
    return proxy;
  }
}

/**
 * Format JSON as response.
 */
export function json(json: unknown, status = 200): Response {
  return {
    status,
    headers: new Map([["content-type", "application/json"]]),
    body: JSON.stringify(json),
  };
}

/**
 * Format redirect as a response.
 */
export function redirect(location: string, status = 302): Response {
  return {
    status,
    headers: new Map([["location", location]]),
    body: undefined,
  };
}

/** Match form submissions for `onSubmit` server handler. */
const FORM_CONTENT_TYPE_RE = /^application\/x-www-form-urlencoded(?:;|$)/i;

/**
 * Handle form submission on the server-side.
 */
export type OnFormSubmitHandler<C> = (
  context: ServerSideContext<C>
) => object | Promise<object>;

/**
 * Handle form submissions for `onRequest`.
 */
export function onFormSubmit<C>(
  process: OnFormSubmitHandler<C>
): OnRequestHandler<C> {
  return async function formHandler(ctx, next) {
    const type = ctx.request.headers.get("content-type") ?? "";
    if (FORM_CONTENT_TYPE_RE.test(type)) {
      ctx.formData = await process(ctx);
      return ctx.render();
    }
    return next();
  };
}
