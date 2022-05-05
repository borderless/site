import React from "react";
import * as ReactDOM from "react-dom/server";
import { zip, map } from "iterative";
import { createRouter } from "@borderless/router";
import AppComponent, { AppProps } from "./app.js";
import renderDocument, { DocumentOptions } from "./document.js";
import NotFoundComponent from "./404.js";
import ErrorComponent, {
  getServerSideProps as getServerSidePropsError,
} from "./error.js";
import { AppContext, GLOBAL_PAGE_DATA, renderApp, PageData } from "./shared.js";
import { FilledContext } from "react-helmet-async";
import { PassThrough } from "stream";
import type {
  ServerSideProps,
  ServerSidePropsContext,
  GetServerSideProps,
  Request,
} from "./index.js";

export type OnError = (error: unknown) => void;

/**
 * Generic node.js stream support in the API.
 */
export interface NodeStream {
  pipe<Writable extends NodeJS.WritableStream>(destination: Writable): Writable;
}

export interface NodeStreamOptions {
  onError?: OnError;
  signal?: AbortSignal;
}

export interface ReadableStreamOptions {
  onError?: OnError;
  signal?: AbortSignal;
}

/**
 * Supported body interfaces.
 */
export interface Body {
  nodeStream(options?: NodeStreamOptions): Promise<NodeStream>;
  readableStream(options?: ReadableStreamOptions): Promise<ReadableStream>;
  text(): string;
}

/**
 * Simple `Response` interface for returning site pages.
 */
export interface Response {
  status: number;
  headers: ReadonlyMap<string, string>;
  body: Body | null;
}

/**
 * The page component exports regular `default` component with `getServerSideProps`.
 */
export interface PageModule<P, C> {
  default?: React.ComponentType<P>;
  getServerSideProps?: GetServerSideProps<P, C>;
}

/**
 * Server-side only modules don't support `getServerSideProps`.
 */
export interface AppModule<P> {
  default: React.ComponentType<AppProps<P>>;
}

export interface DocumentModule {
  default: (options: DocumentOptions) => [string, string];
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
export interface ServerPage<P, C> {
  module: ServerLoader<PageModule<P, C>>;
  url: string | undefined;
}

/**
 * Create a server instance from pages.
 */
export interface ServerOptions<C> {
  pages: Record<string, ServerPage<{}, C>>;
  error?: ServerPage<{}, C>;
  notFound?: ServerPage<{}, C>;
  app?: ServerFile<AppModule<{}>>;
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
  const errorPage = options.error
    ? {
        key: "_error",
        module: fn(options.error.module),
        scriptUrl: options.error.url,
        params: new Map(),
      }
    : {
        key: "_error",
        module: fn<object>({
          default: ErrorComponent,
          getServerSideProps: getServerSidePropsError,
        }),
        scriptUrl: undefined,
        params: new Map(),
      };

  // The not found page is a fallback component used to render.
  const notFoundPage = options.notFound
    ? {
        key: "_404",
        module: fn(options.notFound.module),
        scriptUrl: options.notFound.url,
        params: new Map(),
      }
    : {
        key: "_404",
        module: fn({ default: NotFoundComponent }),
        scriptUrl: undefined,
        params: new Map(),
      };

  // The app component is used to wrap pages on the client and server side.
  const serverApp = options.app
    ? {
        module: fn(options.app.module),
      }
    : { module: fn({ default: AppComponent }) };

  // The document component is used to wrap the output HTML server-side.
  const serverDocument = options.document
    ? {
        module: fn(options.document.module),
      }
    : { module: fn({ default: renderDocument }) };

