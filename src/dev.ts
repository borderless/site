import Youch from "youch";
import { watch } from "chokidar";
import { resolve, relative } from "node:path";
import { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import { writeFile, readdir, stat, copyFile } from "node:fs/promises";
import {
  createServer as createViteServer,
  build as buildVite,
  ViteDevServer,
  ChunkMetadata,
  Plugin,
  normalizePath,
} from "vite";
import react from "@vitejs/plugin-react";
import type {
  AppModule,
  DocumentModule,
  ServerPage,
  ServerFile,
} from "./server.js";
import type { RollupOutput, OutputChunk } from "rollup";
import { createHandler, Handler } from "./adapters/node.js";

const DEFAULT_PUBLIC_DIR = "public";
const DEFAULT_CLIENT_TARGET = "modules";
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
  json: {
    namedExports: false,
    stringify: true,
  },
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
 * Vite.js development script needed in the `<head>` element.
 */
const DEV_MODE_HEAD = `<script type="module" src="/@vite/client"></script>
<script type="module">
import RefreshRuntime from "/@react-refresh"
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>`;

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

  const stringifyServerPage = (page: ListPage | undefined) => {
    if (!page) return "undefined";
    const { path = "", serverPath } = page;
    const { viteMetadata, fileName } = getVitePageOutput(path);
    const url = base + fileName;
    const css = Array.from(viteMetadata.importedCss).map((x) => base + x);

    return [
      `{`,
      `  module: ${stringifyImport(path)},`,
      serverPath
        ? `  serverModule: ${stringifyImport(serverPath)},`
        : undefined,
      `  scripts: [${JSON.stringify(url)}]`,
      `  css: ${JSON.stringify(css)},`,
      `}`,
    ].join("\n");
  };

  const stringifyPages = (pages: Record<string, ListPage>) => {
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

export interface ListPage {
  path?: string;
  serverPath?: string;
}

export interface List {
  pages: Record<string, ListPage>;
  notFound?: ListPage;
  app?: string;
  document?: string;
}

function getChokidar(cwd: string, persistent = true) {
  return watch(
    [
      ...EXTENSIONS.map((x) => `pages/**/index?(.server).${x}`),
      ...EXTENSIONS.map((x) => `_@(error|404)?(.server).${x}`),
      ...EXTENSIONS.map((x) => `_@(document|app).${x}`),
    ],
    { cwd, persistent }
  );
}

function filesToList(cwd: string, files: Iterable<string>) {
  const list: List = { pages: {} };

  // Add server vs client variants of the page.
  const addPage = (existingPage: ListPage = {}, file: string) => {
    if (file.indexOf(".server.") > -1) {
      existingPage.serverPath = file;
    } else {
      existingPage.path = file;
    }
    return existingPage;
  };

  for (const file of files) {
    const path = resolve(cwd, file);

    if (file.startsWith("pages/")) {
      const route = file.slice(6, file.lastIndexOf("/"));
      list.pages[route] = addPage(list.pages[route], path);
    } else if (file.startsWith("_404.")) {
      list.notFound = addPage(list.notFound, path);
    } else if (file.startsWith("_document.")) {
      list.document = path;
    } else if (file.startsWith("_app.")) {
      list.app = path;
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
        input: pagePaths.map((x) => vitePageEntry(options.root, x.path ?? "")),
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
export type DevServerContext = unknown;

/**
 * Create a local dev environment with HMR and React Refresh support.
 */
export async function dev(options: DevOptions): Promise<RequestListener> {
  const cwd = resolve(options.root, options.src);
  const files = new Set<string>();
  const watcher = getChokidar(cwd);
  let cache: { handler: Handler; list: List } | null = null;

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
      target: options.target ?? DEFAULT_CLIENT_TARGET,
      sourcemap: true,
    },
    server: { middlewareMode: "ssr" },
  });

  const loadServerModule = <T>(path: string): ServerFile<T> => {
    return { module: load(vite, path) } as ServerFile<T>;
  };

  const loadServerPage = (page: ListPage): ServerPage<DevServerContext> => {
    const { path = "", serverPath = "" } = page;
    return {
      url: vitePageEntry(options.root, path),
      module: load(vite, path),
      serverModule: serverPath ? load(vite, serverPath) : undefined,
    } as ServerPage<DevServerContext>;
  };

  const loadPages = (pages: Record<string, ListPage>) => {
    return Object.fromEntries(
      Object.entries(pages).map<[string, ServerPage<DevServerContext>]>(
        ([route, path]) => {
          return [route, loadServerPage(path)];
        }
      )
    );
  };

  // Must use the same loader for all dependencies to ensure shared modules.
  const siteServer = (await vite.ssrLoadModule(
    SITE_SERVER_IMPORT_NAME
  )) as typeof import("./server.js");

  const reloadCache = () => {
    const list = filesToList(cwd, files);
    const handler = createHandler(
      siteServer.createServer({
        pages: loadPages(list.pages),
        notFound: list.notFound ? loadServerPage(list.notFound) : undefined,
        app: list.app ? loadServerModule<AppModule>(list.app) : undefined,
        document: list.document
          ? loadServerModule<DocumentModule>(list.document)
          : undefined,
      }),
      (): DevServerContext => ({}),
      {
        head: DEV_MODE_HEAD,
      }
    );
    cache = { handler, list };
    return cache;
  };

  // Pre-load site before user accesses page.
  reloadCache();

  return (req: IncomingMessage, res: ServerResponse) => {
    // Render prettier errors.
    const renderError = (err: Error) => {
      vite.ssrFixStacktrace(err);

      const youch = new Youch(err, req);
      youch.toHTML().then(
        (html) => {
          res.writeHead(500, { "content-type": "text/html" });
          res.end(html);
        },
        (err) => {
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(String(err));
        }
      );
    };

    // Create a next function that acts as our dynamic server-side renderer.
    const next = (err: Error | undefined) => {
      if (err) return renderError(err);

      const { handler } = cache ?? reloadCache();
      return handler(req, res, renderError);
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
