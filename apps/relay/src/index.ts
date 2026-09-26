import { DeviceRegistry } from "./registry.js";
import { createRemoteLinkMcp } from "./mcp.js";
import {
  authenticateDevice,
  authenticateMcp,
  getSessionUser,
  handleGoogleCallback,
  handleGoogleLogin,
  handleLogout,
} from "./auth.js";
import { handleLoginPage, handleReviewerLogin } from "./reviewer.js";
import {
  getDevicesForUser,
  handleDeviceList,
  handleDeviceRevoke,
  handleDeviceRename,
  handleDeviceStart,
  handleDeviceToken,
  handleDeviceToolsUpdate,
  handlePairingApprove,
  handlePairingLookup,
} from "./device.js";
import { readAudit } from "./audit.js";
import { getMonthlyUsage } from "./usage.js";
import {
  handleGrantRevoke,
  handleMcpPause,
  handleSecurityState,
  isMcpPaused,
} from "./security.js";
import {
  authorizationServerMetadata,
  handleDynamicClientRegistration,
  handleOAuthAuthorize,
  handleOAuthToken,
  mcpUnauthorized,
  protectedResourceMetadata,
} from "./oauth.js";

export { DeviceRegistry };

type Env = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  ASSETS: Fetcher;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ALLOW_SIGNUPS?: string;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  OPENAI_APPS_CHALLENGE?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
  MCP_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  AUTH_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
};

