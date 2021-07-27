export function getServerSideProps() {
  return { redirect: { url: "/hello" } };
}

export default function Redirect() {
  return null;
}
