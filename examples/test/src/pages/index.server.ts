import { onFormSubmit } from "@borderless/site/server";

const DELAY = 2000;

const items = [
  {
    name: "Example 1",
  },
];

export async function getServerSideProps(ctx) {
  return { props: items };
}

export const onRequest = {
  POST: onFormSubmit(async (ctx) => {
    const form = await ctx.request.form();
    items.push({ name: form.get("name") });
    return { created: true };
  }),
};
