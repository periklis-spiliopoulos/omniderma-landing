const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "cookie-consent.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const storageKey = "omniderma-consent-v1";
const coreLabel = "AW-18422990044/VHqqCNynu7QdENyJ4tBE";
const demoLabel = "AW-18422990044/db_dCN-nu7QdENyJ4tBE";
const denied = {
  ad_storage: "denied", analytics_storage: "denied",
  ad_user_data: "denied", ad_personalization: "denied"
};

// A minimal DOM lets these consent and event regressions run with Node alone.
function page({ choice, storageBlocked = false, existingTag = false } = {}) {
  const elements = new Map();
  const callbacks = [];
  const scripts = [];
  const saved = new Map(choice ? [[storageKey, JSON.stringify({ version: 1, choice })]] : []);
  let reloads = 0;
  class Element {
    constructor(tag = "a") {
      this.tagName = tag;
      this.listeners = {};
      this.children = new Map();
      this.dataset = {};
    }
    setAttribute() {}
    focus() {}
    querySelector(selector) {
      if (!this.children.has(selector)) this.children.set(selector, new Element("button"));
      return this.children.get(selector);
    }
    appendChild(child) { if (child.id) elements.set(child.id, child); }
    addEventListener(type, handler, options) {
      (this.listeners[type] ||= []).push({ handler, options });
    }
    click(overrides = {}) {
      const event = {
        isTrusted: true, defaultPrevented: false, target: this,
        preventDefault() { this.defaultPrevented = true; }, ...overrides
      };
      for (const { handler } of this.listeners.click || []) handler(event);
      return event;
    }
  }
  for (const id of ["core-promo-cta", "contact-cta", "hero-btn-1", "core-invite-cta"]) {
    elements.set(id, new Element());
  }
  const footer = new Element("footer");
  const document = {
    readyState: "loading", documentElement: { dataset: {}, lang: "en" },
    activeElement: null, body: new Element("body"),
    head: { appendChild(script) { scripts.push(script); elements.set(script.id, script); } },
    createElement: tag => new Element(tag),
    getElementById: id => elements.get(id) || null,
    querySelector(selector) {
      if (selector === "footer") return footer;
      if (selector.includes("googletagmanager.com")) return scripts[0] || (existingTag ? {} : null);
      return null;
    },
    addEventListener(type, callback) { if (type === "DOMContentLoaded") callbacks.push(callback); }
  };
  const window = {
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error("blocked"); return saved.get(key) || null; },
      setItem(key, value) { if (storageBlocked) throw new Error("blocked"); saved.set(key, value); }
    },
    requestAnimationFrame: callback => callback(),
    location: { href: "https://www.omniderma.health/?gclid=test-click-id", reload() { reloads++; } }
  };
  const context = vm.createContext({ window, document, MutationObserver: class { observe() {} } });
  const run = () => vm.runInContext(source, context);
  run();
  for (const callback of callbacks.splice(0)) callback();
  document.readyState = "complete";
  return {
    window, document, elements, scripts, saved, run,
    reloads: () => reloads,
    events: () => Array.from(window.dataLayer, args => Array.from(args)).filter(args => args[0] === "event"),
    commands: () => JSON.parse(JSON.stringify(Array.from(window.dataLayer, args => Array.from(args)))),
    choose(choice) { elements.get("omniderma-consent").querySelector(`[data-consent-choice="${choice}"]`).click(); }
  };
}

test("no tag or conversion before consent, after rejection, or on a later grant without a new click", () => {
  const p = page();
  assert.deepEqual(p.commands(), [["consent", "default", denied]]);
  for (const id of ["core-promo-cta", "contact-cta"]) {
    assert.equal(p.elements.get(id).click().defaultPrevented, false);
  }
  p.choose("necessary");
  p.elements.get("core-promo-cta").click();
  assert.equal(p.scripts.length, 0);
  assert.equal(p.events().length, 0);
  p.choose("measurement");
  assert.equal(p.events().length, 0, "denied clicks are never replayed");
});

