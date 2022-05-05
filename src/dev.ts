import { watch } from "chokidar";
import { resolve, relative } from "node:path";
import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { URL } from "node:url";
import { writeFile } from "node:fs/promises";
import {
  createServer as createViteServer,
  build as buildVite,
  PluginOption,
  ViteDevServer,
} from "vite";
import react from "@vitejs/plugin-react";
import {
  createServer as createSiteServer,
  Server,
  AppModule,
  DocumentModule,
  ServerPage,
  ServerFile,
} from "./server.js";
import type { RollupOutput, OutputChunk } from "rollup";
import type { Request } from "./index.js";

/**
 * Support entry point file extensions.
 */
const EXTENSIONS = ["js", "jsx", "ts", "tsx"];

/**
 * Path to import default `App` for client-side rendering.
 */
const SITE_COMPONENT_APP_IMPORT_NAME = "@borderless/site/app";
const SITE_SERVER_IMPORT_NAME = "@borderless/site/server";
const SITE_CLIENT_IMPORT_NAME = "@borderless/site/client";

/**
 * Shared vite config.
 */
const DEFAULT_VITE_CONFIG = {
  configFile: false as const,
  envFile: false as const,
};

/**
 * Static prefix for identifying generated site entry files.
 */
const SITE_PAGE_MODULE_PREFIX = "/@site";

/**
 * Static ID for generating the server-side module.
 */
const SITE_SERVER_MODULE_ID = "/@site-server";

/**
 * Generate the dynamic site entry file name from a path.
 */
function vitePageEntry(root: string, path: string) {
  return `${SITE_PAGE_MODULE_PREFIX}/${relative(root, path)}`;
}

/**
 * Generate a simple page script for hydration.
 */
function buildPageScript(
  appPath: string,
  pagePath: string,
  mode: string
): string {
  return [
    `import ReactDOM from "react-dom/client";`,
    `import { render } from ${JSON.stringify(SITE_CLIENT_IMPORT_NAME)};`,
    `import Component from ${JSON.stringify(pagePath)};`,
    `import App from ${JSON.stringify(appPath)};`,
    `render(App, Component, ${JSON.stringify(mode)});`,
  ].join("\n");
}

/**
 * Generate the server-side script for rendering pages.
 */
function buildServerScript(
  root: string,
  files: List,
  clientResult: RollupOutput
): string {
  const clientPages = new Map(
    clientResult.output
      .filter((x): x is OutputChunk => x.type === "chunk" && x.isEntry)
      .map<[string, string]>((x) => [x.facadeModuleId ?? "", x.fileName])
  );

  const stringifyImport = (path: string) => {
    return `import(${JSON.stringify("/" + relative(root, path))})`;
  };

  const getVitePageUrl = (path: string) => {
    const entry = vitePageEntry(root, path);
    const clientUrl = clientPages.get(entry);
    if (!clientUrl) throw new TypeError(`Unable to load entry: ${entry}`);
    return clientUrl;
  };

  const stringifyModule = (path: string | undefined) => {
    return path ? `{ module: ${stringifyImport(path)} }` : "undefined";
  };

  const stringifyServerPage = (path: string | undefined) => {
    if (!path) return "undefined";
    const url = getVitePageUrl(path);
    return `{ module: ${stringifyImport(path)}, url: ${JSON.stringify(url)} }`;
  };

  const stringifyPages = (pages: Record<string, string>) => {
    const pagesString = Object.entries(pages)
      .map(([route, path]) => {
        return `${JSON.stringify(route)}: ${stringifyServerPage(path)}`;
      })
      .join(", ");

    return `{ ${pagesString} }`;
  };

  return [
    `import { createServer } from ${JSON.stringify(SITE_SERVER_IMPORT_NAME)};`,
    ``,
    `export const server = createServer({`,
    `  pages: ${stringifyPages(files.pages)},`,
    `  error: ${stringifyServerPage(files.error)},`,
    `  notFound: ${stringifyServerPage(files.notFound)},`,
    `  app: ${stringifyModule(files.app)},`,
    `  document: ${stringifyModule(files.document)},`,
    `})`,
  ].join("\n");
}

function buildServerDts() {
  return [
    `import { Server } from ${JSON.stringify(SITE_SERVER_IMPORT_NAME)};`,
    ``,
    `export declare const server: Server<unknown>;`,
  ].join("\n");
}

export interface ClientConfig {
  // Root directory of the project, usually contains the `src` and `dist` directories.
  root: string;
  // Build mode, `production` or `development`.
  mode: "production" | "development";
  // All files used to build the client.
  files: List;
  // The public directory to serve static assets from.
  publicDir: string;
  // Enable source map in output.
  sourceMap: boolean;
}

