import { ServerSideContext, ServerSideProps } from "./index.js";

export interface ErrorProps {
  status: number;
  stack?: string;
}

export function getServerSideProps({
  error,
}: ServerSideContext<{}>): ServerSideProps<ErrorProps> {
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
