import React, { Suspense } from "react";
import { SWRConfig } from "swr";
import { AppProps } from "@borderless/site";
import { getCache } from "@borderless/site/cache";

export default function App({ children, cache }: AppProps) {
  return (
    <SWRConfig value={{ provider: () => getCache(cache), suspense: true }}>
      <Suspense>{children}</Suspense>
    </SWRConfig>
  );
}
