import React from "react";

export interface AppProps<P> {
  Component: React.ComponentType<P>;
  props: P;
}

export default function App({ Component, props }: AppProps<{}>) {
  return <Component {...props} />;
}
