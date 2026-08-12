<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { addContact, sendMessage } from "../core/store.js";
import type { ProfileData } from "../core/types.js";
import { shortDid, timeOf } from "./util.js";

const props = defineProps<{
  profile: ProfileData;
  selectedContactDid: string | null;
  selectedMessageId: string | null;
}>();

const emit = defineEmits<{
  selectContact: [did: string];
  selectMessage: [id: string];
}>();

const contact = computed(
  () => props.profile.contacts.find((c) => c.did === props.selectedContactDid) ?? null
);

const thread = computed(() =>
  props.profile.messages.filter((m) => m.contactDid === props.selectedContactDid)
);

const showAddForm = ref(false);
const newLabel = ref("");
const newDid = ref("");
const addError = ref("");

function add() {
  const did = newDid.value.trim();
  const label = newLabel.value.trim() || shortDid(did);
  if (!did.startsWith("did:")) {
    addError.value = "That is not a DID — it should start with did:";
    return;
  }
  addContact(props.profile.id, did, label);
  emit("selectContact", did);
  newLabel.value = "";
  newDid.value = "";
  addError.value = "";
  showAddForm.value = false;
}

const draft = ref("");
const sending = ref(false);
const sendError = ref("");

async function send() {
  const text = draft.value.trim();
  if (text === "" || props.selectedContactDid === null || sending.value) {
    return;
  }
  sending.value = true;
  sendError.value = "";
  try {
    await sendMessage(props.profile.id, props.selectedContactDid, text);
    draft.value = "";
  } catch (err) {
    sendError.value = err instanceof Error ? err.message : String(err);
  } finally {
    sending.value = false;
  }
}

const threadEl = ref<HTMLElement | null>(null);

watch(
  () => thread.value.length,
  async () => {
    await nextTick();
    threadEl.value?.scrollTo({ top: threadEl.value.scrollHeight });
  }
);
</script>

<template>
  <main class="chat">
    <div class="chat-head">
      <h2>{{ contact?.label ?? "Conversations" }}</h2>
      <span v-if="contact" class="eyebrow" :title="contact.did">{{ shortDid(contact.did) }}</span>
    </div>

    <div class="contact-strip">
      <button
        v-for="c in profile.contacts"
        :key="c.did"
        class="contact-chip"
        :class="{ active: c.did === selectedContactDid }"
        @click="emit('selectContact', c.did)"
      >
        {{ c.label }}
      </button>
      <button class="contact-chip" @click="showAddForm = !showAddForm">+ contact</button>
    </div>

    <div v-if="showAddForm || profile.contacts.length === 0" class="hollow" style="flex: none">
      <div class="hollow-card" style="width: 100%">
        <p v-if="profile.contacts.length === 0">
          To talk to someone, add them as a contact. They copy their DID from
          their own left rail — for a one-browser demo, mint a second profile
          and introduce the two to each other.
        </p>
        <form @submit.prevent="add">
          <input v-model="newLabel" class="field" placeholder="name, e.g. Bob" />
          <input v-model="newDid" class="field" placeholder="paste their DID (did:peer:4…)" />
          <p v-if="addError" class="compose-error" style="padding: 0">{{ addError }}</p>
          <button class="btn" type="submit">Add contact</button>
        </form>
      </div>
    </div>

    <div ref="threadEl" class="thread">
      <p v-if="contact && thread.length === 0" class="hop-note">
        No messages yet. Whatever you write crosses the mediator sealed — send
        one, then select it to peel the envelopes.
      </p>
      <button
        v-for="m in thread"
        :key="m.id"
        class="bubble"
        :class="[m.direction, { selected: m.id === selectedMessageId }]"
        @click="emit('selectMessage', m.id)"
      >
        <div>{{ m.content }}</div>
        <div class="meta">
          <span>{{ timeOf(m.time) }}</span>
          <span class="peel-hint">peel ({{ m.layers.length }} layers)</span>
        </div>
      </button>
    </div>

    <p v-if="sendError" class="compose-error">{{ sendError }}</p>
    <form v-if="contact" class="composer" @submit.prevent="send">
      <input
        v-model="draft"
        class="field"
        :placeholder="`Write to ${contact.label}`"
        :disabled="sending"
      />
      <button class="btn" type="submit" :disabled="sending || draft.trim() === ''">
        {{ sending ? "Sealing…" : "Send" }}
      </button>
    </form>
  </main>
</template>
