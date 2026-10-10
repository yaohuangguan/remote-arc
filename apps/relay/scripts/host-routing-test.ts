import assert from "node:assert/strict";
import { dashboardSignInUrl, publicWebsiteRedirect } from "../src/host-routing.js";

const marketing = "https://remotearc.app";
const app = "https://mcp.remotearc.app";
const route = (path: string, origin = app) => new URL(path, origin);

for (const path of [
  "/blogs", "/blogs/why-i-built-remote-arc", "/docs", "/docs/mcp",
  "/install/chatgpt", "/install/claude", "/use-cases/remote-development",
  "/pricing", "/downloads", "/releases", "/security-model",
  "/zh", "/zh/docs", "/zh/pricing", "/zh/install/chatgpt",
  "/zh/blogs", "/zh/blogs/how-remote-arc-works", "/zh/use-cases",
  "/zh/use-cases/remote-development", "/zh/security-model", "/zh/releases",
  "/connect-ai", "/chatgpt-computer-access", "/remote-mcp",
]) {
  assert.equal(publicWebsiteRedirect(route(path), "GET", marketing), marketing + path, "public route " + path);
}
assert.equal(publicWebsiteRedirect(route("/blogs?lang=zh"), "GET", marketing), marketing + "/blogs?lang=zh");
assert.equal(publicWebsiteRedirect(route("/docs"), "POST", marketing), null, "never redirect non-GET methods");
assert.equal(publicWebsiteRedirect(route("/docs", marketing), "GET", marketing), null, "never redirect main website to itself");

for (const path of [
  "/", "/health", "/auth/login", "/auth/google", "/auth/google/callback",
  "/auth/email/request", "/oauth/authorize", "/oauth/consent", "/oauth/token",
  "/.well-known/oauth-authorization-server", "/mcp", "/agent", "/api/me",
  "/assets/app.js", "/device", "/hooks/automations/one/two",
]) {
  assert.equal(publicWebsiteRedirect(route(path), "GET", marketing), null, "system route must stay on app: " + path);
}
// Overview is intentionally public for signed-out visitors: it serves as a product preview.
assert.equal(dashboardSignInUrl(route("/overview"), "GET", app), null);
for (const path of ["/devices", "/automations", "/connect", "/security", "/settings", "/monitor"]) {
  assert.equal(dashboardSignInUrl(route(path), "GET", app), app + "/auth/login?return_to=" + encodeURIComponent(path));
}
assert.equal(dashboardSignInUrl(route("/automations?task=abc%2F123"), "GET", app), app + "/auth/login?return_to=" + encodeURIComponent("/automations?task=abc%2F123"));
assert.equal(dashboardSignInUrl(route("/overview"), "POST", app), null);
assert.equal(dashboardSignInUrl(route("/overview", marketing), "GET", app), null);
assert.equal(dashboardSignInUrl(route("/oauth/consent?client_id=abc"), "GET", app), null, "OAuth consent must not be rewritten");
console.log("PASS: website canonical redirects, signed-out dashboard routing, and OAuth/API isolation");