/**
 * Generate the vite configuration for supporting client side rendering.
 */
function clientViteConfig(options: ClientConfig) {
  const { mode, root, files, publicDir, sourceMap } = options;
  const appPath = files.app ?? SITE_COMPONENT_APP_IMPORT_NAME;
  const pagePaths = Object.values(files.pages);

  if (files.error) pagePaths.push(files.error);
  if (files.notFound) pagePaths.push(files.notFound);

  return {
    ...DEFAULT_VITE_CONFIG,
    root,
    mode,
    publicDir,
    plugins: [
      {
        name: "site-page-entry",
        resolveId(id) {
          // Avoid attempts to load the fake page modules from file system.
          if (id.startsWith(`${SITE_PAGE_MODULE_PREFIX}/`)) {
            return id;
          }
        },
        load(id) {
          if (id.startsWith(`${SITE_PAGE_MODULE_PREFIX}/`)) {
            const pagePath = id.slice(SITE_PAGE_MODULE_PREFIX.length);
            return buildPageScript(appPath, pagePath, mode);
          }
        },
      },
      options.mode === "development" ? react() : undefined,
    ] as PluginOption[],
    build: {
      sourcemap: sourceMap,
      rollupOptions: {
        input: pagePaths.map((x) => vitePageEntry(options.root, x)),
      },
    },
  };
}

export interface ListOptions {
  root: string;
  src: string;
}

export interface List {
  pages: Record<string, string>;
  error?: string;
  notFound?: string;
  app?: string;
  document?: string;
}

function getChokidar(cwd: string, persistent = true) {
  return watch(
    [
      ...EXTENSIONS.map((x) => `pages/**/index.${x}`),
      ...EXTENSIONS.map((x) => `_@(document|app|error|404).${x}`),
    ],
    { cwd, persistent }
  );
}

function filesToList(cwd: string, files: Iterable<string>) {
  const list: List = { pages: {} };

  for (const file of files) {
    const path = resolve(cwd, file);

    if (file.startsWith("pages/")) {
      const route = file.slice(6, file.lastIndexOf("/"));
      list.pages[route] = path;
    } else if (file.startsWith("_document.")) {
      list.document = path;
    } else if (file.startsWith("_app.")) {
      list.app = path;
    } else if (file.startsWith("_error.")) {
      list.error = path;
    } else if (file.startsWith("_404.")) {
      list.notFound = path;
    } else {
      throw new TypeError(`Unhandled file: ${file}`);
    }
  }

  return list;
}

export async function list(options: ListOptions): Promise<List> {
  const cwd = resolve(options.root, options.src);
  const files = new Set<string>();

  return new Promise((resolve, reject) => {
    const watcher = getChokidar(cwd, false);

    watcher.on("add", (path) => files.add(path));
    watcher.on("unlink", (path) => files.delete(path));
    watcher.on("ready", () => resolve(filesToList(cwd, files)));
    watcher.on("error", (error) => reject(error));
  });
}

export interface BuildOptions extends ListOptions {
  base: string;
  sourceMap: boolean;
  publicDir: string;
  out: {
    server: string;
    client: string;
  };
}

/**
 * Build client and server compatible bundles.
 */
export async function build(options: BuildOptions): Promise<undefined> {
  const clientOutDir = resolve(options.root, options.out.client);
  const serverOutDir = resolve(options.root, options.out.server);
  const files = await list(options);

  const viteConfig = clientViteConfig({
    root: options.root,
    files: files,
    mode: "production",
    publicDir: options.publicDir,
    sourceMap: options.sourceMap,
  });

  const clientResult = await buildVite({
    ...viteConfig,
    build: {
      ...viteConfig.build,
      outDir: clientOutDir,
    },
  });

  const result = await buildVite({
    ...DEFAULT_VITE_CONFIG,
    root: options.root,
    base: options.base,
    build: {
      target: "es2020",
      rollupOptions: {
        input: { server: SITE_SERVER_MODULE_ID },
        output: {
          format: "esm"
        },
        plugins: [
          {
            name: "site-server-entry",
            resolveId(id) {
              if (id === SITE_SERVER_MODULE_ID) {
                return id;
              }
            },
            load(id) {
              if (id === SITE_SERVER_MODULE_ID) {
                return buildServerScript(
                  options.root,
                  files,
                  clientResult as RollupOutput
                );
              }
            },
          },
        ],
      },
      outDir: serverOutDir,
      ssr: true,
    },
    optimizeDeps: {
      include: [],
    },
  }) as RollupOutput;

  const serverOutput = result.output.find(
    (x) => x.type === "chunk" && x.facadeModuleId === SITE_SERVER_MODULE_ID
  );

  if (!serverOutput) {
    throw new TypeError(`No server output: ${SITE_SERVER_MODULE_ID}`);
  }

  // Write a `.d.ts` file so TypeScript _just works_.
  await writeFile(
    resolve(serverOutDir, serverOutput.fileName.replace(/\.js$/, ".d.ts")),
    buildServerDts()
  );

  // Ensure the `server.js` file is loaded as ESM.
  await writeFile(resolve(serverOutDir, "package.json"), `{"type":"module"}`);

  return undefined;
}

