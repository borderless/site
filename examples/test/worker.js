import { server } from "./dist/server/server.js";
import { createHandler } from "@borderless/site/adapters/worker";

const handler = createHandler(server, () => undefined);

addEventListener("fetch", (event) => {
  event.respondWith(handler(event.request));
});
