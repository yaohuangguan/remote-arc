# Remote Arc Browser

V1 browser capability for Remote Arc.

## Security model

- No `<all_urls>` host permission.
- No Chrome `debugger` / CDP permission.
- No cookies, history, or password access.
- The only fixed host permission is the Remote Arc relay itself.
- A user must open the extension and click **Allow AI on this tab**.
- The grant is read-only and is revoked on navigation, reload, tab close, or manual revoke.
- Browser tools operate on a simplified DOM snapshot rather than raw HTML.
- WebSocket device credentials are sent as a WebSocket subprotocol, not in the URL.

## V1 tools

- `browser_get_current_tab`
- `browser_read_page`
- `browser_get_selected_text`
- `browser_extract_links`
- `browser_extract_table`

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/browser-extension`.
5. Open the extension and connect it to Remote Arc.
6. On a normal HTTP/HTTPS page, click **Allow AI on this tab**.
