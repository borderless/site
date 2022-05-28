import { createContext } from "react";

/**
 * Throw a not implemented exception.
 */
export const typeError = (message: string) => () => {
  throw new TypeError(message);
};

/**
 * Data required for rendering a page.
 */
export interface PageData {
  props: object;
  formData: object | undefined;
}

/**
 * Allow access to server-side props on the client and server.
 */
export const PageDataContext = createContext<PageData>({
  props: {},
  formData: undefined,
});
