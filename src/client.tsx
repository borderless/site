/// <reference lib="dom" />

import React from "react";
import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { PageData, PageDataContext } from "./shared.js";

/**
 * Client-side render function.
 */
export function hydrate(element: JSX.Element) {
  const pageData = (window as any).__DATA__ as PageData;
  const app = (
    <HelmetProvider>
      <PageDataContext.Provider value={pageData}>
        {element}
      </PageDataContext.Provider>
    </HelmetProvider>
  );
  const pageEl = document.getElementById("1")!;
  return ReactDOM.hydrateRoot(pageEl, app);
}
