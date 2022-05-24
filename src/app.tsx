import React from "react";

export interface AppProps {
  cache?: Map<string, object>;
  children: React.ReactNode;
}

export default function App({ children }: AppProps) {
  return <>{children}</>;
}
