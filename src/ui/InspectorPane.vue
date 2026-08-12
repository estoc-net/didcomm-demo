<script setup lang="ts">
import { computed } from "vue";

import type { ChatMessage, Contact } from "../core/types.js";
import LayerOnion from "./LayerOnion.vue";

const props = defineProps<{
  message: ChatMessage | null;
  contacts: Contact[];
  profileName: string;
}>();

const emit = defineEmits<{ close: [] }>();

const contactLabel = computed(() => {
  if (props.message === null) {
    return "them";
  }
  return (
    props.contacts.find((c) => c.did === props.message?.contactDid)?.label ??
    "them"
  );
});

/** The onion renders outermost layer first; sent layers are captured inside-out. */
const ordered = computed(() => {
  if (props.message === null) {
    return [];
  }
  return props.message.direction === "sent"
    ? [...props.message.layers].reverse()
    : props.message.layers;
});

const hops = computed(() => {
  if (props.message === null) {
    return null;
  }
  const me = props.profileName;
  const them = contactLabel.value;
  return props.message.direction === "sent"
    ? { from: me, via: `${them}'s mediator`, to: them }
    : { from: them, via: "your mediator", to: me };
});
</script>

<template>
  <aside class="inspector" :class="{ hidden: message === null }">
    <div class="inspector-head">
      <div class="eyebrow" style="display: flex; justify-content: space-between">
        <span>The envelope</span>
        <button class="btn-quiet" @click="emit('close')">close</button>
      </div>
      <h2 v-if="message">
        “{{ message.content.length > 40 ? message.content.slice(0, 40) + "…" : message.content }}”
      </h2>
    </div>

    <div class="inspector-body">
      <template v-if="message && hops">
        <div class="hops">
          <span class="stop">{{ hops.from }}</span>
          <span class="leg"></span>
          <span class="stop blind">{{ hops.via }}</span>
          <span class="leg"></span>
          <span class="stop">{{ hops.to }}</span>
        </div>
        <p class="hop-note">
          The mediator in the middle stores and forwards this message without
          being able to read it{{ message.direction === "sent" ? " or see who sent it" : "" }}.
          Outermost layer first — peel inward.
        </p>
        <LayerOnion :layers="ordered" />
      </template>

      <template v-else>
        <p class="hop-note">
          Select a message to peel it. Every message here is an onion: the
          plaintext is sealed to its recipient, wrapped in a forward request,
          and sealed again — anonymously — to the mediator that queues it. Each
          hop can open exactly one layer, and this panel shows what that
          leaves them knowing.
        </p>
      </template>
    </div>
  </aside>
</template>
