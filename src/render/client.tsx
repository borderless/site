/// <reference lib="dom" />

import React from "react";
import { HelmetProvider } from "react-helmet-async";
import type { AppProps } from "../components/app.js";

export interface AppContext {
  helmetContext: { helmet: {} };
}

/**
 * Deterministic element ID for hydrating the page.
 */
export const PAGE_ELEMENT_ID = "__SITE__";

/**
 * Deterministic element ID for getting the data needed to re-hydrate the page.
 */
export const PAGE_PROPS_ID = "__SITE_DATA__";

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

/**
 * Client-side render function.
 */
export function renderClient<P>(
  App: React.ComponentType<AppProps<P>>,
  Component: React.ComponentType<P>,
  render: (app: JSX.Element, container: HTMLElement) => void
) {
  const context = { helmetContext: { helmet: {} } };
  const pageEl = document.getElementById(PAGE_ELEMENT_ID)!;
  const propsEl = document.getElementById(PAGE_PROPS_ID);
  const props = JSON.parse((propsEl && propsEl.textContent) || "{}");
  const app = renderApp(App, { Component, props }, context);
  return render(app, pageEl);
}
