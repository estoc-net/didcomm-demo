import type { IMessage } from "didcomm";

import { initDidcomm, Message } from "../didcomm/wasm.js";
import { base64urlToUtf8 } from "@estoc/did-peer";
import type { DIDDoc, Secret } from "@estoc/did-peer";
import { resolveDid } from "./resolver.js";
import { mintIdentity } from "./identity.js";
import type {
  AgentStatus,
  ChatMessage,
  EnvelopeLayer,
  ProfileData,
} from "./types.js";

/**
 * One profile's live agent: mediation, pickup, live delivery, and the layered
 * packing that makes the inspector possible.
 *
 * Packing is deliberately done by hand in two steps — inner authcrypt to the
 * recipient, then an explicit forward sealed anonymously to their mediator —
 * instead of letting didcomm-rust wrap the forward internally. Same wire
 * bytes, but every layer passes through our hands, so every layer can be
 * shown. The wire behavior itself (DID shapes, ms timestamps, the WebSocket
 * ritual, acking over HTTP) is the one mediator-ts pins in its demo-interop
 * test.
 */

const MEDIATE_REQUEST =
  "https://didcomm.org/coordinate-mediation/3.0/mediate-request";
const MEDIATE_GRANT =
  "https://didcomm.org/coordinate-mediation/3.0/mediate-grant";
const RECIPIENT_UPDATE =
  "https://didcomm.org/coordinate-mediation/3.0/recipient-update";
const STATUS_REQUEST = "https://didcomm.org/messagepickup/3.0/status-request";
const STATUS = "https://didcomm.org/messagepickup/3.0/status";
const DELIVERY_REQUEST =
  "https://didcomm.org/messagepickup/3.0/delivery-request";
const DELIVERY = "https://didcomm.org/messagepickup/3.0/delivery";
const MESSAGES_RECEIVED =
  "https://didcomm.org/messagepickup/3.0/messages-received";
const LIVE_DELIVERY_CHANGE =
  "https://didcomm.org/messagepickup/3.0/live-delivery-change";
const FORWARD = "https://didcomm.org/routing/2.0/forward";
const BASIC_MESSAGE = "https://didcomm.org/basicmessage/2.0/message";
const PROFILE = "https://didcomm.org/user-profile/1.0/profile";
const REQUEST_PROFILE = "https://didcomm.org/user-profile/1.0/request-profile";

const PLAIN_TYP = "application/didcomm-plain+json";
const ENCRYPTED_MIME = "application/didcomm-encrypted+json";

const didResolver = { resolve: resolveDid };

export interface AgentEvents {
  onStatus(status: AgentStatus): void;
  onMessage(message: ChatMessage): void;
  /** any mutation of the profile worth persisting */
  onChange(): void;
  onLog(line: string): void;
}

function secretsResolverFor(secrets: Secret[]) {
  const byId = new Map(secrets.map((secret) => [secret.id, secret]));
  return {
    get_secret: async (id: string) => byId.get(id) ?? null,
    find_secrets: async (ids: string[]) => ids.filter((id) => byId.has(id)),
  };
}

function serviceUris(doc: DIDDoc): string[] {
  return doc.service.map((service) =>
    typeof service.serviceEndpoint === "string"
      ? service.serviceEndpoint
      : service.serviceEndpoint.uri
  );
}

function endpointOf(doc: DIDDoc, scheme: "http" | "ws"): string | null {
  return serviceUris(doc).find((uri) => uri.startsWith(scheme)) ?? null;
}

