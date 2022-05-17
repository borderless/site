import { watch } from "chokidar";
import { resolve, relative } from "node:path";
import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { URL } from "node:url";
import { writeFile, readdir, stat, copyFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import {
  createServer as createViteServer,
  build as buildVite,
  ViteDevServer,
  ChunkMetadata,
  Plugin,
  normalizePath,
} from "vite";
import react from "@vitejs/plugin-react";
import {
  createServer as createSiteServer,
  Server,
  AppModule,
  DocumentModule,
  ServerPage,
  ServerFile,
  NodeStream,
} from "./server.js";
import type { RollupOutput, OutputChunk } from "rollup";
import { fromNodeRequest } from "./node.js";

const DEFAULT_PUBLIC_DIR = "public";
const DEFAULT_CLIENT_TARGET = "es2016";
const DEFAULT_SERVER_TARGET = "es2019";

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
  base: string,
  files: List,
  clientResult: RollupOutput
): string {
  const clientPages = new Map(
    clientResult.output
      .filter((x): x is OutputChunk => x.type === "chunk" && x.isEntry)
      .map<[string, OutputChunk]>((x) => [x.facadeModuleId ?? "", x])
  );

  const stringifyImport = (path: string) => {
    return `import(${JSON.stringify("/" + relative(root, path))})`;
  };

  const getVitePageOutput = (path: string) => {
    const entry = vitePageEntry(root, path);
    const chunk = clientPages.get(entry);
    if (!chunk) throw new TypeError(`Unable to load entry: ${entry}`);
    return chunk as OutputChunk & { viteMetadata: ChunkMetadata };
  };

  const stringifyModule = (path: string | undefined) => {
    return path ? `{ module: ${stringifyImport(path)} }` : "undefined";
  };

  const stringifyServerPage = (path: string | undefined) => {
    if (!path) return "undefined";
    const { viteMetadata, fileName } = getVitePageOutput(path);
    const url = base + fileName;
    const css = Array.from(viteMetadata.importedCss).map((x) => base + x);
    return `{ module: ${stringifyImport(path)}, url: ${JSON.stringify(
      url
    )}, css: ${JSON.stringify(css)} }`;
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
  // Supported client target versions, e.g. es2016.
  target: string;
  // Build mode, `production` or `development`.
  mode: "production" | "development";
  // All files used to build the client.
  files: List;
  // The public directory to serve static assets from.
  publicDir: string | undefined;
  // Enable source map in output.
  sourceMap: boolean | undefined;
}

function sitePagePlugin(
  mode: string,
  getAppPath: () => string | undefined
): Plugin {
  return {
    name: "site-page-entry",
    resolveId(id) {
      // Avoid attempts to load the fake page modules from file system.
      if (id.startsWith(`${SITE_PAGE_MODULE_PREFIX}/`)) {
        return id;
      }
    },
    load(id) {
      if (id.startsWith(`${SITE_PAGE_MODULE_PREFIX}/`)) {
        const appPath = getAppPath() ?? SITE_COMPONENT_APP_IMPORT_NAME;
        const pagePath = id.slice(SITE_PAGE_MODULE_PREFIX.length);
        return buildPageScript(appPath, pagePath, mode);
      }
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
  base?: string;
  sourceMap?: boolean;
  publicDir?: string;
  client?: {
    target?: string;
    outDir?: string;
  };
  server?: {
    target?: string;
    outDir?: string;
  };
}

/**
 * Build client and server compatible bundles.
 */
export async function build(options: BuildOptions): Promise<undefined> {
  const { client = {}, server = {}, base = "/", root } = options;
  const publicDir = resolve(
    options.root,
    options.publicDir ?? DEFAULT_PUBLIC_DIR
  );
  const clientOutDir = resolve(options.root, client.outDir ?? "dist/client");
  const serverOutDir = resolve(options.root, server.outDir ?? "dist/server");
  const files = await list(options);
  const pagePaths = Object.values(files.pages);
  const publicAssets: string[] = [];

  if (files.error) pagePaths.push(files.error);
  if (files.notFound) pagePaths.push(files.notFound);

  const clientResult = (await buildVite({
    ...DEFAULT_VITE_CONFIG,
    root,
    base,
    mode: "production",
    publicDir: false,
    plugins: [sitePagePlugin("production", () => files.app)],
    build: {
      target: client.target ?? DEFAULT_CLIENT_TARGET,
      sourcemap: options.sourceMap,
      rollupOptions: {
        input: pagePaths.map((x) => vitePageEntry(options.root, x)),
      },
      outDir: clientOutDir,
    },
  })) as RollupOutput;

  const [serverResult] = await Promise.all([
    (await buildVite({
      ...DEFAULT_VITE_CONFIG,
      root,
      base,
      mode: "production",
      publicDir: false,
      build: {
        target: server.target ?? DEFAULT_SERVER_TARGET,
        rollupOptions: {
          input: { server: SITE_SERVER_MODULE_ID },
          output: {
            format: "esm",
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
                  return buildServerScript(root, base, files, clientResult);
                }
              },
            },
          ],
        },
        outDir: serverOutDir,
        ssr: true,
      },
    })) as RollupOutput,
    // Copy all files from the public directory and track them for output into server bundle.
    copyDir(
      publicDir,
      clientOutDir,
      (fileName) =>
        !!publicAssets.push(normalizePath(relative(publicDir, fileName)))
    ),
  ]);

  const serverOutput = serverResult.output.find(
    (x) => x.type === "chunk" && x.facadeModuleId === SITE_SERVER_MODULE_ID
  );

  if (!serverOutput) {
    throw new TypeError(`No server output: ${SITE_SERVER_MODULE_ID}`);
  }

  await Promise.all([
    // Write a `.d.ts` file so TypeScript _just works_.
    writeFile(
      resolve(serverOutDir, serverOutput.fileName.replace(/\.js$/, ".d.ts")),
      buildServerDts()
    ),
    // Ensure the `server.js` file is loaded as ESM.
    writeFile(resolve(serverOutDir, "package.json"), `{"type":"module"}`),
    // Write list of static assets copied to public directory.
    writeFile(
      resolve(serverOutDir, "public.json"),
      JSON.stringify(publicAssets)
    ),
  ]);

  return undefined;
}

