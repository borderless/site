/// <reference lib="dom" />

import React from "react";
import ReactDOM from "react-dom/client";
import { renderApp, PAGE_ELEMENT_ID, GLOBAL_PAGE_DATA } from "./shared.js";
import type { AppProps } from "./app.js";

/**
 * Client-side render function.
 */
export function render<P>(
  App: React.ComponentType<AppProps<P>>,
  Component: React.ComponentType<P>
) {
  const context = { helmetContext: { helmet: {} } };
  const pageEl = document.getElementById(PAGE_ELEMENT_ID)!;
  const { props } = (window as any)[GLOBAL_PAGE_DATA];
  const app = renderApp(App, { Component, props }, context);
  ReactDOM.hydrateRoot(pageEl, app);
}
