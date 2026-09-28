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
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (["button", "submit", "reset"].includes(type)) return "button";
      if (["checkbox", "radio"].includes(type)) return type;
      return "textbox";
    }
    return tag;
  };

  function snapshot() {
    let next = 1;
    const selector = "a[href],button,input,textarea,select,[role],[tabindex]";
    const interactiveElements = [];
    for (const element of document.querySelectorAll(selector)) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const ref = "e" + next++;
      const type = element.getAttribute("type") || undefined;
      interactiveElements.push({
        ref,
        role: roleFor(element),
        name: accessibleName(element),
        ...(type ? { type } : {}),
        disabled: Boolean(element.disabled),
      });
      if (interactiveElements.length >= 250) break;
    }

    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter((el) => el instanceof HTMLElement && visible(el))
      .slice(0, 80)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: clean(el.textContent, 500) }));

    return {
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.source !== "remote-arc-browser") return;
      if (message.tool === "browser_read_page") sendResponse(snapshot());
      else if (message.tool === "browser_get_selected_text") sendResponse({ text: clean(getSelection()?.toString() || "", 20000), url: location.href });
      else if (message.tool === "browser_extract_links") sendResponse({ url: location.href, links: links() });
      else if (message.tool === "browser_extract_table") sendResponse({ url: location.href, ...table(Number(message.arguments?.table_index || 0)) });
      else sendResponse({ error: "unsupported browser tool" });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  });
})();