export interface DevOptions extends ListOptions {
  target?: string;
  publicDir?: string;
}

/**
 * Context for the dev server requests.
 */
type DevServerContext = Record<string, never>;

/**
 * Create a local dev environment with HMR and React Refresh support.
 */
export async function dev(options: DevOptions): Promise<RequestListener> {
  const cwd = resolve(options.root, options.src);
  const files = new Set<string>();
  const watcher = getChokidar(cwd);
  let cache: { site: Server<DevServerContext>; list: List } | null = null;

  watcher.on("add", (path) => {
    files.add(path);
    cache = null;
  });

  watcher.on("unlink", (path) => {
    files.delete(path);
    cache = null;
  });

  const vite = await createViteServer({
    ...DEFAULT_VITE_CONFIG,
    root: options.root,
    mode: "development",
    publicDir: resolve(options.root, options.publicDir ?? DEFAULT_PUBLIC_DIR),
    plugins: [sitePagePlugin("development", () => cache?.list.app), react()],
    build: {
      target: options.target,
      sourcemap: true,
    },
    server: { middlewareMode: "ssr" },
  });

  const loadServerModule = <P>(path: string): ServerFile<P> => {
    return { module: load(vite, path) } as ServerFile<P>;
  };

  const loadServerPage = <P>(path: string): ServerPage<P, DevServerContext> => {
    return {
      url: vitePageEntry(options.root, path),
      module: load(vite, path),
    } as ServerPage<P, DevServerContext>;
  };

  const loadPages = <P>(pages: Record<string, string>) => {
    return Object.fromEntries(
      Object.entries(pages).map<[string, ServerPage<P, DevServerContext>]>(
        ([route, path]) => {
          return [route, loadServerPage(path)];
        }
      )
    );
  };

  const reloadCache = () => {
    const list = filesToList(cwd, files);
    const site = createSiteServer({
      pages: loadPages(list.pages),
      error: list.error ? loadServerPage(list.error) : undefined,
      notFound: list.notFound ? loadServerPage(list.notFound) : undefined,
      app: list.app ? loadServerModule<AppModule<object>>(list.app) : undefined,
      document: list.document
        ? loadServerModule<DocumentModule>(list.document)
        : undefined,
    });
    cache = { site, list };
    return cache;
  };

  // Pre-load site before user accesses page.
  reloadCache();

  // The server gets dynamic site instances and injects the Vite transform into HTML.
  const server = async (
    req: IncomingMessage
  ): Promise<{
    status: number;
    headers: ReadonlyMap<string, string>;
    data: NodeStream | null;
  }> => {
    const { site } = cache ?? reloadCache();
    const response = await site(fromNodeRequest(req), {});

    if (
      !response.body ||
      response.headers.get("content-type") !== "text/html"
    ) {
      return {
        status: response.status,
        headers: response.headers,
        data: response.body ? await response.body.nodeStream() : null,
      };
    }

    // Fake a valid HTML file for vite to inject whatever it needs around the stream.
    const proxy = new PassThrough();
    const buffer = new PassThrough();
    const outlet = `<!-- @@SSR_OUTLET@@ -->`;
    const { prefix, suffix, stream } = await response.body.rawNodeStream();
    const url = req.url ?? "";
    const html = await vite.transformIndexHtml(url, prefix + outlet + suffix);
    const [htmlPrefix, htmlSuffix] = html.split(outlet);
    proxy.write(htmlPrefix);
    stream.pipe(buffer).pipe(proxy, { end: false });
    buffer.on("end", () => {
      proxy.write(htmlSuffix);
      proxy.end();
    });

    return {
      status: response.status,
      headers: response.headers,
      data: proxy,
    };
  };

  return (req: IncomingMessage, res: ServerResponse) => {
    // Create a next function that acts as our dynamic server-side renderer.
    const next = (err: Error | undefined) => {
      if (err) {
        res.statusCode = 500;
        res.end(vite.ssrRewriteStacktrace(err.stack ?? ""));
        return;
      }

      server(req)
        .then((response) => {
          res.statusCode = response.status;
          for (const [key, value] of response.headers) {
            res.setHeader(key, value);
          }
          if (response.data) {
            response.data.pipe(res);
          } else {
            res.end();
          }
        })
        .catch((err) => {
          res.statusCode = 500;
          res.end(`Error: ${vite.ssrRewriteStacktrace(err.stack)}`);
        });
    };

    return vite.middlewares(req, res, next);
  };
}

/**
 * Use `vite.ssrLoadModule` for hot reloading and import resolution.
 */
function load(vite: ViteDevServer, path: string) {
  return () => vite.ssrLoadModule(path) as Promise<unknown>;
}

/**
 * Copy directory from one location to another.
 */
async function copyDir(
  from: string,
  to: string,
  onFile: (file: string) => boolean
) {
  for (const file of await readdir(from)) {
    const srcFile = resolve(from, file);
    const destFile = resolve(to, file);
    const stats = await stat(srcFile);
    if (stats.isDirectory()) {
      await copyDir(srcFile, destFile, onFile);
    } else {
      const shouldCopy = onFile(srcFile);
      if (shouldCopy) await copyFile(srcFile, destFile);
    }
  }
}
