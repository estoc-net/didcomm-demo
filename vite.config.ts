import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // The didcomm package's entry does `import * as wasm from "./index_bg.wasm"`,
  // which only webpack understands. src/didcomm/wasm.ts instantiates the wasm
  // itself and imports the glue module directly; keeping the package out of
  // prebundling makes sure that glue module is the single instance the shim
  // wires up.
  optimizeDeps: { exclude: ["didcomm"] },
  build: { target: "es2022" },
});
