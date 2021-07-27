import React, { useContext } from "react";
import { PAGE_ELEMENT_ID, PAGE_PROPS_ID } from "../render/client.js";
import { Context } from "../render/server.js";

/**
 * Main element renders the page on the server-side.
 */
export function Main() {
  const { html } = useContext(Context);
  return (
    <div id={PAGE_ELEMENT_ID} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/**
 * HTML document wrapper.
 */
export function Html(props: { children: React.ReactNode }) {
  const { helmet } = useContext(Context);
  const htmlAttributes = helmet.htmlAttributes?.toComponent();

  return <html {...htmlAttributes} {...props} />;
}

/**
 * Body wrapper.
 */
export function Body(props: { children: React.ReactNode }) {
  const { helmet } = useContext(Context);
  const bodyAttributes = helmet.bodyAttributes?.toComponent();

  return <body {...bodyAttributes} {...props} />;
}

/**
 * Generate `<head />` element with helmet context.
 */
export function Head() {
  const { helmet } = useContext(Context);

  return (
    <head>
      {helmet.title?.toComponent()}
      {helmet.base?.toComponent()}
      {helmet.meta?.toComponent()}
      {helmet.link?.toComponent()}
      {helmet.style?.toComponent()}
      {helmet.script?.toComponent()}
    </head>
  );
}

/**
 * Generates the page hydration script.
 */
export function HydrateScript() {
  const { hydrate } = useContext(Context);
  if (!hydrate || !hydrate.scriptUrl) return null;

  return (
    <>
      {hydrate.props ? (
        <script
          id={PAGE_PROPS_ID}
          type="application/json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(hydrate.props) }}
        />
      ) : undefined}
      <script type="module" src={hydrate.scriptUrl} />
    </>
  );
}

export interface DocumentProps {}

export default function Document(props: DocumentProps) {
  return (
    <Html>
      <Head />
      <Body>
        <Main />
        <HydrateScript />
      </Body>
    </Html>
  );
}
