# Remote Arc Browser

Scoped Chrome companion for Remote Arc.

## Security model

- No `<all_urls>` host permission.
- No Chrome `debugger` / CDP permission.
- No cookies, history, or password access.
- The only fixed host permission is the Remote Arc relay itself.
- A user must open the extension and click **Share this tab** for every tab they want to expose.
- Remote Arc does not impose a hard tab-count limit. Multiple tabs can stay shared concurrently, subject only to normal browser resource limits.
- Every shared tab starts read-only. **Click & fill** is a separate per-tab permission the user must explicitly enable in the popup.
- Recognized password, one-time-code, payment-card, and file-picker fields cannot be filled through Remote Arc. Detection uses standard input types and autocomplete metadata; sites that mislabel sensitive fields can bypass this classification.
- Interaction uses element refs from the most recent `browser_read_page` snapshot. Stale refs are rejected instead of being re-targeted.
- A click invalidates the current interaction snapshot so the AI must read the page again before another click.
- Access is revoked for a tab on navigation, reload, tab close, or manual revoke.
- Browser tools operate on a simplified DOM snapshot rather than raw HTML and do not return form values.
- WebSocket device credentials are sent as a WebSocket subprotocol, not in the URL.

## Tools

Read scope:

- `browser_list_tabs`
- `browser_get_current_tab`
- `browser_read_page`
- `browser_get_selected_text`
- `browser_extract_links`
- `browser_extract_table`

Interaction scope:

- `browser_click`
- `browser_fill`

## Interaction flow

1. Share a tab. It starts with read permission only.
2. Call `browser_read_page` and keep the returned `snapshotId` plus element `ref`.
3. If the user has enabled **Click & fill** for that tab, call `browser_fill` or `browser_click` with the same `snapshot_id` and `ref`.
4. After a click, read the page again before the next interaction.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/browser-extension`.
5. Open the extension and connect it to Remote Arc.
6. On a normal HTTP/HTTPS page, click **Share this tab**.
