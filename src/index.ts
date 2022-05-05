/**
 * Simple `Request` interface for rendering a page.
 */
 export interface Request {
    pathname: string;
    search: ReadonlyMap<string, string>;
    headers: ReadonlyMap<string, string | string[] | undefined>;
  }

/**
 * The context send to `getServerSideProps`.
 */
 export interface ServerSidePropsContext<C> {
    route: string;
    request: Request;
    params: ReadonlyMap<string, string>;
    context: C;
  }

  /**
   * The context used on the error page.
   */
  export interface ServerSidePropsErrorContext<C> {
    request: Request;
    params: ReadonlyMap<string, string>;
    context: C;
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