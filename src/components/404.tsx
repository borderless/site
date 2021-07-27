import React from "react";
import Head from "../head.js";

export interface NotFoundProps {}

export default function NotFound(props: NotFoundProps) {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        padding: "1em",
      }}
    >
      <Head
        style={[
          {
            type: "text/css",
            cssText: `html,body,#__SITE__{height:100%;margin:0}`,
          },
        ]}
      >
        <title>Page not found</title>
      </Head>
      <main
        style={{
          display: "flex",
          fontFamily: "system-ui, sans-serif",
          maxWidth: "100%",
        }}
      >
        <p
          style={{
            fontSize: "3em",
            lineHeight: 1,
            fontWeight: "bold",
            color: "rgb(79,70,229)",
            margin: 0,
          }}
        >
          404
        </p>
        <div
          style={{
            marginLeft: "1.5em",
            borderLeft: "1px solid rgb(229,231,235)",
            paddingLeft: "1.5em",
          }}
        >
          <h1
            style={{
              fontSize: "3em",
              lineHeight: 1,
              margin: 0,
              fontWeight: "bold",
              color: "rgb(17,24,39)",
            }}
          >
            Page not found
          </h1>
          <p
            style={{
              margin: "0.25em 0 0 0",
              lineHeight: 1.5,
              fontSize: "1em",
              color: "rgb(107,114,128)",
            }}
          >
            Please check the URL in the address bar and try again.
          </p>
        </div>
      </main>
    </div>
  );
}
