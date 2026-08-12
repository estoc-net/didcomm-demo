import { createApp } from "vue";

import App from "./App.vue";
import { initDidcomm } from "./didcomm/wasm.js";
import { startAllAgents } from "./core/store.js";
import "./style.css";

createApp(App).mount("#app");

// Agents need the didcomm WASM before they can seal or open anything; the UI
// renders immediately and profiles come alive as soon as the module is ready.
void initDidcomm().then(startAllAgents);
