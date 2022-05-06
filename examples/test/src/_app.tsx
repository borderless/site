import React from "react";
import { AppProps } from "@borderless/site";

export default function App({ Component, props }: AppProps) {
  return (
    <div style={{ backgroundColor: "yellow" }}>
      <Component {...props} />
    </div>
  );
}
