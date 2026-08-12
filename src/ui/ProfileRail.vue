<script setup lang="ts">
import { computed, ref } from "vue";

import { MEDIATOR_CHOICES } from "../core/mediators.js";
import {
  activeProfile,
  createProfile,
  deleteProfile,
  selectProfile,
  state,
} from "../core/store.js";
import type { AgentStatus } from "../core/types.js";
import { shortDid } from "./util.js";

const profile = computed(() => activeProfile());
const runtime = computed(() =>
  profile.value === null ? null : state.runtimes[profile.value.id] ?? null
);

const showMintForm = ref(false);
const newName = ref("");
const newMediator = ref(MEDIATOR_CHOICES[0].did);

function mint() {
  const name = newName.value.trim();
  if (name === "") {
    return;
  }
  createProfile(name, newMediator.value);
  newName.value = "";
  showMintForm.value = false;
}

const copied = ref(false);

async function copyDid() {
  if (profile.value?.did == null) {
    return;
  }
  await navigator.clipboard.writeText(profile.value.did);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function lampClass(status: AgentStatus | undefined): string {
  switch (status?.state) {
    case "live":
      return "live";
    case "connecting":
      return "connecting";
    case "error":
      return "error";
    default:
      return "";
  }
}

function statusText(status: AgentStatus | null): string {
  switch (status?.state) {
    case "live":
      return "live delivery on";
    case "connecting":
      return status.detail;
    case "error":
      return status.detail;
    default:
      return "starting";
  }
}

function mediatorLabel(did: string): string {
  return MEDIATOR_CHOICES.find((choice) => choice.did === did)?.label ?? "custom mediator";
}

function removeProfile(id: string, name: string) {
  if (confirm(`Delete the profile "${name}"? Its keys and messages are gone for good.`)) {
    deleteProfile(id);
  }
}
</script>

<template>
  <aside class="rail">
    <div class="wordmark">
      <div class="name">Estoc <em>Research</em></div>
      <div class="sub">didcomm demo</div>
    </div>

    <div class="rail-section">
      <div class="eyebrow">Profiles</div>
      <div v-for="p in state.profiles" :key="p.id" style="display: flex; align-items: center">
        <button
          class="profile-row"
          :class="{ active: p.id === state.activeProfileId }"
          @click="selectProfile(p.id)"
        >
          <span class="lamp" :class="lampClass(state.runtimes[p.id]?.status)"></span>
          <span class="profile-name">{{ p.name }}</span>
        </button>
        <button
          v-if="p.id === state.activeProfileId"
          class="btn-quiet"
          aria-label="Delete profile"
          @click="removeProfile(p.id, p.name)"
        >
          ✕
        </button>
      </div>

      <form v-if="showMintForm" class="rail-form" style="margin-top: 10px" @submit.prevent="mint">
        <input v-model="newName" class="field" placeholder="name, e.g. Alice" />
        <select v-model="newMediator" class="field">
          <option v-for="choice in MEDIATOR_CHOICES" :key="choice.did" :value="choice.did">
            {{ choice.label }}
          </option>
        </select>
        <button class="btn" type="submit">Mint identity</button>
      </form>
      <button v-else class="btn-quiet" style="margin-top: 8px" @click="showMintForm = true">
        + new profile
      </button>
    </div>

    <div v-if="profile" class="rail-section">
      <div class="eyebrow">Your DID — share it to be reached</div>
      <button
        class="did-chip"
        :title="profile.did ?? 'not minted yet'"
        :disabled="profile.did === null"
        @click="copyDid"
      >
        {{ copied ? "copied" : profile.did === null ? "minting…" : shortDid(profile.did) }}
      </button>
      <p class="status-line">via {{ mediatorLabel(profile.mediatorDid) }}</p>
      <p class="status-line" :class="{ error: runtime?.status.state === 'error' }">
        {{ statusText(runtime?.status ?? null) }}
      </p>
    </div>

    <div v-if="runtime && runtime.log.length" class="rail-log">
      <p v-for="(line, i) in runtime.log" :key="i">{{ line }}</p>
    </div>
  </aside>
</template>
