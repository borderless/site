import { PAGE_ELEMENT_ID } from "./common.js";

export interface HeadOptions {
  htmlAttributes: string;
  bodyAttributes: string;
  head: string;
}

export function renderHead(options: HeadOptions): string {
  const { htmlAttributes, bodyAttributes, head } = options;
  return `<!doctype html><html${htmlAttributes}><head>${head}</head><body${bodyAttributes}><div id=${PAGE_ELEMENT_ID}>`;
}

export interface TailOptions {
  script: string;
}

export function renderTail(options: TailOptions): string {
  const { script } = options;
  return `</div>${script}</body></html>`;
}
