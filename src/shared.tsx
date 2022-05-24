import { createContext } from "react";

/**
 * Throw a not implemented exception.
 */
export const typeError = (message: string) => () => {
  throw new TypeError(message);
};

/**
 * Data loader context value.
 */
export type DataLoaderValue = (...args: unknown[]) => Promise<unknown>;

/**
 * The loader for requesting data from the server.
 */
export const DataLoaderContext = createContext<DataLoaderValue>(
  typeError("Data loader not implemented")
);

/**
 * Data required for rendering a page.
 */
export interface PageData {
  props: object;
  formData?: object;
}

/**
 * Allow access to server-side props on the client and server.
 */
export const PageDataContext = createContext<PageData>({ props: {} });
