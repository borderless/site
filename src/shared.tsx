import React from "react";
import { HelmetProvider } from "react-helmet-async";
import type { AppProps } from "./app.js";

/**
 * Context required for rendering the application on client or server.
 */
export interface AppContext {
  helmetContext: { helmet: {} };
}

/**
 * Data required for rendering a page.
 */
export interface PageData {
  props: unknown;
}

/**
 * Deterministic element ID for hydrating the page.
 */
export const PAGE_ELEMENT_ID = "__SITE__";

/**
 * Deterministic element ID for getting the data needed to re-hydrate the page.
 */
export const GLOBAL_PAGE_DATA = "__SITE_DATA__";

/**
 * Client and server-side compatible app render function (sets up context).
 */
export function renderApp<P>(
  Component: React.ComponentType<AppProps<P>>,
  props: AppProps<P>,
  context: AppContext
) {
  return (
    <HelmetProvider context={context.helmetContext}>
      <Component {...props} />
    </HelmetProvider>
  );
}
