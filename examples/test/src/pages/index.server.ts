import { setTimeout } from "timers/promises";

const DELAY = 2000;

const items = [
  {
    name: "Example 1",
  },
];

export async function loader(ctx) {
  await setTimeout(DELAY);
  return items;
}

export async function form(ctx) {
  const form = await ctx.request.form();
  items.push({ name: form.get("name") });
  return { created: true };
}