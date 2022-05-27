export interface HeadOptions {
  htmlAttributes: string;
  bodyAttributes: string;
  head: string;
}

export function renderHead(options: HeadOptions): string {
  const { htmlAttributes, bodyAttributes, head } = options;
  return `<!doctype html><html${htmlAttributes}><head>${head}</head><body${bodyAttributes}><div id=1>`;
}

export interface TailOptions {
  tail: string;
}

export function renderTail(options: TailOptions): string {
  const { tail } = options;
  return `</div>${tail}</body></html>`;
}