function pretty(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function plainMessage(
  type: string,
  from: string,
  to: string,
  body: Record<string, unknown>
): IMessage {
  return {
    id: crypto.randomUUID(),
    typ: PLAIN_TYP,
    type,
    from,
    to: [to],
    // The spec wants UTC epoch seconds, not milliseconds.
    created_time: Math.floor(Date.now() / 1000),
    body,
  } as IMessage;
}

interface DeliveryAttachment {
  id?: string;
  data: { base64?: string; json?: unknown };
}

export class ProfileAgent {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private mediatorDoc: DIDDoc | null = null;

  constructor(
    private readonly profile: ProfileData,
    private readonly events: AgentEvents
  ) {}

  get did(): string | null {
    return this.profile.did;
  }

  private allSecrets(): Secret[] {
    return [...this.profile.didForMediator.secrets, ...this.profile.secrets];
  }

  async start(): Promise<void> {
    try {
      // A freshly minted profile can start before the WASM download finishes;
      // nothing below can pack or unpack until it has.
      this.events.onStatus({ state: "connecting", detail: "loading didcomm" });
      await initDidcomm();

      this.events.onStatus({ state: "connecting", detail: "resolving mediator" });
      this.mediatorDoc = await resolveDid(this.profile.mediatorDid);
      if (this.mediatorDoc === null) {
        throw new Error("mediator DID does not resolve");
      }

      if (this.profile.did === null) {
        this.events.onStatus({
          state: "connecting",
          detail: "requesting mediation",
        });
        await this.establishMediation();
      }

      this.events.onStatus({ state: "connecting", detail: "picking up queued mail" });
      await this.drainQueue();

      this.events.onStatus({ state: "connecting", detail: "opening live delivery" });
      this.connectWebSocket();
    } catch (err) {
      this.events.onStatus({
        state: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Seal a message from the mediator-facing DID to the mediator itself.
   * Every such request declares the connection it arrives on as its return
   * route — messagepickup 3.0 requires clients to say so explicitly, once
   * per WebSocket and on every HTTP POST.
   */
  private async packForMediator(message: IMessage): Promise<string> {
    const [packed] = await new Message({
      ...message,
      return_route: "all",
    } as IMessage).pack_encrypted(
      this.profile.mediatorDid,
      this.profile.didForMediator.did,
      null,
      didResolver,
      secretsResolverFor(this.allSecrets()),
      { forward: false }
    );
    return packed;
  }

  private mediatorHttp(): string {
    const endpoint = endpointOf(this.mediatorDoc as DIDDoc, "http");
    if (endpoint === null) {
      throw new Error("mediator has no HTTP endpoint");
    }
    return endpoint;
  }

  private async unpack(packed: string): Promise<IMessage> {
    const [msg] = await Message.unpack(
      packed,
      didResolver,
      secretsResolverFor(this.allSecrets()),
      {}
    );
    return msg.as_value();
  }

  /** POST to the mediator and unpack the reply riding the HTTP response. */
  private async mediatorRoundTrip(
    type: string,
    body: Record<string, unknown>
  ): Promise<IMessage> {
    const message = plainMessage(
      type,
      this.profile.didForMediator.did,
      this.profile.mediatorDid,
      body
    );
    const packed = await this.packForMediator(message);
    const response = await fetch(this.mediatorHttp(), {
      method: "POST",
      headers: { "Content-Type": ENCRYPTED_MIME },
      body: packed,
    });
    if (!response.ok) {
      throw new Error(`mediator answered ${response.status} to ${type}`);
    }
    return this.unpack(await response.text());
  }

  private async establishMediation(): Promise<void> {
    const grant = await this.mediatorRoundTrip(MEDIATE_REQUEST, {});
    if (grant.type !== MEDIATE_GRANT) {
      throw new Error(`expected mediate-grant, got ${grant.type}`);
    }
    const routing = grant.body.routing_did as string[] | undefined;
    const routingDid = routing?.[0];
    if (routingDid === undefined) {
      throw new Error("mediate-grant carries no routing_did");
    }
    this.events.onLog(`mediate-grant received; routing DID is the mediator`);

    const publicIdentity = mintIdentity(routingDid);
    this.profile.did = publicIdentity.did;
    this.profile.secrets = publicIdentity.secrets;

    const updated = await this.mediatorRoundTrip(RECIPIENT_UPDATE, {
      updates: [{ recipient_did: publicIdentity.did, action: "add" }],
    });
    const results = updated.body.updated as
      | { result?: string }[]
      | undefined;
    if (results?.[0]?.result !== "success") {
      throw new Error("recipient-update was not accepted");
    }
    this.events.onLog("public DID registered with the mediator");
    this.events.onChange();
  }

  /** The pickup loop: status → delivery-request → unpack each → ack. */
  private async drainQueue(): Promise<void> {
    for (let round = 0; round < 10; round++) {
      const status = await this.mediatorRoundTrip(STATUS_REQUEST, {});
      const count =
        status.type === STATUS ? (status.body.message_count as number) : 0;
      if (count === 0) {
        return;
      }
      this.events.onLog(`${count} message(s) queued at the mediator`);

      const delivery = await this.mediatorRoundTrip(DELIVERY_REQUEST, {
        limit: count,
      });
      if (delivery.type !== DELIVERY) {
        return;
      }
      await this.processDelivery(delivery, null);
    }
  }

  private async ack(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.mediatorRoundTrip(MESSAGES_RECEIVED, { message_id_list: ids });
  }

  /**
   * Open the inner envelopes riding a delivery message, record each as a
   * received chat message with its full peel, then ack — over HTTP even when
   * the delivery arrived on the socket, which is the ritual the mediator's
   * demo-interop test pins.
   */
  private async processDelivery(
    delivery: IMessage,
    outerPacked: string | null
  ): Promise<void> {
    const attachments = (delivery.attachments ?? []) as DeliveryAttachment[];
    const acked: string[] = [];

    for (const attachment of attachments) {
      if (attachment.id !== undefined) {
        acked.push(attachment.id);
      }

      let innerPacked: string | null = null;
      if (typeof attachment.data.base64 === "string") {
        innerPacked = base64urlToUtf8(attachment.data.base64);
      } else if (attachment.data.json !== undefined) {
        innerPacked = JSON.stringify(attachment.data.json);
      }
      if (innerPacked === null) {
        continue;
      }

      let inner: IMessage;
      try {
        inner = await this.unpack(innerPacked);
      } catch (err) {
        this.events.onLog(
          `could not open a delivered envelope: ${err instanceof Error ? err.message : err}`
        );
        continue;
      }

      if (inner.type === REQUEST_PROFILE) {
        // Someone asked who we are: answer, without asking back.
        if (inner.from !== undefined) {
          this.events.onLog("profile requested; sending ours");
          await this.sendProfile(inner.from, false);
        }
        continue;
      }

      if (inner.type !== BASIC_MESSAGE && inner.type !== PROFILE) {
        this.events.onLog(`received a ${inner.type ?? "typeless"} message; ignoring`);
        continue;
      }

      if (this.profile.messages.some((m) => m.id === inner.id)) {
        continue;
      }

      const layers: EnvelopeLayer[] = [];
      if (outerPacked !== null) {
        layers.push({
          kind: "authcrypt",
          title: "Delivery envelope from your mediator",
          payload: pretty(outerPacked),
          visibleTo: "you",
          note: "The frame that arrived on your WebSocket: a delivery message sealed by the mediator to your mediator-facing DID.",
        });
      }
      layers.push(
        {
          kind: "plaintext",
          title: "Pickup delivery",
          payload: pretty(delivery as unknown as Record<string, unknown>),
          visibleTo: "you and your mediator",
          note: "The mediator hands over what it queued. The attachment is still sealed — the mediator never saw inside it.",
        },
        {
          kind: "authcrypt",
          title: "Inner envelope — sealed to you",
          payload: pretty(innerPacked),
          visibleTo: "you (opened with your key)",
          note: "Encrypted to your public DID's key agreement key and authenticated by the sender's key. This is the layer the mediator stored without being able to read.",
        },
        {
          kind: "plaintext",
          title: "Plaintext message",
          payload: pretty(inner as unknown as Record<string, unknown>),
          visibleTo: "you and the sender",
          note: "The message itself, visible to nobody in between.",
        }
      );

      const body = inner.body as {
        content?: unknown;
        profile?: { displayName?: unknown };
        send_back_yours?: unknown;
      };
      const content =
        inner.type === PROFILE
          ? typeof body.profile?.displayName === "string"
            ? body.profile.displayName
            : ""
          : String(body.content ?? "");

      const message: ChatMessage = {
        id: inner.id,
        kind: inner.type === PROFILE ? "profile" : "chat",
        direction: "received",
        contactDid: inner.from ?? "unknown",
        content,
        // created_time is spec'd in epoch seconds; tolerate senders (and our
        // own pre-fix history) that used milliseconds.
        time:
          typeof inner.created_time !== "number"
            ? Date.now()
            : inner.created_time < 1e12
              ? inner.created_time * 1000
              : inner.created_time,
        layers,
      };
      this.profile.messages.push(message);
      this.events.onMessage(message);
      this.events.onChange();

      if (
        inner.type === PROFILE &&
        body.send_back_yours === true &&
        inner.from !== undefined
      ) {
        try {
          await this.shareProfileIfNew(inner.from);
        } catch (err) {
          this.events.onLog(
            `could not send our profile back: ${err instanceof Error ? err.message : err}`
          );
        }
      }
    }

    try {
      await this.ack(acked);
    } catch (err) {
      this.events.onLog(
        `ack failed (${err instanceof Error ? err.message : err}); messages stay queued and will be deduplicated on the next pickup`
      );
    }
  }

  private connectWebSocket(): void {
    const wsUri = endpointOf(this.mediatorDoc as DIDDoc, "ws");
    if (wsUri === null) {
      this.events.onStatus({
        state: "error",
        detail: "mediator has no WebSocket endpoint",
      });
      return;
    }

    const ws = new WebSocket(wsUri);
    this.ws = ws;

    ws.onopen = async () => {
      // live-delivery-change is the first frame the socket ever carries.
      const packed = await this.packForMediator(
        plainMessage(
          LIVE_DELIVERY_CHANGE,
          this.profile.didForMediator.did,
          this.profile.mediatorDid,
          { live_delivery: true }
        )
      );
      ws.send(packed);
    };

    ws.onmessage = async (event: MessageEvent) => {
      const text =
        typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      try {
        const message = await this.unpack(text);
        if (message.type === STATUS) {
          if (message.body.live_delivery === true) {
            this.events.onStatus({ state: "live" });
            this.events.onLog("live delivery is on");
          }
          return;
        }
        if (message.type === DELIVERY) {
          await this.processDelivery(message, text);
          return;
        }
        this.events.onLog(`unexpected frame type ${message.type ?? "unknown"}`);
      } catch (err) {
        this.events.onLog(
          `could not unpack a socket frame: ${err instanceof Error ? err.message : err}`
        );
      }
    };

    ws.onclose = () => {
      if (this.destroyed) {
        return;
      }
      this.events.onStatus({
        state: "connecting",
        detail: "socket closed; reconnecting",
      });
      setTimeout(() => {
        if (!this.destroyed) {
          this.connectWebSocket();
        }
      }, 3000);
    };
  }

  /**
   * Pack a plaintext message for a contact layer by layer and POST it,
   * capturing every layer for the inspector: plaintext → authcrypt to the
   * recipient → (when they live behind a mediator) forward request →
   * anoncrypt to their mediator.
   */
  private async deliverToContact(
    plain: IMessage,
    contactDid: string
  ): Promise<EnvelopeLayer[]> {
    const contactDoc = await resolveDid(contactDid);
    if (contactDoc === null) {
      throw new Error("contact DID does not resolve");
    }
    const contactService = serviceUris(contactDoc)[0];
    if (contactService === undefined) {
      throw new Error("contact DID names no service endpoint");
    }

    const [innerPacked] = await new Message(plain).pack_encrypted(
      contactDid,
      this.profile.did as string,
      null,
      didResolver,
      secretsResolverFor(this.allSecrets()),
      { forward: false }
    );

    const layers: EnvelopeLayer[] = [
      {
        kind: "plaintext",
        title: "Plaintext message",
        payload: pretty(plain as unknown as Record<string, unknown>),
        visibleTo: "you and the recipient",
        note: "What the recipient reads after peeling every layer. Nobody on the path sees this.",
      },
      {
        kind: "authcrypt",
        title: "Inner envelope — sealed to the recipient",
        payload: pretty(innerPacked),
        visibleTo: "the recipient only",
        note: "Encrypted to the recipient's key agreement key, authenticated with yours. Their mediator will store this without being able to open it.",
      },
    ];

    let outboundPacked = innerPacked;
    let endpoint: string;

    if (contactService.startsWith("did:")) {
      // The contact lives behind a mediator: wrap a forward and seal it
      // anonymously to that mediator.
      const routingDid = contactService;
      const routingDoc = await resolveDid(routingDid);
      const httpEndpoint = routingDoc === null ? null : endpointOf(routingDoc, "http");
      if (httpEndpoint === null) {
        throw new Error("contact's mediator has no HTTP endpoint");
      }

      const forward = {
        id: crypto.randomUUID(),
        typ: PLAIN_TYP,
        type: FORWARD,
        to: [routingDid],
        created_time: Math.floor(Date.now() / 1000),
        body: { next: contactDid },
        attachments: [
          {
            id: crypto.randomUUID(),
            media_type: ENCRYPTED_MIME,
            data: { json: JSON.parse(innerPacked) as unknown },
          },
        ],
      } as IMessage;

      const [outerPacked] = await new Message(forward).pack_encrypted(
        routingDid,
        null,
        null,
        didResolver,
        secretsResolverFor(this.allSecrets()),
        { forward: false }
      );

      layers.push(
        {
          kind: "forward",
          title: "Forward request",
          payload: pretty(forward as unknown as Record<string, unknown>),
          visibleTo: "the recipient's mediator",
          note: "All the mediator is told: queue the attached envelope for `next`. No sender, no content.",
        },
        {
          kind: "anoncrypt",
          title: "Outer envelope — anonymous to the mediator",
          payload: pretty(outerPacked),
          visibleTo: "the recipient's mediator",
          note: "Sealed anonymously (anoncrypt): the wire and the mediator see a message from nobody, addressed to the mediator itself.",
        }
      );

      outboundPacked = outerPacked;
      endpoint = httpEndpoint;
    } else if (contactService.startsWith("http")) {
      // No mediator in the way — the inner envelope goes straight to them.
      endpoint = contactService;
    } else {
      throw new Error(`unroutable service endpoint: ${contactService}`);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": ENCRYPTED_MIME },
      body: outboundPacked,
    });
    if (!response.ok) {
      throw new Error(`endpoint answered ${response.status}`);
    }

    return layers;
  }

  async sendBasicMessage(contactDid: string, text: string): Promise<ChatMessage> {
    if (this.profile.did === null) {
      throw new Error("no public DID yet — mediation has not completed");
    }

    // The first message to anyone is preceded by an introduction: our
    // user-profile/1.0 announcement, asking for theirs back.
    await this.shareProfileIfNew(contactDid);

    const plain = plainMessage(BASIC_MESSAGE, this.profile.did, contactDid, {
      content: text,
    });
    const layers = await this.deliverToContact(plain, contactDid);

    const message: ChatMessage = {
      id: plain.id,
      kind: "chat",
      direction: "sent",
      contactDid,
      content: text,
      time: Date.now(),
      layers,
    };
    this.profile.messages.push(message);
    this.events.onChange();
    return message;
  }

  /** Announce our display name once per contact; later renames stay local. */
  private async shareProfileIfNew(contactDid: string): Promise<void> {
    if (this.profile.profileSharedWith.includes(contactDid)) {
      return;
    }
    await this.sendProfile(contactDid, true);
  }

  /**
   * Send a user-profile/1.0 `profile` message: the displayName the contact
   * will see is whatever we claim it is — the demo's UI says as much on the
   * receiving side.
   */
  private async sendProfile(
    contactDid: string,
    sendBackYours: boolean
  ): Promise<void> {
    if (this.profile.did === null) {
      return;
    }

    const plain = plainMessage(PROFILE, this.profile.did, contactDid, {
      profile: { displayName: this.profile.name },
      send_back_yours: sendBackYours,
    });
    const layers = await this.deliverToContact(plain, contactDid);

    if (!this.profile.profileSharedWith.includes(contactDid)) {
      this.profile.profileSharedWith.push(contactDid);
    }
    const message: ChatMessage = {
      id: plain.id,
      kind: "profile",
      direction: "sent",
      contactDid,
      content: this.profile.name,
      time: Date.now(),
      layers,
    };
    this.profile.messages.push(message);
    this.events.onChange();
  }
}
