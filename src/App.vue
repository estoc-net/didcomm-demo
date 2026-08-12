<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { MEDIATOR_CHOICES } from "./core/mediators.js";
import { activeProfile, createProfile, state } from "./core/store.js";
import type { ChatMessage } from "./core/types.js";
import ChatPane from "./ui/ChatPane.vue";
import InspectorPane from "./ui/InspectorPane.vue";
import ProfileRail from "./ui/ProfileRail.vue";

const profile = computed(() => activeProfile());

const selectedContactDid = ref<string | null>(null);
const selectedMessageId = ref<string | null>(null);

watch(
  () => state.activeProfileId,
  () => {
    selectedContactDid.value = profile.value?.contacts[0]?.did ?? null;
    selectedMessageId.value = null;
  },
  { immediate: true }
);

// A profile's first contact (added by hand or auto-created by an incoming
// message) becomes the open conversation if none is.
watch(
  () => profile.value?.contacts.length ?? 0,
  () => {
    if (selectedContactDid.value === null) {
      selectedContactDid.value = profile.value?.contacts[0]?.did ?? null;
    }
  }
);

const selectedMessage = computed<ChatMessage | null>(
  () =>
    profile.value?.messages.find((m) => m.id === selectedMessageId.value) ?? null
);

// first-run onboarding
const firstName = ref("");
const firstMediator = ref(MEDIATOR_CHOICES[0].did);

function mintFirst() {
  const name = firstName.value.trim();
  if (name === "") {
    return;
  }
  createProfile(name, firstMediator.value);
}
</script>

<template>
  <div v-if="state.profiles.length === 0" class="hollow" style="height: 100%">
    <div class="hollow-card">
      <div class="eyebrow">Estoc Research — DIDComm demo</div>
      <h1>A messenger you can <em>see through</em></h1>
      <p>
        Chat runs over DIDComm v2 through a mediator, and every message keeps
        its envelopes: peel them layer by layer and see exactly what the
        mediator could — and could not — learn while carrying your mail.
      </p>
      <p>
        Start by minting an identity. Keys are generated here and never leave
        this browser.
      </p>
      <form @submit.prevent="mintFirst">
        <input v-model="firstName" class="field" placeholder="a name, e.g. Alice" />
        <select v-model="firstMediator" class="field">
          <option v-for="choice in MEDIATOR_CHOICES" :key="choice.did" :value="choice.did">
            via {{ choice.label }}
          </option>
        </select>
        <button class="btn" type="submit">Mint identity &amp; request mediation</button>
      </form>
    </div>
  </div>

  <div v-else class="frame">
    <ProfileRail />
    <ChatPane
      v-if="profile"
      :profile="profile"
      :selected-contact-did="selectedContactDid"
      :selected-message-id="selectedMessageId"
      @select-contact="(did) => { selectedContactDid = did; selectedMessageId = null; }"
      @select-message="(id) => (selectedMessageId = id)"
    />
    <InspectorPane
      v-if="profile"
      :message="selectedMessage"
      :contacts="profile.contacts"
      :profile-name="profile.name"
      @close="selectedMessageId = null"
    />
  </div>
</template>
