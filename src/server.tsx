/// <reference lib="webworker" />

import React from "react";
import * as ReactDOM from "react-dom/server";
import { zip, map } from "iterative";
import { createRouter } from "@borderless/router";
import { FilledContext, HelmetProvider } from "react-helmet-async";
import { PassThrough } from "stream";
import { GLOBAL_PAGE_DATA } from "./common.js";
import {
  PageData,
  PageDataContext,
  typeError,
  DataLoaderValue,
  DataLoaderContext,
} from "./shared.js";
import {
  ServerSideProps,
  ServerSideContext,
  Request,
  RequestType,
  GetServerSideProps,
} from "./index.js";
import type { AppProps } from "./app.js";
import type { HeadOptions, TailOptions } from "./document.js";

export type OnError = (error: unknown) => void;

/**
 * Generic node.js stream support in the API.
 */
export interface NodeStream {
  pipe<Writable extends NodeJS.WritableStream>(destination: Writable): Writable;
}

export interface NodeStreamOptions {
  head?: string;
  onError?: OnError;
  signal?: AbortSignal;
}

export interface ReadableStreamOptions {
  head?: string;
  onError?: OnError;
  signal?: AbortSignal;
}

export interface RawNodeStreamOptions extends NodeStreamOptions {
  onReady?: () => void;
}

export interface RawNodeStream {
  prefix: () => string;
  suffix: () => string;
  stream: ReactDOM.PipeableStream;
}

export interface RawReadableStreamOptions extends ReadableStreamOptions {}

export interface RawReadableStream {
  prefix: () => Uint8Array;
  suffix: () => Uint8Array;
  stream: ReactDOM.ReactDOMServerReadableStream;
}

/**
 * Supported body interfaces.
 */
export interface Body {
  rawNodeStream(options?: RawNodeStreamOptions): Promise<RawNodeStream>;
  nodeStream(options?: NodeStreamOptions): Promise<NodeStream>;
  rawReadableStream(
    options?: RawReadableStreamOptions
  ): Promise<RawReadableStream>;
  readableStream(options?: ReadableStreamOptions): Promise<ReadableStream>;
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
 * The page component exports the component to be rendered as HTML.
 */
export interface PageModule {
  default?: React.ComponentType<{}>;
}

export type FormHandler<C> = (context: ServerSideContext<C>) => object;

export type LoaderHandler<C> = (
  context: ServerSideContext<C>,
  ...args: unknown[]
) => unknown | Promise<unknown>;

/**
 * The server module page allows creation of loader and form handling.
 */
export interface PageServerModule<C> {
  getServerSideProps?: GetServerSideProps<{}, C>;
  loader?: LoaderHandler<C>;
  form?: FormHandler<C>;
}

/**
 * The application module exports a react component that wraps every page.
 */
export interface AppModule {
  default: React.ComponentType<AppProps>;
}

/**
 * The document module exports a function that returns the HTML header and footer.
 */
export interface DocumentModule {
  renderHead: (options: HeadOptions) => string;
  renderTail: (options: TailOptions) => string;
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
  module: ServerLoader<PageModule>;
  serverModule?: ServerLoader<PageServerModule<C>>;
  url?: string;
  css?: string[];
}

/**
 * Create a server instance from pages.
 */
export interface ServerOptions<C> {
  pages: Record<string, ServerPage<C>>;
  error?: ServerPage<C>;
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

  // The error page is the fallback component used when something breaks.
  const errorRoute: Route<C> = options.error
    ? {
        key: "_error",
        module: fn(options.error.module),
        serverModule: fn(options.error.serverModule ?? {}),
        scriptUrl: options.error.url,
        cssUrls: options.error.css,
        params: new Map(),
      }
    : {
        key: "_error",
        module: fn<object>(import("./error.js")),
        serverModule: fn(import("./error.server.js")),
        scriptUrl: undefined,
        cssUrls: undefined,
        params: new Map(),
      };

