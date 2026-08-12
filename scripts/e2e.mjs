/**
 * Full-flow smoke against a running mediator and a running dev server:
 * two isolated browser contexts mint Alice and Bob, exchange DIDs, and
 * message each other; live delivery must land without a reload, and the
 * inspector must show the full peel on both sides.
 *
 *   node scripts/e2e.mjs [demo-url]        (default http://localhost:5199)
 *
 * The mediator both profiles use is whatever the demo's mediator dropdown
 * offers — the script picks the localhost entry unless E2E_MEDIATOR=estoc.
 */
import { chromium } from "playwright-core";

const DEMO_URL = process.argv[2] ?? "http://localhost:5199";
const MEDIATOR_LABEL =
  process.env.E2E_MEDIATOR === "estoc" ? "mediator.estoc.dev" : "localhost:8080";

const executablePath = "/usr/bin/chromium";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

async function mintProfile(page, name) {
  await page.goto(DEMO_URL);
  await page.fill('input[placeholder="a name, e.g. Alice"]', name);
  await page.selectOption("select.field", { label: `via ${MEDIATOR_LABEL}` });
  await page.click('button:has-text("Mint identity")');
  await page.waitForSelector('text=live delivery on', { timeout: 20000 });
  const did = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("estoc-didcomm-demo:v1"));
    return state.profiles[0].did;
  });
  if (!did || !did.startsWith("did:peer:4")) {
    throw new Error(`${name} has no public did:peer:4 after mediation`);
  }
  ok(`${name} mediated; public DID minted (${did.length} chars)`);
  return did;
}

async function addContact(page, label, did) {
  await page.click('button:has-text("+ contact")');
  await page.fill('input[placeholder="name, e.g. Bob"]', label);
  await page.fill('input[placeholder="paste their DID (did:peer:4…)"]', did);
  await page.click('button:has-text("Add contact")');
}

async function send(page, contactLabel, text) {
  await page.fill(`input[placeholder="Write to ${contactLabel}"]`, text);
  await page.click('button:has-text("Send")');
}

async function expectBubble(page, text, timeout = 15000) {
  await page.waitForSelector(`.bubble:has-text("${text}")`, { timeout });
}

async function peelLayers(page, text) {
  await page.click(`.bubble:has-text("${text}")`);
  await page.waitForSelector(".inspector .layer");
  return page.locator(".inspector .layer").count();
}

const browser = await chromium.launch({ executablePath });
try {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();
  for (const [name, page] of [["alice", alice], ["bob", bob]]) {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[${name} console] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => console.error(`[${name} pageerror] ${err}`));
  }

  const aliceDid = await mintProfile(alice, "Alice");
  const bobDid = await mintProfile(bob, "Bob");

  await addContact(alice, "Bob", bobDid);
  await send(alice, "Bob", "hello bob, through the mediator");
  await expectBubble(alice, "hello bob");
  ok("Alice's sent message shows in her thread");

  // Bob must receive it live over the socket — no reload, no contact added.
  await expectBubble(bob, "hello bob");
  ok("Bob received it live over the WebSocket");

  await addContact(bob, "Alice", aliceDid);
  await send(bob, "Alice", "hi alice, got it");
  await expectBubble(alice, "hi alice");
  ok("Alice received Bob's reply live");

  const sentLayers = await peelLayers(alice, "hello bob");
  if (sentLayers === 4) {
    ok("sent message peels into 4 layers (plain, authcrypt, forward, anoncrypt)");
  } else {
    fail(`sent message shows ${sentLayers} layers, expected 4`);
  }

  const receivedLayers = await peelLayers(bob, "hello bob");
  if (receivedLayers === 4) {
    ok("received message peels into 4 layers (outer, delivery, authcrypt, plain)");
  } else {
    fail(`received message shows ${receivedLayers} layers, expected 4`);
  }

  // Refresh survival: history and identity come back from localStorage.
  await bob.reload();
  await expectBubble(bob, "hello bob");
  await bob.waitForSelector("text=live delivery on", { timeout: 20000 });
  ok("Bob's history and live delivery survive a reload");

  await alice.screenshot({ path: "scripts/e2e-alice.png", fullPage: true });
  await bob.screenshot({ path: "scripts/e2e-bob.png", fullPage: true });

  if (process.exitCode !== 1) {
    console.log("\nall green");
  }
} finally {
  await browser.close();
}
