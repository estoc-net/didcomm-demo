declare module "didcomm/index_bg.js" {
  export * from "didcomm";
  export function __wbg_set_wasm(exports: unknown): void;
}

declare module "didcomm/index_bg.wasm?url" {
  const url: string;
  export default url;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