  // The not found page is a fallback component used to render.
  const notFoundRoute: Route<C> = options.notFound
    ? {
        key: "_404",
        module: fn(options.notFound.module),
        serverModule: fn(options.notFound.serverModule ?? {}),
        scriptUrl: options.notFound.url,
        cssUrls: options.notFound.css,
        params: new Map(),
      }
    : {
        key: "_404",
        module: fn(import("./404.js")),
        serverModule: fn({}),
        scriptUrl: undefined,
        cssUrls: undefined,
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

  return async function server(request, context) {
    const pathname = request.pathname.slice(1);
    const route = router(pathname) ?? notFoundRoute;

    const [page, server, app, document] = await Promise.all([
      route.module(),
      route.serverModule(),
      serverApp.module(),
      serverDocument.module(),
    ] as const);

    const renderHead = must(
      document.renderHead,
      `The "_document" module is missing the "renderHead" export`
    );
    const renderTail = must(
      document.renderTail,
      `The "_document" module is missing the "renderTail" export`
    );

    const { key, params } = route;
    const serverSideContext: ServerSideContext<C> = {
      key,
      request,
      context,
      params,
    };
    const loader = getLoader(server, serverSideContext);

    try {
      const helmetContext = {};
      const Component = must(
        page.default,
        `The page for "${route.key}" module is missing a default export`
      );

      if (route === notFoundRoute) {
        if (request.method === "GET") {
          const serverSideProps = await getServerSideProps(
            server,
            serverSideContext
          );

          return render(<Component />, 404, {
            route,
            helmetContext,
            serverSideProps,
            loader,
            renderHead,
            renderTail,
            formData: undefined,
          });
        }

        return {
          status: 404,
          headers: new Map(),
          body: undefined,
        };
      }

      const App = must(
        app.default,
        `The "_app" module is missing a default export`
      );

      if (request.method === "POST" && typeof server.form === "function") {
        if (request.type === RequestType.FORM) {
          const formData = await server.form(serverSideContext);
          const serverSideProps = await getServerSideProps(
            server,
            serverSideContext
          );

          return render(
            <App>
              <Component />
            </App>,
            200,
            {
              route,
              helmetContext,
              serverSideProps,
              loader,
              formData,
              renderHead,
              renderTail,
            }
          );
        }

        return {
          status: 415,
          headers: new Map(),
          body: undefined,
        };
      }

      if (request.method === "GET") {
        // Handle loader requests as JSON responses.
        if (request.search.get("__site__") === "1") {
          const args = request.search.getAll("data").map((x) => JSON.parse(x));
          const data = await loader(...args);

          return {
            status: 200,
            headers: new Map([["content-type", "application/json"]]),
            body: JSON.stringify(data),
          };
        }

        const serverSideProps = await getServerSideProps(
          server,
          serverSideContext
        );

        return render(
          <App>
            <Component />
          </App>,
          200,
          {
            route,
            helmetContext,
            serverSideProps,
            loader,
            renderHead,
            renderTail,
            formData: undefined,
          }
        );
      }

      return {
        status: 405,
        headers: new Map([["allow", generateAllowHeader(server)]]),
        body: undefined,
      };
    } catch (error) {
      const [page, server] = await Promise.all([
        errorRoute.module(),
        errorRoute.serverModule(),
      ] as const);

      const Component = must(
        page.default,
        `The page for "${route.key}" module is missing a default export`
      );

      const serverSideProps = await getServerSideProps(
        server,
        Object.assign(serverSideContext, { error })
      );

      return render(<Component />, 500, {
        route,
        helmetContext: {},
        serverSideProps,
        loader,
        renderHead,
        renderTail,
        formData: undefined,
      });
    }
  };
}

/**
 * Generate the list of allowed methods for unknown request types.
 */
function generateAllowHeader<C>(server: PageServerModule<C>): string {
  const allow = ["GET"];
  if (typeof server.form === "function") allow.push("POST");
  return allow.join(",");
}

/**
 * Get the data loader for the current route.
 */
function getLoader<C>(
  server: PageServerModule<C>,
  context: ServerSideContext<C>
): DataLoaderValue {
  const serverLoader =
    server.loader ??
    typeError(`Missing a data loader implementation: ${context.key}`);
  return async (...args) => serverLoader(context, ...args);
}

/**
 * Get the server-side props for the current route.
 */
async function getServerSideProps<C>(
  server: PageServerModule<C>,
  context: ServerSideContext<C>
) {
  return (
    (await server.getServerSideProps?.(context)) ?? {
      props: {},
    }
  );
}

type Loader<T> = () => T | Promise<T>;

/**
 * Route matches return information needed to render.
 */
type Route<C> = {
  key: string;
  module: Loader<PageModule>;
  serverModule: Loader<PageServerModule<C>>;
  scriptUrl: string | undefined;
  cssUrls: string[] | undefined;
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
            serverModule: fn(contents.serverModule ?? {}),
            scriptUrl: contents.url,
            cssUrls: contents.css,
          },
        ];
      }
    )
  );

  const router = createRouter(routes.keys());

  return (pathname) => {
    for (const { route, keys, values } of router(pathname)) {
      const { module, serverModule, scriptUrl, cssUrls } = routes.get(route)!;
      const params = new Map(zip(keys, map(values, decode)));
      return { key: route, module, serverModule, scriptUrl, params, cssUrls };
    }
  };
}