test("persisted measurement initializes one tag with all four consent signals before config and no conversion", () => {
  const p = page({ choice: "measurement" });
  const commands = p.commands();
  assert.deepEqual(commands[0], ["consent", "default", denied]);
  assert.deepEqual(commands[1], ["consent", "update", {
    ad_storage: "granted", analytics_storage: "granted",
    ad_user_data: "granted", ad_personalization: "denied"
  }]);
  assert.deepEqual(commands[3], ["config", "AW-18422990044", { allow_ad_personalization_signals: false }]);
  assert.equal(p.scripts.length, 1);
  assert.equal(p.scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=AW-18422990044");
  assert.equal(p.events().length, 0);
  p.choose("measurement");
  assert.equal(p.scripts.length, 1);
  assert.equal(p.commands().filter(args => args[0] === "config").length, 1);
});

test("each intentional CTA activation queues exactly its own conversion with only send_to", () => {
  const p = page({ choice: "measurement" });
  for (const [id, label] of [["core-promo-cta", coreLabel], ["contact-cta", demoLabel]]) {
    const before = p.events().length;
    const event = p.elements.get(id).click({ target: { tagName: "SPAN" } });
    assert.equal(event.defaultPrevented, false);
    assert.equal(p.events().length, before + 1, "nested content must not cause duplicate conversions");
    assert.deepEqual(JSON.parse(JSON.stringify(p.events().at(-1))), ["event", "conversion", { send_to: label }]);
    assert.equal(p.elements.get(id).listeners.click[0].options.passive, true);
  }
  assert.equal(p.window.location.href, "https://www.omniderma.health/?gclid=test-click-id");
});

test("scroll CTA, other email links, synthetic and canceled clicks do not convert", () => {
  const p = page({ choice: "measurement" });
  for (const id of ["hero-btn-1", "core-invite-cta"]) p.elements.get(id).click();
  p.elements.get("core-promo-cta").click({ isTrusted: false });
  p.elements.get("contact-cta").click({ defaultPrevented: true });
  assert.equal(p.events().length, 0);
});

test("loading the integration twice does not duplicate listeners, tags, or conversions", () => {
  const p = page({ choice: "measurement" });
  p.run();
  p.elements.get("core-promo-cta").click();
  p.elements.get("contact-cta").click();
  assert.equal(p.scripts.length, 1);
  assert.equal(p.events().length, 2);
  assert.equal(p.elements.get("core-promo-cta").listeners.click.length, 1);
});

test("an already-installed Google tag is reused", () => {
  const p = page({ choice: "measurement", existingTag: true });
  assert.equal(p.scripts.length, 0);
  p.elements.get("contact-cta").click();
  assert.equal(p.events().length, 1);
});

test("missing, blocked, or throwing gtag never cancels email activation", () => {
  for (const mode of ["missing", "throwing", "blocked-script"]) {
    const p = page({ choice: "measurement" });
    if (mode === "missing") delete p.window.gtag;
    if (mode === "throwing") p.window.gtag = () => { throw new Error("blocked"); };
    for (const id of ["core-promo-cta", "contact-cta"]) {
      assert.equal(p.elements.get(id).click().defaultPrevented, false);
    }
  }
});

test("blocked local storage still requires consent and accepts an in-memory choice", () => {
  const p = page({ storageBlocked: true });
  p.elements.get("contact-cta").click();
  assert.equal(p.events().length, 0);
  p.choose("measurement");
  p.elements.get("contact-cta").click();
  assert.equal(p.events().length, 1);
});

test("persisted rejection and revocation suppress conversions and remove the tag on reload", () => {
  const rejected = page({ choice: "necessary" });
  rejected.elements.get("contact-cta").click();
  assert.equal(rejected.scripts.length, 0);
  assert.equal(rejected.events().length, 0);
  const p = page({ choice: "measurement" });
  p.choose("necessary");
  assert.deepEqual(p.commands().at(-1), ["consent", "update", denied]);
  assert.equal(JSON.parse(p.saved.get(storageKey)).choice, "necessary");
  assert.equal(p.reloads(), 1);
  p.elements.get("contact-cta").click();
  assert.equal(p.events().length, 0);
});

test("the existing email recipients, subject, body, and scroll navigation remain intact", () => {
  const links = new Map(Array.from(html.matchAll(/<a\b([^>]+)>/g), match => {
    const id = match[1].match(/\bid="([^"]+)"/);
    const href = match[1].match(/\bhref="([^"]+)"/);
    return [id?.[1], href?.[1]?.replaceAll("&amp;", "&")];
  }));
  assert.equal(links.get("core-promo-cta"), "mailto:info@omniderma.health?subject=Request%20OmniDerma%20Core&body=I%20would%20like%20to%20download%20OmniDerma%20Core.%20I%20am%20a%20physician%2Fmedical%20student.%0AI%20have%20attached%20documentation%20confirming%20my%20status.");
  assert.equal(links.get("contact-cta"), "mailto:info@omniderma.health");
  assert.equal(links.get("hero-btn-1"), "#contact");
  assert.equal(links.get("core-invite-cta"), "mailto:info@omniderma.health?subject=OmniDerma%20Core%20Free%20Access");
  assert.doesNotMatch(html, /core_request_clicked|gtag_report_conversion|gtag\(/);
});

test("every inline script in the public site parses", () => {
  for (const file of ["index.html", "legal/index.html", "app-manual/index.html"]) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      new vm.Script(match[1], { filename: file });
    }
  }
});
