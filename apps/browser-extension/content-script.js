(() => {
  if (globalThis.__remoteArcBrowserInstalled) return;
  globalThis.__remoteArcBrowserInstalled = true;

  const clean = (value, max = 4000) =>
    String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };

  const accessibleName = (element) =>
    clean(
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      element.innerText ||
      element.textContent ||
      "",
      240,
    );

  const roleFor = (element) => {
    const explicit = element.getAttribute("role");
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "textarea" || element.isContentEditable) return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "reset"].includes(type)) return "button";
      if (["checkbox", "radio"].includes(type)) return type;
      return "textbox";
    }
    return tag;
  };

  const isSensitiveField = (element) => {
    if (!(element instanceof HTMLInputElement)) return false;
    const type = (element.type || "text").toLowerCase();
    if (["password", "file"].includes(type)) return true;
    const autocomplete = String(element.autocomplete || "").toLowerCase();
    return [
      "current-password",
      "new-password",
      "one-time-code",
      "cc-name",
      "cc-number",
      "cc-exp",
      "cc-exp-month",
      "cc-exp-year",
      "cc-csc",
    ].some((token) => autocomplete.split(/\s+/).includes(token));
  };

  const canFill = (element) => {
    if (isSensitiveField(element)) return false;
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return !element.disabled;
    if (element instanceof HTMLInputElement) {
      const type = (element.type || "text").toLowerCase();
      return !element.disabled && !["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "image"].includes(type);
    }
    return element.isContentEditable;
  };

  let snapshotSequence = 0;
  let activeSnapshotId = null;
  const snapshotElements = new Map();

  const nextSnapshotId = () => {
    snapshotSequence += 1;
    return `s${Date.now().toString(36)}-${snapshotSequence.toString(36)}`;
  };

  function snapshot() {
    const snapshotId = nextSnapshotId();
    activeSnapshotId = snapshotId;
    snapshotElements.clear();

    let next = 1;
    const selector = "a[href],button,input,textarea,select,[contenteditable='true'],[role],[tabindex]";
    const interactiveElements = [];
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const ref = "e" + next++;
      const type = element.getAttribute("type") || undefined;
      snapshotElements.set(ref, element);
      interactiveElements.push({
        ref,
        role: roleFor(element),
        name: accessibleName(element),
        ...(type ? { type } : {}),
        disabled: Boolean(element.disabled),
        canClick: !Boolean(element.disabled),
        canFill: canFill(element),
        sensitive: isSensitiveField(element),
      });
      if (interactiveElements.length >= 250) break;
    }

    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter((el) => el instanceof HTMLElement && visible(el))
      .slice(0, 80)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: clean(el.textContent, 500) }));

    return {
      snapshotId,
      url: location.href,
      origin: location.origin,
      title: document.title,
      headings,
      text: clean(document.body?.innerText || "", 50000),
      interactiveElements,
    };
  }

  function links() {
    return Array.from(document.querySelectorAll("a[href]"))
      .filter((el) => el instanceof HTMLElement && visible(el))
      .slice(0, 300)
      .map((el) => ({ text: accessibleName(el), href: el.href }));
  }

  function table(index = 0) {
    const tables = Array.from(document.querySelectorAll("table")).filter((el) => visible(el));
    const target = tables[index];
    if (!target) return { tableIndex: index, rows: [], error: "table not found" };
    const rows = Array.from(target.querySelectorAll("tr")).slice(0, 100).map((row) =>
      Array.from(row.querySelectorAll("th,td")).slice(0, 30).map((cell) => clean(cell.textContent, 1000))
    );
    return { tableIndex: index, tableCount: tables.length, rows };
  }

  function resolveElement(snapshotId, ref) {
    if (!snapshotId || snapshotId !== activeSnapshotId) {
      throw new Error("Snapshot is stale. Call browser_read_page again before interacting.");
    }
    const element = snapshotElements.get(String(ref || ""));
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      throw new Error("Element ref is stale. Call browser_read_page again.");
    }
    if (!visible(element)) {
      throw new Error("Element is no longer visible. Call browser_read_page again.");
    }
    if (element.disabled) {
      throw new Error("Element is disabled.");
    }
    return element;
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  }

  function fillElement(snapshotId, ref, rawValue) {
    const element = resolveElement(snapshotId, ref);
    if (!canFill(element)) {
      if (isSensitiveField(element)) {
        throw new Error("Remote Arc blocks filling password, one-time-code, payment, and file fields.");
      }
      throw new Error("Element cannot be filled. Use browser_click for buttons, checkboxes, or radio controls.");
    }

    const value = String(rawValue ?? "").slice(0, 20000);
    element.focus();

    if (element instanceof HTMLSelectElement) {
      const option = Array.from(element.options).find(
        (item) => item.value === value || clean(item.textContent, 500) === clean(value, 500),
      );
      if (!option) throw new Error("No matching select option.");
      setNativeValue(element, option.value);
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      setNativeValue(element, value);
    } else if (element.isContentEditable) {
      element.textContent = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return {
      ok: true,
      action: "fill",
      ref,
      role: roleFor(element),
      name: accessibleName(element),
      length: value.length,
      url: location.href,
    };
  }

  function prepareClick(snapshotId, ref) {
    const element = resolveElement(snapshotId, ref);
    if (element instanceof HTMLInputElement && (element.type || "").toLowerCase() === "file") {
      throw new Error("Remote Arc does not open local file pickers.");
    }

    activeSnapshotId = null;
    snapshotElements.clear();

    return {
      result: {
        ok: true,
        action: "click",
        ref,
        role: roleFor(element),
        name: accessibleName(element),
        url: location.href,
      },
      run: () => {
        element.focus();
        element.click();
      },
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.source !== "remote-arc-browser") return;
      if (message.tool === "browser_read_page") sendResponse(snapshot());
      else if (message.tool === "browser_get_selected_text") sendResponse({ text: clean(getSelection()?.toString() || "", 20000), url: location.href });
      else if (message.tool === "browser_extract_links") sendResponse({ url: location.href, links: links() });
      else if (message.tool === "browser_extract_table") sendResponse({ url: location.href, ...table(Number(message.arguments?.table_index || 0)) });
      else if (message.tool === "browser_fill") {
        sendResponse(fillElement(message.arguments?.snapshot_id, message.arguments?.ref, message.arguments?.value));
      } else if (message.tool === "browser_click") {
        const prepared = prepareClick(message.arguments?.snapshot_id, message.arguments?.ref);
        sendResponse(prepared.result);
        setTimeout(prepared.run, 0);
      } else sendResponse({ error: "unsupported browser tool" });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  });
})();
