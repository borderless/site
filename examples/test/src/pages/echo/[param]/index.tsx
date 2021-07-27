import React from "react";

export interface Props {
  param: string;
}

export default ({ param }: Props) => {
  return <div>Hello from {JSON.stringify(param)}.</div>;
};

export function getServerSideProps({ params }) {
  return { props: { param: params.get("param") } };
}