function withTrustedDeviceHeaders(
  request: Request,
  identity: {
    id: string;
    user_id: string;
  },
) {
  const headers = new Headers(request.headers);
  headers.set("x-remote-link-user-id", identity.user_id);
  headers.set("x-remote-link-device-id", identity.id);
  return new Request(request, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const marketingOrigin = env.MARKETING_ORIGIN || "https://remotearc.app";
    const appOrigin = env.APP_ORIGIN || env.PUBLIC_ORIGIN;

    const authSensitive =
      url.pathname === "/oauth/register" ||
      url.pathname === "/oauth/authorize" ||
      url.pathname === "/oauth/token" ||
      url.pathname === "/auth/reviewer" ||
      url.pathname === "/api/device/start" ||
      url.pathname === "/api/device/token" ||
      url.pathname === "/api/pairing/approve";

    if (authSensitive) {
      const actor =
        url.searchParams.get("client_id") ||
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("user-agent") ||
        "anonymous";
      const { success } = await env.AUTH_RATE_LIMITER.limit({
        key: url.pathname + ":" + actor,
      });
      if (!success) {
        return Response.json(
          { error: "rate_limited", retry_after_seconds: 60 },
          { status: 429, headers: { "retry-after": "60" } },
        );
      }
    }

    if (url.hostname === "www.remotearc.app") {
      const canonical = new URL(url.pathname + url.search, marketingOrigin);
      return Response.redirect(canonical.toString(), 301);
    }

    if (url.hostname === "remotearc.app" && (
      url.pathname === "/dashboard" ||
      url.pathname === "/overview" ||
      url.pathname === "/devices" ||
      url.pathname === "/connect" ||
      url.pathname === "/security" ||
      url.pathname === "/settings" ||
      url.pathname === "/device" ||
      url.pathname === "/oauth/consent"
    )) {
      const nextPath = url.pathname === "/dashboard" ? "/overview" : url.pathname;
      return Response.redirect(new URL(nextPath + url.search, appOrigin).toString(), 302);
    }

    if (url.hostname === "mcp.remotearc.app" && url.pathname === "/dashboard") {
      return Response.redirect(new URL("/overview", appOrigin).toString(), 302);
    }

    if (url.hostname === "remotearc.app" && (
      url.pathname === "/mcp" ||
      url.pathname.startsWith("/oauth/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/.well-known/") ||
      url.pathname === "/agent"
    )) {
      return Response.redirect(new URL(url.pathname + url.search, appOrigin).toString(), 307);
    }

    if (
      url.hostname === "remote.samyao.me" &&
      !url.pathname.startsWith("/agent") &&
      !url.pathname.startsWith("/mcp") &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/.well-known/") &&
      !url.pathname.startsWith("/oauth/") &&
      !url.pathname.startsWith("/auth/") &&
      url.pathname !== "/health"
    ) {
      const canonical = new URL(url.pathname + url.search, env.PUBLIC_ORIGIN);
      return Response.redirect(canonical.toString(), 301);
    }

    if (url.pathname === "/.well-known/openai-apps-challenge") {
      if (!env.OPENAI_APPS_CHALLENGE) {
        return new Response("Not configured", { status: 404 });
      }
      return new Response(env.OPENAI_APPS_CHALLENGE, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "remotearc-relay",
        version: "0.3.4",
        auth: "oauth2-pkce",
      });
    }

    if (
      url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/.well-known/oauth-protected-resource/mcp"
    ) {
      return protectedResourceMetadata(env);
    }

    if (
      url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname === "/.well-known/openid-configuration"
    ) {
      return authorizationServerMetadata(env);
    }

    if (url.pathname === "/oauth/register" && request.method === "POST") {
      return handleDynamicClientRegistration(request, env);
    }

    if (url.pathname === "/oauth/authorize" && request.method === "GET") {
      return handleOAuthAuthorize(request, env);
    }

    if (url.pathname === "/oauth/token" && request.method === "POST") {
      return handleOAuthToken(request, env);
    }

    if (url.pathname === "/auth/login" && request.method === "GET") {
      return handleLoginPage(request, env);
    }

    if (url.pathname === "/auth/reviewer" && request.method === "POST") {
      return handleReviewerLogin(request, env);
    }

    if (url.pathname === "/auth/google" && request.method === "GET") {
      return handleGoogleLogin(request, env);
    }

    if (
      url.pathname === "/auth/google/callback" &&
      request.method === "GET"
    ) {
      return handleGoogleCallback(request, env);
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      return user
        ? Response.json({ authenticated: true, user })
        : Response.json({ authenticated: false }, { status: 401 });
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
      const devices = await getDevicesForUser(env, user.id);
      const recent = await readAudit(env, user.id, 8);
      const usage = await getMonthlyUsage(env, user.id);
      return Response.json({
        googleConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        mcpEndpoint: (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp",
        totalDevices: devices.length,
        onlineDevices: devices.filter((device) => device.status === "online").length,
        recentActivity: recent,
        usage,
      });
    }

    if (url.pathname === "/api/activity" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
      const limit = Number(url.searchParams.get("limit") || "20");
      return Response.json(await readAudit(env, user.id, limit));
    }

    if (url.pathname === "/api/security" && request.method === "GET") {
      return handleSecurityState(request, env);
    }

    if (url.pathname === "/api/security/mcp" && request.method === "POST") {
      return handleMcpPause(request, env);
    }

    if (
      /^\/api\/security\/grants\/[^/]+\/revoke$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleGrantRevoke(request, env);
    }

    if (url.pathname === "/api/device/heartbeat" && request.method === "POST") {
      const identity = await authenticateDevice(request, env);
      if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
      await env.DB.prepare(
        "UPDATE devices SET last_seen = ?1 WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL",
      ).bind(new Date().toISOString(), identity.id, identity.user_id).run();
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/device/start" && request.method === "POST") {
      return handleDeviceStart(request, env);
    }

    if (url.pathname === "/api/device/token" && request.method === "POST") {
      return handleDeviceToken(request, env);
    }

    if (url.pathname === "/api/pairing" && request.method === "GET") {
      return handlePairingLookup(request, env);
    }

    if (url.pathname === "/api/pairing/approve" && request.method === "POST") {
      return handlePairingApprove(request, env);
    }

    if (url.pathname === "/api/devices" && request.method === "GET") {
      return handleDeviceList(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/rename$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceRename(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/revoke$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceRevoke(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/tools$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceToolsUpdate(request, env);
    }

    if (url.pathname === "/agent") {
      const identity = await authenticateDevice(request, env);
      if (!identity) {
        return new Response("Unauthorized device", { status: 401 });
      }

      return env.REGISTRY
        .getByName("global")
        .fetch(withTrustedDeviceHeaders(request, identity));
    }

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      const identity = await authenticateMcp(request, env);
      const validIdentity =
        identity && identity.resource === (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp"
          ? identity
          : null;

      if (validIdentity) {
        const { success } = await env.MCP_RATE_LIMITER.limit({
          key: validIdentity.userId + ":" + validIdentity.clientId,
        });
        if (!success) {
          return Response.json(
            { error: "rate_limited", retry_after_seconds: 60 },
            { status: 429, headers: { "retry-after": "60" } },
          );
        }

        if (await isMcpPaused(env, validIdentity.userId)) {
          return Response.json(
            {
              error: "mcp_paused",
              message: "Remote MCP access is paused for this account.",
            },
            { status: 423 },
          );
        }
      }

      const handler = createRemoteLinkMcp(env, validIdentity);
      const response = await handler.fetch(request);

      // Keep the standard HTTP auth challenge on unauthenticated MCP failures
      // while allowing initialize/tools/list to succeed anonymously so
      // ChatGPT can discover per-tool securitySchemes and trigger linking.
      if (!validIdentity && response.status === 401) {
        return mcpUnauthorized(env);
      }

      return response;
    }

    if (url.pathname === "/api/debug/devices" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      if (!user) return new Response("Unauthorized", { status: 401 });
      return Response.json(await getDevicesForUser(env, user.id));
    }

    return env.ASSETS.fetch(request);
  },
};
