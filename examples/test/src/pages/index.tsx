import React from "react";
import Head from "@borderless/site/head";
import Timer from "./timer";

export default function IndexPage() {
  return (
    <div>
      <Head>
        <title>Example page title</title>
      </Head>
      <div>Index page with hydration example:</div>
      <Timer />
    </div>
  );
}
