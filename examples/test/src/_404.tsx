import React from "react";
import type { ServerSidePropsContext } from "@borderless/site";

export default function NotFound() {
  return <>An example of a custom 404 page.</>;
}

export function getServerSideProps({ request }: ServerSidePropsContext<{}>) {
  console.log(`Page not found: ${request.pathname}`);
}
