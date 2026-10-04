import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class HTMLElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.disabled = false;
    this.isConnected = true;
    this.isContentEditable = false;
    this.innerText = attrs.text || "";
    this.textContent = attrs.text || "";
    this.events = [];
    this.clickCount = 0;
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  getBoundingClientRect() {
    return { width: 120, height: 24 };
  }
  focus() {
    this.focused = true;
  }
  click() {
    this.clickCount += 1;
  }
  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
}

class HTMLInputElement extends HTMLElement {
  constructor(attrs = {}) {
    super("input", attrs);
    this.type = attrs.type || "text";
    this.autocomplete = attrs.autocomplete || "";
    this._value = "";
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = String(value);
  }
}

class HTMLTextAreaElement extends HTMLElement {
  constructor(attrs = {}) {
    super("textarea", attrs);
    this._value = "";
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = String(value);
  }
}

class HTMLSelectElement extends HTMLElement {
  constructor(attrs = {}) {
    super("select", attrs);
    this.options = [];
    this._value = "";
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = String(value);
  }
}

class Event {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    this.composed = Boolean(options.composed);
  }
}

const textInput = new HTMLInputElement({ placeholder: "Email" });
const passwordInput = new HTMLInputElement({ type: "password", placeholder: "Password" });
const button = new HTMLElement("button", { text: "Continue" });

const document = {
  body: { innerText: "Example page" },
  querySelectorAll(selector) {
    if (selector === "h1,h2,h3") return [];
    if (selector === "a[href]") return [];
    if (selector === "table") return [];
    return [textInput, passwordInput, button];
  },
};

let listener = null;
const chrome = {
  runtime: {
    onMessage: {
      addListener(fn) {
        listener = fn;
      },
    },
  },
};

const context = vm.createContext({
  console,
  chrome,
  document,
  location: { href: "https://example.com/form", origin: "https://example.com" },
  getComputedStyle: () => ({ visibility: "visible", display: "block" }),
  getSelection: () => ({ toString: () => "selected" }),
  HTMLElement,
  HTMLInputElement,
  HTMLTextAreaElement,
  HTMLSelectElement,
  Event,
  setTimeout,
  clearTimeout,
  Date,
  Map,
  Set,
  Array,
  String,
  Number,
  Boolean,
  Object,
  Error,
});

const contentScript = fs.readFileSync(new URL("./content-script.js", import.meta.url), "utf8");
vm.runInContext(contentScript, context, { filename: "content-script.js" });
assert.equal(typeof listener, "function", "content script should register a message listener");

const call = (tool, args = {}) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    listener(
      { source: "remote-arc-browser", tool, arguments: args },
      {},
      finish,
    );
    setTimeout(() => finish(undefined), 20);
  });

const snapshot = await call("browser_read_page");
assert.match(snapshot.snapshotId, /^s/);
assert.equal(snapshot.interactiveElements.length, 3);
assert.equal(
  JSON.stringify(snapshot.interactiveElements.map(({ ref, canFill, sensitive }) => ({ ref, canFill, sensitive }))),
  JSON.stringify([
    { ref: "e1", canFill: true, sensitive: false },
    { ref: "e2", canFill: false, sensitive: true },
    { ref: "e3", canFill: false, sensitive: false },
  ]),
);

const fill = await call("browser_fill", {
  snapshot_id: snapshot.snapshotId,
  ref: "e1",
  value: "sam@example.com",
});
assert.equal(fill.ok, true);
assert.equal(textInput.value, "sam@example.com");
assert.deepEqual(textInput.events, ["input", "change"]);

const sensitiveFill = await call("browser_fill", {
  snapshot_id: snapshot.snapshotId,
  ref: "e2",
  value: "secret",
});
assert.match(sensitiveFill.error, /blocks filling password/);
assert.equal(passwordInput.value, "");

const click = await call("browser_click", {
  snapshot_id: snapshot.snapshotId,
  ref: "e3",
});
assert.equal(click.ok, true);
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(button.clickCount, 1);

const staleClick = await call("browser_click", {
  snapshot_id: snapshot.snapshotId,
  ref: "e3",
});
assert.match(staleClick.error, /Snapshot is stale/);

const workerSource = fs.readFileSync(new URL("./service-worker.js", import.meta.url), "utf8");
assert.match(workerSource, /"browser_click"/);
assert.match(workerSource, /"browser_fill"/);
assert.match(workerSource, /permissions\?\.includes\("interact"\)/);
assert.match(workerSource, /const grants = new Map\(\)/);
assert.doesNotMatch(workerSource, /MAX_SHARED_TABS|sharedTabsLimit|grantLimit/);

const manifest = JSON.parse(fs.readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.version, "0.3.0");
assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting", "storage"].sort());
assert.equal(manifest.host_permissions.includes("<all_urls>"), false);

process.stdout.write("Remote Arc browser capability tests passed\n");