export interface DevOptions extends ListOptions {
  publicDir: string;
}

/**
 * Create a local dev environment with HMR and React Refresh support.
 */
export async function dev(options: DevOptions): Promise<RequestListener> {
  type Context = Record<string, never>;

  const cwd = resolve(options.root, options.src);
  const files = new Set<string>();
  const watcher = getChokidar(cwd);
  let cachedSite: Server<Context> | undefined = undefined;

  watcher.on("add", (path) => {
    files.add(path);
    if (cachedSite) reloadSite();
  });

  watcher.on("unlink", (path) => {
    files.delete(path);
    if (cachedSite) reloadSite();
  });

  const viteConfig = clientViteConfig({
    root: options.root,
    files: filesToList(cwd, files),
    mode: "development",
    publicDir: options.publicDir,
    sourceMap: true,
  });

  const vite = await createViteServer({
    ...viteConfig,
    server: { middlewareMode: "ssr" },
  });

  const loadServerModule = <P>(path: string): ServerFile<P> => {
    return { module: load(vite, path) };
  };

  const loadServerPage = <P>(path: string): ServerPage<P, Context> => {
    return {
      url: vitePageEntry(options.root, path),
      module: load(vite, path),
    };
  };

  const loadPages = <P>(pages: Record<string, string>) => {
    return Object.fromEntries(
      Object.entries(pages).map<[string, ServerPage<P, Context>]>(
        ([route, path]) => {
          return [route, loadServerPage(path)];
        }
      )
    );
  };

  const reloadSite = () => {
    const list = filesToList(cwd, files);

    cachedSite = createSiteServer({
      pages: loadPages(list.pages),
      error: list.error ? loadServerPage(list.error) : undefined,
      notFound: list.notFound ? loadServerPage(list.notFound) : undefined,
      app: list.app ? loadServerModule<AppModule<{}>>(list.app) : undefined,
      document: list.document ? loadServerModule<DocumentModule>(list.document) : undefined,
    });

    return cachedSite;
  };

  const getSite = () => {
    return cachedSite || reloadSite();
  };

  // Pre-load site before user accesses page.
  getSite();

  // The server gets dynamic site instances and injects the Vite transform into HTML.
  const server = async (req: Request, url: string): Promise<{ status: number; headers: ReadonlyMap<string, string>; text: string }> => {
    const site = getSite();
    const response = await site(req, {});

    return {
      status: response.status,
      headers: response.headers,
      text: response.body ? response.headers.get("content-type") === "text/html" ? await vite.transformIndexHtml(url, response.body.text()) : response.body.text() : "",
    };
  };

  return (req: IncomingMessage, res: ServerResponse) => {
    // Create a next function that acts as our dynamic server-side renderer.
    const next = (err: Error | undefined) => {
      if (err) {
        res.statusCode = 500;
        res.end(err.stack);
        return;
      }

      const originalUrl = req.url ?? "";
      const url = new URL(originalUrl, `http://${req.headers.host}`);
      const request: Request = {
        pathname: url.pathname,
        search: new Map(url.searchParams),
        headers: new Map(Object.entries(req.headers)),
      };

      server(request, originalUrl)
        .then((response) => {
          res.statusCode = response.status;
          for (const [key, value] of response.headers) {
            res.setHeader(key, value);
          }
          res.write(response.text);
          res.end();
        })
        .catch((err) => {
          res.statusCode = 500;
          res.end(`Error: ${err.stack}`);
        });
    };

    return vite.middlewares(req, res, next);
  };
}

/**
 * Use `vite.ssrLoadModule` for hot reloading and import resolution.
 */
function load(vite: ViteDevServer, path: string) {
  return () => vite.ssrLoadModule(path) as Promise<any>;
}
