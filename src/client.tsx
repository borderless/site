/// <reference lib="dom" />

import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { PageData, PageDataContext, DataLoaderContext } from "./shared.js";
import type { AppProps } from "./app.js";

/**
 * Client-side render function.
 */
export function render(
  App: React.ComponentType<AppProps>,
  Component: React.ComponentType<{}>
) {
  const pageData = (window as any).__DATA__ as PageData;
  const app = (
    <HelmetProvider>
      <PageDataContext.Provider value={pageData}>
        <DataLoaderContext.Provider value={loader}>
          <App>
            <Component />
          </App>
        </DataLoaderContext.Provider>
      </PageDataContext.Provider>
    </HelmetProvider>
  );
  const pageEl = document.getElementById("1")!;
  return ReactDOM.hydrateRoot(pageEl, app);
}

/**
 * Client-side loader implementation.
 */
function loader(...args: unknown[]): Promise<unknown> {
  const query = args.reduce(
    (query, data) =>
      `${query}&data=${encodeURIComponent(JSON.stringify(data))}`,
    "__site__=1"
  );

  return fetch(`${window.location.pathname}?${query}`).then((res) => {
    if (!res.ok) {
      throw new Error(`Invalid response status: ${res.status}`);
    }

    return res.json();
  });
}
