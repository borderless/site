import React from "react";
import Head from "./head.js";
import type { ServerSidePropsErrorContext, ServerSideProps } from "./index.js";

export interface ErrorProps {
  status: number;
  stack?: string;
}

export default function Error({ status, stack }: ErrorProps) {
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
        <title>Application error</title>
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
          {String(status)}
        </p>
        <div
          style={{
            marginLeft: "1.5em",
            borderLeft: "1px solid rgb(229,231,235)",
            paddingLeft: "1.5em",
            maxWidth: "100%",
            overflow: "hidden",
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
            Application error
          </h1>
          <p
            style={{
              margin: "0.25em 0 0 0",
              lineHeight: 1.5,
              fontSize: "1em",
              color: "rgb(107,114,128)",
            }}
          >
            An error has happened while accessing this page.
          </p>
          {stack && (
            <pre
              style={{
                margin: "1em 0 0 0",
                fontFamily: "monospace",
                lineHeight: 1.2,
                fontSize: "1em",
                color: "rgb(17,24,39)",
                overflow: "auto",
              }}
            >
              <code>{stack}</code>
            </pre>
          )}
        </div>
      </main>
    </div>
  );
}

export function getServerSideProps({
  error,
}: ServerSidePropsErrorContext<{}>): ServerSideProps<ErrorProps> {
  const status = getStatus(error);
  const stack = getStack(error);

  return {
    status,
    props: {
      status,
      stack,
    },
  };
}

function getStatus(error: unknown): number {
  if (typeof error === "object" && error != null) {
    const status =
      (error as Record<string, unknown>).status ||
      (error as Record<string, unknown>).statusCode;
    if (typeof status === "number") return status;
  }
  return 500;
}

function getStack(error: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  if (typeof error === "object" && error != null) {
    const stack = (error as Record<string, unknown>).stack;
    if (typeof stack === "string") return stack;
  }
  return `Non-error value thrown: ${error}`;
}
