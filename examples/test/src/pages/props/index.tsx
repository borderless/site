import { useServerSideProps } from "@borderless/site";

export default function Props() {
  const { data } = useServerSideProps<{ data: unknown }>();

  return <div>{JSON.stringify(data)}</div>;
}
