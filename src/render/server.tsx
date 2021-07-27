import React, { createContext } from "react";
import type { HelmetData } from "react-helmet-async";
import type { DocumentProps } from "../components/document.js";

export interface DocumentContext<P = {}> {
  html: string;
  helmet: Partial<HelmetData>;
  hydrate?: {
    props: P;
    scriptUrl: string | undefined;
  };
}

export const Context = createContext<DocumentContext>({
  html: "",
  helmet: {},
});

/**
 * Renders a `<Document />` component with correct context set and props passed.
 */
export function renderDocument(
  Component: React.ComponentType<DocumentProps>,
  props: DocumentProps,
  context: DocumentContext
) {
  return (
    <Context.Provider value={context}>
      <Component {...props} />
    </Context.Provider>
  );
}
