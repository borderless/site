# Site

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][build-image]][build-url]
[![Build coverage][coverage-image]][coverage-url]

> Server side rendering for react.js applications.

## Installation

```sh
npm install @borderless/site --save-dev
```

## Features

- Server-side rendering with `getServerSideProps`
- Client-side hydration for interactivity
- Custom `<Head />` rendering with `@borderless/site/head`
- Hot reloading and react refresh during development
- Super fast server with [Vite](https://vitejs.dev)
- ES Modules supported

## Usage

Options:

- `--root` Project root directory (default: `process.cwd()`)
- `--src` Directory to read source files (default: `src`)
- `--public-dir` Directory to serve as plain static assets (default: `public`)

Commands:

- `dev` Run a local development server with HMR
- `build` Generate client and server-side compatible bundles
- `list` List the pages in your SSR app

### Dev

Run a local development server with hot reload support

Options:

- `--host` Specify the host to run on (default: `127.0.0.1`)
- `--port` Specify the port to run on (default: `8000`)

### Build

Build client and server-side bundles for deploying to a production environment.

Options:

- `--base` Base public path when built in production (default: `/`)
- `--client-outdir` Output directory for client files relative to root (default: `dist/client`)
- `--server-outdir` Output directory for server files relative to root (default: `dist/server`)
- `--source-map` Generate production source maps (default: `false`)

### List

Lists the files used to build the project. The pages are all in root and follow the patterns of `_app`, `_404`, `_document`, `_error`, or `pages/**/index`. Acceptable extensions are `.ts`, `.tsx`, `.js`, and `.jsx`.

## Development

Useful scripts are in `package.json` under scripts. You can build, test, and format the project. Additionally you can run examples locally using `ts-node`:

```
npm run example:test -- dev
```

Test pages:

- [Homepage with hydration](http://127.0.0.1:8000)
- [404 page](http://127.0.0.1:8000/404)
- [URL decoding and `<script />` encoding](<http://127.0.0.1:8000/echo/%3C%2Fscript%3E%3Cscript%3Ealert('test')%3C%2Fscript%3E>)

## Inspiration

- [Next.js](https://nextjs.org)
- [Flareact](https://flareact.com)
- [Vite SSR example](https://github.com/vitejs/vite/tree/98d95e3e11bbc43e410b213b682e315b9344d2d7/packages/playground/ssr-react)
- [Microsite](https://github.com/natemoo-re/microsite)

## TypeScript

This project is written using [TypeScript](https://github.com/Microsoft/TypeScript) and publishes the definitions directly to NPM.

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@borderless/site
[npm-url]: https://npmjs.org/package/@borderless/site
[downloads-image]: https://img.shields.io/npm/dm/@borderless/site
[downloads-url]: https://npmjs.org/package/@borderless/site
[build-image]: https://img.shields.io/github/workflow/status/borderless/site/CI/main
[build-url]: https://github.com/borderless/site/actions/workflows/ci.yml?query=branch%3Amain
[coverage-image]: https://img.shields.io/codecov/c/gh/borderless/site
[coverage-url]: https://codecov.io/gh/borderless/site
