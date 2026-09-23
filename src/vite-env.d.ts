/// <reference types="vite/client" />

/**
 * Ambient module declarations for non-code asset imports.
 *
 * `vite/client` already declares CSS side-effect imports for Vite's own
 * transform pipeline, but the explicit declarations below keep the contract
 * stable for TypeScript 7's `moduleDetection: "force"` + `verbatimModuleSyntax`
 * settings and document the exact surface the app relies on.
 */
declare module '*.css' {
  const css: string;
  export default css;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}
