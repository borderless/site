export interface Headers {
  get(name: string): string | null;
  getAll(name: string): string[];
}

export interface SearchParams {
  get(name: string): string | null;
  getAll(name: string): string[];
}

/**
 * Simple `Request` interface for rendering a page.
 */
export interface Request {
  pathname: string;
  search: SearchParams;
  headers: Headers;
}

export type Params = ReadonlyMap<string, string>;

/**
 * The context send to `getServerSideProps`.
 */
export interface ServerSidePropsContext<C> {
  route: string;
  request: Request;
  params: Params;
  context: C;
}

/**
 * The context used on the error page.
 */
export interface ServerSidePropsErrorContext<C>
  extends ServerSidePropsContext<C> {
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
