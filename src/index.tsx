import React from "react";
import ReactDOM from "react-dom/server.js";
import { zip, map } from "iterative";
import { createRouter } from "@borderless/router";
import AppComponent, { AppProps } from "./components/app.js";
import DocumentComponent, { DocumentProps } from "./components/document.js";
import NotFoundComponent from "./components/404.js";
import ErrorComponent, {
  getServerSideProps as getServerSidePropsError,
} from "./components/error.js";
import { renderApp } from "./render/client.js";
import { renderDocument } from "./render/server.js";

/**
 * HTML doctype prefix, can't be rendered in React.
 */
const HTML_DOCTYPE = "<!doctype html>";

/**
 * Simple `Request` interface for rendering a page.
 */
export interface Request {
  pathname: string;
  search: ReadonlyMap<string, string>;
  headers: ReadonlyMap<string, string | string[] | undefined>;
}

/**
 * Simple `Response` interface for returning site pages.
 */
export interface Response {
  status: number;
  headers: ReadonlyMap<string, string>;
  text: string;
}

/**
 * The context send to `getServerSideProps`.
 */
export interface ServerSidePropsContext<C> {
  route: string;
  request: Request;
  params: ReadonlyMap<string, string>;
  context: C;
}

/**
 * The context used on the error page.
 */
export interface ServerSidePropsErrorContext<C> {
  request: Request;
  params: ReadonlyMap<string, string>;
  context: C;
  error: unknown;
}

/**
 * Valid return type of `getServerSideProps`.
 */
export interface ServerSideProps<P> {
  props: P;
  status?: number;
  headers?: Iterable<[string, string]>;
  redirect?: { url: string };
}

/**
 * Function signature for `getServerSideProps`.
 */
export type GetServerSideProps<P, C> = (
  context: ServerSidePropsContext<C>
) => ServerSideProps<P> | undefined | null;

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
export interface ServerModule<P> {
  default?: React.ComponentType<P>;
}

/**
 * Supported component loader input types (promises and functions).
 */
export type ServerLoader<T> = T | Promise<T> | (() => T | Promise<T>);

/**
 * Server-side only components.
 */
export interface ServerComponent<P> {
  module: ServerLoader<ServerModule<P>>;
}

/**
 * Server-side page component.
 */
export interface ServerPage<P, C> {
  module: ServerLoader<PageModule<P, C>>;
  url?: string;
}

/**
 * Create a server instance from pages.
 */
export interface ServerOptions<C> {
  pages: Record<string, ServerPage<{}, C>>;
  error?: ServerPage<{}, C>;
  notFound?: ServerPage<{}, C>;
  app?: ServerComponent<AppProps<{}>>;
  document?: ServerComponent<DocumentProps>;
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
    : { module: fn({ default: DocumentComponent }) };

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
    Object.entries(pages).map(([key, contents]): [
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
    })
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
function render<P, C>(
  document: ServerModule<DocumentProps>,
  app: ServerModule<AppProps<P>>,
  page: PageModule<P, C>,
  serverSideProps: ServerSideProps<P>,
  initialStatus: number,
  route: Route<P, C>
): Response {
  const helmetContext = { helmet: {} };
  const { key, scriptUrl } = route;
  const { props, redirect, status, headers } = serverSideProps;

  // Skip rendering props when `redirect` is returned.
  if (redirect) {
    return {
      status: status ?? 302,
      headers: new Map([...(headers || []), ["location", redirect.url]]),
      text: "",
    };
  }

  const AppComponent = require(app.default, `The "_app" module is missing a default export`);
  const DocumentComponent = require(document.default, `The "_document" module is missing a default export`);
  const Component = require(page.default, `The page for "${key}" module is missing a default export`);

  const appElement = renderApp<P>(
    AppComponent,
    {
      Component,
      props,
    },
    {
      helmetContext,
    }
  );

  // Render the document using the collected context and HTML.
  const documentElement = renderDocument(
    DocumentComponent,
    {},
    {
      html: ReactDOM.renderToString(appElement),
      helmet: helmetContext.helmet,
      hydrate: { scriptUrl, props },
    }
  );

  return {
    status: status ?? initialStatus,
    headers: new Map([...(headers || []), ["content-type", "text/html"]]),
    text: HTML_DOCTYPE + ReactDOM.renderToStaticMarkup(documentElement),
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
  return typeof value === "function" ? value : () => value;
}

/**
 * Asserts that a value is defined.
 */
function require<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new TypeError(message);
  return value;
}
