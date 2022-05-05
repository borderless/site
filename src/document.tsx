import { PAGE_ELEMENT_ID } from "./shared.js";

export interface DocumentOptions {
  htmlAttributes: string;
  bodyAttributes: string;
  head: string;
  script: string;
}

export default function template(options: DocumentOptions): [string, string] {
  const { htmlAttributes, bodyAttributes, head, script } = options;

  return [
    `<!doctype html><html${htmlAttributes}><head>${head}</head><body${bodyAttributes}><div id=${PAGE_ELEMENT_ID}>`,
    `</div>${script}</body></html>`,
  ];
}
