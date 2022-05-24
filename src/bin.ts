#!/usr/bin/env node

import arg from "arg";
import { createServer } from "node:http";
import { list, build, dev, ListPage } from "./dev.js";

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

  console.log(`App: ${JSON.stringify(app)}`);
  console.log(`Document: ${JSON.stringify(document)}`);
  console.log(`Error: ${JSON.stringify(error)}`);
  console.log(`404: ${JSON.stringify(notFound)}`);
  console.log(`Pages (${Object.keys(pages).length} total):`);

  for (const [route, path] of Object.entries(pages)) {
    console.log(`/${route} - ${JSON.stringify(path)}`);
  }
}

/**
 * Build client and server-side bundles for deploying to a production environment.
 */
async function $build(argv: string[], options: Options) {
  const {
    "--base": base,
    "--client-target": clientTarget,
    "--server-target": serverTarget,
    "--client-outdir": clientOutDir,
    "--server-outdir": serverOutDir,
    "--source-map": sourceMap,
    "--help": help,
  } = arg(
    {
      "--base": String,
      "--server-outdir": String,
      "--client-outdir": String,
      "--server-target": String,
      "--client-target": String,
      "--source-map": Boolean,
      "--help": Boolean,
    },
    { argv }
  );

  if (help) {
    return console.log(`
Build client and server-side bundles for deploying to a production environment.

--base           Base public path when built in production (default: "/")
--client-target  Targetted ES version for the client files (default: "es2016")
--server-target  Targetted ES version for the server files (default: "es2019")
--client-outdir  Output directory for client files relative to root (default: "dist/client")
--server-outdir  Output directory for server files relative to root (default: "dist/server")
--source-map     Generate production source maps (default: false)
`);
  }

  await build({
    base: base,
    sourceMap: sourceMap,
    src: options.src,
    root: options.root,
    publicDir: options.publicDir,
    server: {
      target: serverTarget,
      outDir: serverOutDir,
    },
    client: {
      target: clientTarget,
      outDir: clientOutDir,
    },
  });
}

/**
 * Run a local development server with hot reload support.
 */
async function $dev(argv: string[], options: Options) {
  const {
    "--port": port = 8000,
    "--host": host = "127.0.0.1",
    "--help": help = false,
  } = arg({ "--port": Number, "--host": String, "--help": Boolean }, { argv });

  if (help) {
    return console.log(`
Run a local development server with hot reload support.

--host  Specify the host to run on (default: 127.0.0.1)
--port  Specify the port to run on (default: 8000)
`);
  }

  const handler = await dev({
    root: options.root,
    src: options.src,
    publicDir: options.publicDir,
  });

  const server = createServer(handler);

  server.listen(port, host, () =>
    console.log(`Server running at http://${host}:${port}`)
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