  return async function server(request, context) {
    const pathname = request.pathname.slice(1);
    const serverPage = router(pathname) ?? notFoundPage;

    const [page, app, document] = await Promise.all([
      serverPage.module(),
      serverApp.module(),
      serverDocument.module(),
    ]);

    const { key: route, params } = serverPage;
    const options: ServerSidePropsContext<C> = {
      route,
      request,
      context,
      params,
    };

    try {
      const status = serverPage === notFoundPage ? 404 : 200;
      const serverSideProps = await getServerSideProps(page, options);
      return render(document, app, page, serverSideProps, status, serverPage);
    } catch (error) {
      const page = await errorPage.module();
      const serverSideProps = await getServerSideProps<{}, C>(
        page,
        Object.assign(options, { error })
      );
      return render(document, app, page, serverSideProps, 500, errorPage);
    }
  };
}

type Loader<T> = () => T | Promise<T>;

/**
 * Route matches return information needed to render.
 */
type Route<P, C> = {
  key: string;
  module: Loader<PageModule<P, C>>;
  scriptUrl: string | undefined;
  params: ReadonlyMap<string, string>;
};

/**
 * Create a router for matching path names to pages.
 */
function createPageRouter<C>(
  pages: Record<string, ServerPage<{}, C>>
): (pathname: string) => Route<{}, C> | undefined {
  const routes = new Map(
    Object.entries(pages).map(
      ([key, contents]): [
        string,
        Pick<Route<{}, C>, "module" | "scriptUrl">
      ] => {
        return [
          key,
          {
            module: fn(contents.module),
            scriptUrl: contents.url,
          },
        ];
      }
    )
  );

  const router = createRouter(routes.keys());

  return (pathname) => {
    for (const { route, keys, values } of router(pathname)) {
      const { module, scriptUrl } = routes.get(route)!;
      const params = new Map(zip(keys, map(values, decode)));
      return { key: route, module, scriptUrl, params };
    }
  };
}

/**
 * Utility function for loading props from a page module.
 */
async function getServerSideProps<P, C>(
  page: PageModule<P, C>,
  context: ServerSidePropsContext<C>
): Promise<ServerSideProps<P>> {
  return page.getServerSideProps?.(context) ?? { props: {} as P };
}

/**
 * Server render the page.
 */
async function render<P, C>(
  document: DocumentModule,
  app: AppModule<P>,
  page: PageModule<P, C>,
  serverSideProps: ServerSideProps<P>,
  initialStatus: number,
  route: Route<P, C>
): Promise<Response> {
  const { key, scriptUrl } = route;
  const { props, redirect, status, headers } = serverSideProps;

  // Skip rendering props when `redirect` is returned.
  if (redirect) {
    return {
      status: status ?? 302,
      headers: new Map([...(headers || []), ["location", redirect.url]]),
      body: null,
    };
  }

  const AppComponent = require(app.default, `The "_app" module is missing a default export`);
  const Component = require(page.default, `The page for "${key}" module is missing a default export`);
  const template = require(document.default, `The "_document" module is missing a default export`);

  const appProps: AppProps<P> = { Component, props };
  const appContext: AppContext = { helmetContext: { helmet: {} } };
  const appElement = renderApp<P>(AppComponent, appProps, appContext);

  return {
    status: status ?? initialStatus,
    headers: new Map([...(headers || []), ["content-type", "text/html"]]),
    body: new ReactBody(appElement, template, props, appContext, scriptUrl),
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
function require<T>(value: T | null | undefined, message: string): T {
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
class ReactBody<P> implements Body {
  constructor(
    private app: JSX.Element,
    private template: (options: DocumentOptions) => [string, string],
    private props: P,
    private context: AppContext,
    private scriptUrl: string | undefined
  ) {}

  getDocumentOptions(): DocumentOptions {
    const { helmet } = this.context.helmetContext as FilledContext;

    const htmlAttributes = helmet.htmlAttributes.toString();
    const bodyAttributes = helmet.bodyAttributes.toString();
    let head = "";
    let script = "";

    head += helmet.title.toString();
    head += helmet.priority.toString();
    head += helmet.base.toString();
    head += helmet.meta.toString();
    head += helmet.link.toString();
    head += helmet.style.toString();
    head += helmet.script.toString();

    if (this.scriptUrl) {
      const data: PageData = { props: this.props };
      const content = JSON.stringify(data).replace(
        /\<(!--|script|\/script)/gi,
        "<\\$1"
      );

      script += `<script>window.${GLOBAL_PAGE_DATA}=${content}</script>`;
      script += `<script type="module" src="${this.scriptUrl}"></script>`;
    }

    return { htmlAttributes, bodyAttributes, head, script };
  }

  async readableStream(
    options: ReadableStreamOptions = {}
  ): Promise<ReadableStream> {
    const { signal, onError = logger } = options;
    const { readable, writable } = new TransformStream();
    const stream = await ReactDOM.renderToReadableStream(this.app, {
      signal,
      onError,
    });
    const [prefix, suffix] = this.template(this.getDocumentOptions());
    writable.getWriter().write(prefix);
    stream
      .pipeTo(writable, { preventClose: true })
      .then(() => {
        const writer = writable.getWriter();
        return writer.write(suffix).then(() => writer.close());
      })
      .catch((err) => onError?.(err));
    return readable;
  }

  nodeStream(options: NodeStreamOptions = {}): Promise<NodeStream> {
    const { signal, onError } = options;

    return new Promise((resolve, reject) => {
      let prefix = "",
        suffix = "";
      const proxy = new PassThrough();
      const stream = ReactDOM.renderToPipeableStream(this.app, {
        onAllReady: () => {
          signal?.removeEventListener("abort", onAbort);
          proxy.write(suffix);
        },
        onError: onError ?? logger,
        onShellReady: () => {
          [prefix, suffix] = this.template(this.getDocumentOptions());
          proxy.write(prefix);
          stream.pipe(proxy);
          return resolve(proxy);
        },
        onShellError: (err) => {
          signal?.removeEventListener("abort", onAbort);
          return reject(err);
        },
      });
      const onAbort = () => stream.abort();
      signal?.addEventListener("abort", onAbort);
    });
  }

  text() {
    const content = ReactDOM.renderToString(this.app);
    const [prefix, suffix] = this.template(this.getDocumentOptions());
    return prefix + content + suffix;
  }
}
