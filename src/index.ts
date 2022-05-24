import { useContext } from "react";
import { PageDataContext, DataLoaderContext, PageData } from "./shared.js";

/**
 * Headers sent to the server for the request.
 */
export interface Headers {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}

/**
 * Parameters sent using the query string to the server.
 */
export interface SearchParams {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}

/**
 * Parameters sent using form encoding to the server.
 */
export interface FormParams {
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
}

export enum RequestType {
  UNKNOWN,
  FORM,
}

/**
 * Standard base request.
 */
export interface BaseRequest {
  method: string;
  type: RequestType;
  pathname: string;
  search: SearchParams;
  headers: Headers;
}

/**
 * HTTP request for simply rendering the content (GET).
 */
export interface DefaultRequest extends BaseRequest {
  type: RequestType.UNKNOWN;
}

/**
 * HTTP request for form processing (POST and `application/x-www-form-urlencoded`).
 */
export interface FormRequest extends BaseRequest {
  type: RequestType.FORM;
  form: () => Promise<FormParams>;
}

/**
 * Simple `Request` interface for rendering a page.
 */
export type Request = DefaultRequest | FormRequest;

/**
 * Parameters provided from matching path segments, e.g. `/[param]`.
 */
export type Params = ReadonlyMap<string, string>;

/**
 * The request context used for server side functions.
 */
export interface ServerSideContext<C> {
  key: string;
  request: Request;
  params: Params;
  context: C;
  error?: unknown;
  formData?: unknown;
}

export interface ServerSideErrorContext<C> extends ServerSideContext<C> {
  error: unknown;
}

/**
 * Valid return type of `getServerSideProps`.
 */
export interface ServerSideProps<P> {
  props: P;
  status?: number;
  redirect?: { url: string };
}

/**
 * Function signature for `getServerSideProps`.
 */
export type GetServerSideProps<P, C> = (
  context: ServerSideContext<C>
) => ServerSideProps<P> | undefined | null;

/**
 * Access to the server-side props.
 */
export function useServerSideProps<T extends object>(): T {
  return (useContext(PageDataContext) as PageData).props as T;
}

/**
 * Access to the result of form submission.
 */
export function useFormData<T>(): T | undefined {
  return (useContext(PageDataContext) as PageData).formData as T;
}

/**
 * Access the data loader method, for use with something like `swr`.
 */
export function useLoader() {
  return useContext(DataLoaderContext);
}
