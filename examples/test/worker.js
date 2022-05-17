import { server } from "./dist/server/server.js";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  const res = await server(
    {
      pathname: url.pathname,
      search: url.searchParams,
      headers: request.headers,
    },
    undefined
  );

  return new Response(res.body ? await res.body.readableStream() : null, {
    status: res.status,
    headers: Array.from(res.headers.entries()),
  });
}
