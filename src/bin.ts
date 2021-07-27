#!/usr/bin/env node

import arg from "arg";
import { createServer } from "node:http";
import { list, build, dev } from "./dev.js";

interface Options {
  root: string;
  src: string;
  publicDir: string;
}

/**
 * Print out the help documentation.
 */
function $help() {
  process.stdout.write(`
Commands:

dev    Run a local development server with HMR
build  Generate client and server-side compatible bundles
list   List the pages in your SSR app

Options:

--root        Project root directory (default: \`cwd\`)
--src         Directory to read source files (default: src)
--public-dir  Directory to serve as plain static assets (default: public)
`);
}

async function $list(argv: string[], options: Options) {
  const { "--help": help = false } = arg({ "--help": Boolean }, { argv });
  const { pages, document, app, error, notFound } = await list(options);

  if (help) {
    return console.log(`
Lists the files used to build the project. The pages are all in root and follow the patterns of "_app", "_404", "_document", "_error", or "pages/**/index". Acceptable extensions are ".ts", ".tsx", ".js", and ".jsx".
`);
  }

  console.log(`App: ${app}`);
  console.log(`Document: ${document}`);
  console.log(`Error: ${error}`);
  console.log(`404: ${notFound}`);
  console.log(`Pages (${Object.keys(pages).length} total):`);

  for (const [route, path] of Object.entries(pages)) {
    console.log(`/${route} - ${path}`);
  }
}

/**
 * Build client and server-side bundles for deploying to a production environment.
 */
async function $build(argv: string[], options: Options) {
  const {
    "--base": base = "/",
    "--out-client": outClient = "dist/client",
    "--out-server": outServer = "dist/server",
    "--source-map": sourceMap = false,
    "--help": help = false,
  } = arg(
    {
      "--base": String,
      "--out-server": String,
      "--out-client": String,
      "--source-map": Boolean,
      "--help": Boolean,
    },
    { argv }
  );

  if (help) {
    return console.log(`
Build client and server-side bundles for deploying to a production environment.

--base        Base public path when built in production (default: "/")
--out-client  Output directory for client files relative to root (default: "dist/client")
--out-client  Output directory for server files relative to root (default: "dist/server")
--source-map  Generate production source maps (default: false)
`);
  }

  await build({
    base: base,
    sourceMap: sourceMap,
    src: options.src,
    root: options.root,
    publicDir: options.publicDir,
    out: { server: outServer, client: outClient },
  });
}

/**
 * Run a local development server with hot reload support.
 */
async function $dev(argv: string[], options: Options) {
  const { "--port": port = 8000, "--help": help = false } = arg(
    { "--port": Number, "--help": Boolean },
    { argv }
  );

  if (help) {
    return console.log(`
Run a local development server with hot reload support.

--port  Specify the port to run on (default: 8000)
`);
  }

  const handler = await dev({
    root: options.root,
    src: options.src,
    publicDir: options.publicDir,
  });

  const server = createServer(handler);

  server.listen(port, () =>
    console.log(`Server running at http://localhost:${port}`)
  );

  return new Promise<void>((resolve, reject) => {
    server.once("error", (err) => reject(err));
    server.once("close", () => resolve());
  });
}

/**
 * Main CLI command.
 */
async function main(argv: string[]) {
  const {
    "--root": root = process.cwd(),
    "--src": src = "src",
    "--public-dir": publicDir = "public",
    "--help": help = false,
    _: [command, ...remainingArgv],
  } = arg(
    {
      "--root": String,
      "--src": String,
      "--public-dir": String,
      "--help": Boolean,
    },
    {
      argv,
      stopAtPositional: true,
    }
  );

  if (!command || help) return $help();

  const options: Options = { root, src, publicDir };

  switch (command) {
    case "list":
      return $list(remainingArgv, options);
    case "build":
      return $build(remainingArgv, options);
    case "dev":
      return $dev(remainingArgv, options);
    default:
      throw new TypeError(`Unknown command: ${command}`);
  }
}

// Run `main` and exit when the function finishes, printing any errors.
main(process.argv.slice(2)).then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
