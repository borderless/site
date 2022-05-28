import type { ServerSideContext } from "@borderless/site/render";

export default function NotFound() {
  return <>An example of a custom 404 page.</>;
}

export function getServerSideProps({ request }: ServerSideContext<{}>) {
  console.log(`Page not found: ${request.pathname}`);
}
