export function getServerSideProps() {
  return {
    props: {
      data: { test: true },
    },
  };
}