/**
 * Context required for rendering the application on client or server.
 */
interface RenderContext<C> {
  route: Route<C>;
  helmetContext: {};
  loader: DataLoaderValue;
  formData: object | undefined;
  serverSideProps: ServerSideProps<{}> | undefined;
  renderHead: (options: HeadOptions) => string;
  renderTail: (options: TailOptions) => string;
}

/**
 * Server render the page.
 */
async function render<C>(
  element: JSX.Element,
  initialStatus: number,
  context: RenderContext<C>
): Promise<Response> {
  const { redirect, status } = context.serverSideProps ?? {};

  // Skip rendering props when `redirect` is returned.
  if (redirect) {
    return {
      status: status ?? 302,
      headers: new Map([["location", redirect.url]]),
      body: undefined,
    };
  }

  return {
    status: status ?? initialStatus,
    headers: new Map([["content-type", "text/html"]]),
    body: new ReactBody(element, context),
  };
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
function fn<T extends object>(value: T | (() => T)): () => T {
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
 * Default fallback for error handling.
 */
const logger =
  process.env.NODE_ENV === "production"
    ? undefined
    : (err: unknown) => console.error(err);

/**
 * React body renderer that supports multiple ways of returning the application.
 */
class ReactBody<C> implements Body {
  constructor(private page: JSX.Element, private context: RenderContext<C>) {}

  getApp() {
    const pageData: PageData = {
      props: this.context.serverSideProps?.props ?? {},
      formData: this.context.formData,
    };

    const app = (
      <HelmetProvider context={this.context.helmetContext}>
        <PageDataContext.Provider value={pageData}>
          <DataLoaderContext.Provider value={this.context.loader}>
            {this.page}
          </DataLoaderContext.Provider>
        </PageDataContext.Provider>
      </HelmetProvider>
    );

    const { scriptUrl } = this.context.route;
    const renderOptions = scriptUrl
      ? {
          bootstrapModules: [scriptUrl],
          bootstrapScriptContent: `window.${GLOBAL_PAGE_DATA}=${stringifyForScript(
            pageData
          )}`,
        }
      : undefined;

    return { app, renderOptions };
  }

  renderPrefix(initialHead: string): string {
    const { helmetContext, route } = this.context;
    const { helmet } = helmetContext as FilledContext;

    const htmlAttributes = helmet.htmlAttributes.toString();
    const bodyAttributes = helmet.bodyAttributes.toString();
    let head = initialHead;

    head += helmet.title.toString();
    head += helmet.priority.toString();
    head += helmet.base.toString();
    head += helmet.meta.toString();
    head += helmet.link.toString();

    if (route.cssUrls) {
      for (const href of route.cssUrls) {
        head += `<link rel="stylesheet" href="${href}">`;
      }
    }

    head += helmet.style.toString();
    head += helmet.script.toString();

    return this.context.renderHead({ htmlAttributes, bodyAttributes, head });
  }

  renderSuffix(): string {
    return this.context.renderTail({ script: "" });
  }

  rawReadableStream(
    options: RawReadableStreamOptions = {}
  ): Promise<RawReadableStream> {
    const { signal, onError = logger, head = "" } = options;
    const { app, renderOptions } = this.getApp();
    return ReactDOM.renderToReadableStream(app, {
      signal,
      onError,
      ...renderOptions,
    }).then((stream) => {
      const encoder = new TextEncoder();

      return {
        prefix: () => encoder.encode(this.renderPrefix(head)),
        suffix: () => encoder.encode(this.renderSuffix()),
        stream,
      };
    });
  }

  async readableStream(
    options: ReadableStreamOptions = {}
  ): Promise<ReadableStream> {
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

  rawNodeStream(options: RawNodeStreamOptions = {}): Promise<RawNodeStream> {
    const { signal, onError = logger, onReady, head = "" } = options;

    return new Promise((resolve, reject) => {
      const onAllReady = () => {
        signal?.removeEventListener("abort", onAbort);
        return onReady?.();
      };

      const onShellReady = () => {
        const prefix = () => this.renderPrefix(head);
        const suffix = () => this.renderSuffix();
        return resolve({ prefix, suffix, stream });
      };

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

  async nodeStream(options: NodeStreamOptions = {}): Promise<NodeStream> {
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
 * Format data for rendering into a script tag.
 */
function stringifyForScript(data: unknown): string {
  return JSON.stringify(data).replace(/\<(!--|script|\/script)/gi, "<\\$1");
}
