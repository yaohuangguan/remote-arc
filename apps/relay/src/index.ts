import cliPackage from "../../../packages/cli/package.json" with { type: "json" };
import { handleDeviceTaskSettings } from "./device-task-settings.js";
import { handleTaskEventRpc, type TaskEventEnv } from "./task-events.js";
import { runScheduledTasks } from "./task-scheduler.js";
import { DeviceRegistry } from "./registry.js";
import { canonicalForPath, feedXml, llmsFullTxt, llmsTxt, marketingStatusCode, renderMarketingHtml, robotsTxt, sitemapXml } from "./seo.js";
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
import { handleEmailCodeRequest, handleEmailCodeVerify } from "./email-auth.js";
import { dashboardSignInUrl, publicWebsiteRedirect } from "./host-routing.js";
import {
  getDevicesForUser,
  handleDeviceList,
  handleDeviceRevoke,
  handleDeviceRename,
  handleDeviceStart,
  handleDeviceToken,
  handleDeviceToolsUpdate,
  handleDevicePolicyUpdate,
  handleDeviceUndoList,
  handleDeviceUndoAction,
  handleDeviceDirectoryBrowse,
  handleDeviceBackgroundUpdate,
  handleDeviceRuntimeUpdate,
  handleDeviceExecutionLog,
  handleDeviceManagedProcesses,
  handleDeviceManagedProcessOutput,
  handleDeviceManagedProcessStop,
  handlePairingApprove,
  handlePairingLookup,
} from "./device.js";
import { readAudit } from "./audit.js";
import { getMonthlyUsage } from "./usage.js";
import { getAccountEntitlements } from "./entitlements.js";
import { getMonthlyPlusUsage } from "./plus-usage.js";
import { handleFileResource } from "./file-resources.js";
import { handleAdminPlanGrantRevoke, handleAdminPlanGrants } from "./plan-admin.js";
import {
  handleAutomationCollection,
  handleAutomationItem,
  handleAutomationWebhook,
  runAutomationTick,
} from "./automations.js";
import {
  handleGrantRevoke,
  handleMcpPause,
  handleSecurityState,
  isMcpPaused,
} from "./security.js";
import {
  handleApprovalDecision,
  handleApprovalList,
  handleDeviceApprovalDecision,
  handleDeviceApprovalList,
} from "./approvals.js";
import {
  handleMonitorState,
  incidentFromRequest,
  recordServiceIncident,
  runSyntheticMonitor,
} from "./monitor.js";
import {
  authorizationServerMetadata,
  handleDynamicClientRegistration,
  handleOAuthAuthorize,
  handleOAuthDecision,
  handleOAuthToken,
  mcpUnauthorized,
  protectedResourceMetadata,
} from "./oauth.js";

export { DeviceRegistry };

type Env = TaskEventEnv & {
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
  RESEND_API_KEY?: string;
  EMAIL_AUTH_SECRET?: string;
  EMAIL_FROM?: string;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  OPENAI_APPS_CHALLENGE?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
  EMAIL?: {
    send(message: {
      to?: string;
      from: string;
      subject: string;
      text?: string;
      html?: string;
    }): Promise<unknown>;
  };
  ALERT_EMAIL?: string;
  ALERT_FROM_EMAIL?: string;
  MCP_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  AUTH_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  EMAIL_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
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

async function handleFetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const marketingOrigin = env.MARKETING_ORIGIN || "https://remotearc.app";
    const appOrigin = env.APP_ORIGIN || env.PUBLIC_ORIGIN;

    const authSensitive =
      url.pathname === "/oauth/register" ||
      url.pathname === "/oauth/authorize" ||
      url.pathname === "/oauth/decision" ||
      url.pathname === "/oauth/token" ||
      url.pathname === "/auth/reviewer" ||
      url.pathname === "/auth/email/request" ||
      url.pathname === "/auth/email/verify" ||
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

    if (url.hostname === "remotearc.app" && url.pathname.length > 1 && url.pathname.endsWith("/")) {
      const canonical = new URL(url.pathname.replace(/\/+$/, "") + url.search, marketingOrigin);
      return Response.redirect(canonical.toString(), 301);
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.hostname === "remotearc.app" && url.pathname === "/install") {
      return Response.redirect(new URL("/install/chatgpt", marketingOrigin).toString(), 301);
    }

    if (url.hostname === "remotearc.app" && (
      url.pathname === "/dashboard" ||
      url.pathname === "/overview" ||
      url.pathname === "/devices" ||
      url.pathname === "/automations" ||
      url.pathname === "/connect" ||
      url.pathname === "/security" ||
      url.pathname === "/settings" ||
      url.pathname === "/device" ||
      url.pathname === "/oauth/consent"
    )) {
      const nextPath = url.pathname === "/dashboard" ? "/overview" : url.pathname;
      return Response.redirect(new URL(nextPath + url.search, appOrigin).toString(), 302);
    }

    if (url.hostname === "mcp.remotearc.app" && (request.method === "GET" || request.method === "HEAD") &&
      (url.pathname === "/" || url.pathname === "/dashboard")) {
      return Response.redirect(new URL("/overview" + url.search, appOrigin).toString(), 302);
    }

    // Only the main domain serves product pages. Leave OAuth, MCP and API routes untouched.
    const websiteDestination = publicWebsiteRedirect(url, request.method, marketingOrigin);
    if (websiteDestination) return Response.redirect(websiteDestination, 301);

    // Keep /overview public as a real product preview, but sign in before
    // opening private dashboard tabs. Preserve the requested destination.
    const loginDestination = dashboardSignInUrl(url, request.method, appOrigin);
    if (loginDestination && !(await getSessionUser(request, env))) {
      return Response.redirect(loginDestination, 302);
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

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/resources") {
      return Response.redirect(new URL("/docs", url.origin).toString(), 301);
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
        version: cliPackage.version,
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

    if (url.pathname === "/oauth/decision" && request.method === "POST") {
      return handleOAuthDecision(request, env);
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

    if (url.pathname === "/auth/email/request" && request.method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "anonymous";
      const { success } = await env.EMAIL_RATE_LIMITER.limit({ key: "email-request:" + ip });
      if (!success) return new Response("Too many requests. Try again shortly.", { status: 429, headers: { "retry-after": "60" } });
      return handleEmailCodeRequest(request, env);
    }

    if (url.pathname === "/auth/email/verify" && request.method === "POST") {
      return handleEmailCodeVerify(request, env);
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

    const fileResource = url.pathname.match(/^\/file-resource\/([^/]+)$/);
    if (fileResource) {
      return handleFileResource(request, env, decodeURIComponent(fileResource[1]!));
    }

    const automationHook = url.pathname.match(/^\/hooks\/automations\/([^/]+)\/([^/]+)$/);
    if (automationHook) {
      return handleAutomationWebhook(
        request,
        env,
        decodeURIComponent(automationHook[1]!),
        decodeURIComponent(automationHook[2]!),
      );
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
      const plusUsage = await getMonthlyPlusUsage(env, user.id);
      const accountEntitlements = await getAccountEntitlements(env, user.id);
      return Response.json({
        googleConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        mcpEndpoint: (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp",
        devices,
        totalDevices: devices.length,
        onlineDevices: devices.filter((device) => device.status === "online").length,
        recentActivity: recent,
        usage,
        plusUsage,
        entitlements: {
          plan: accountEntitlements.plan,
          features: [...accountEntitlements.features],
        },
      });
    }

    if (url.pathname === "/api/monitor" && request.method === "GET") {
      return handleMonitorState(request, env);
    }

    if (url.pathname === "/api/admin/plan-grants") {
      return handleAdminPlanGrants(request, env);
    }

    const planGrantRevoke = url.pathname.match(/^\/api\/admin\/plan-grants\/([^/]+)\/revoke$/);
    if (planGrantRevoke) {
      return handleAdminPlanGrantRevoke(
        request,
        env,
        decodeURIComponent(planGrantRevoke[1]!),
      );
    }

    if (url.pathname === "/api/automations") {
      return handleAutomationCollection(request, env);
    }

    const automationApi = url.pathname.match(/^\/api\/automations\/([^/]+)(?:\/([^/]+))?$/);
    if (automationApi) {
      return handleAutomationItem(
        request,
        env,
        decodeURIComponent(automationApi[1]!),
        automationApi[2] ? decodeURIComponent(automationApi[2]) : undefined,
      );
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

    if (url.pathname === "/api/approvals" && request.method === "GET") {
      return handleApprovalList(request, env);
    }

    if (
      /^\/api\/approvals\/[^/]+\/decision$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleApprovalDecision(request, env);
    }

    if (
      url.pathname === "/api/device/approvals/pending" &&
      request.method === "GET"
    ) {
      return handleDeviceApprovalList(request, env);
    }

    if (
      /^\/api\/device\/approvals\/[^/]+\/decision$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceApprovalDecision(request, env);
    }

    if (url.pathname === "/api/device/heartbeat" && request.method === "POST") {
      const identity = await authenticateDevice(request, env);
      if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
      const heartbeat = (await request.json().catch(() => ({}))) as {
        background_enabled?: unknown;
        background_process?: unknown;
        background_service?: unknown;
      };
      const backgroundEnabled =
        typeof heartbeat.background_enabled === "boolean"
          ? heartbeat.background_enabled
          : null;
      const backgroundService =
        typeof heartbeat.background_service === "string" &&
        heartbeat.background_service.length <= 40
          ? heartbeat.background_service
          : null;
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE devices
         SET last_seen = ?1,
             background_enabled = COALESCE(?2, background_enabled),
             background_service = COALESCE(?3, background_service),
             background_seen_at = CASE WHEN ?2 IS NULL THEN background_seen_at ELSE ?1 END
         WHERE id = ?4 AND user_id = ?5 AND revoked_at IS NULL`,
      )
        .bind(
          now,
          backgroundEnabled === null ? null : backgroundEnabled ? 1 : 0,
          backgroundService,
          identity.id,
          identity.user_id,
        )
        .run();
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

    if (/^\/api\/devices\/[^/]+\/task-permissions$/.test(url.pathname) && request.method === "POST") {
      return handleDeviceTaskSettings(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/tools$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceToolsUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/policy$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDevicePolicyUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/directories$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceDirectoryBrowse(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/runtime$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceRuntimeUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/background$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceBackgroundUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/execution-log$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceExecutionLog(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/processes$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceManagedProcesses(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/processes\/[^/]+\/output$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceManagedProcessOutput(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/processes\/[^/]+\/stop$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceManagedProcessStop(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/undo$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceUndoList(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/undo\/[^/]+$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceUndoAction(request, env);
    }

    if (url.pathname === "/agent") {
      try {
        const identity = await authenticateDevice(request, env);
        if (!identity) {
          return new Response("Unauthorized device", { status: 401 });
        }

        return await env.REGISTRY
          .getByName("user:" + identity.user_id)
          .fetch(withTrustedDeviceHeaders(request, identity));
      } catch (error) {
        console.error("agent_connect_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return new Response("Relay temporarily unavailable", {
          status: 503,
          headers: {
            "retry-after": "2",
            "cache-control": "no-store",
          },
        });
      }
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

      const eventResponse = await handleTaskEventRpc(request, env, validIdentity);
      if (eventResponse) return eventResponse;
      const handler = createRemoteLinkMcp(env, validIdentity, {
        kickScheduler: (automationId) => {
          if (!ctx) return;
          ctx.waitUntil(
            runAutomationTick(env, new Date(), automationId).catch((error) => {
              console.warn("source_goal_scheduler_kick_failed", {
                error: error instanceof Error ? error.message : String(error),
              });
            }),
          );
        },
      });
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

    const isMarketingHost = url.hostname === "remotearc.app" || url.hostname === "www.remotearc.app";

    if (request.method === "GET" && url.pathname === "/robots.txt") {
      return new Response(isMarketingHost ? robotsTxt() : "User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (request.method === "GET" && isMarketingHost && url.pathname === "/sitemap.xml") {
      return new Response(sitemapXml(), {
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (request.method === "GET" && isMarketingHost && url.pathname === "/feed.xml") {
      return new Response(feedXml(), {
        headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (request.method === "GET" && isMarketingHost && url.pathname === "/llms.txt") {
      return new Response(llmsTxt(), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (request.method === "GET" && isMarketingHost && url.pathname === "/llms-full.txt") {
      return new Response(llmsFullTxt(), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    const marketingDocumentRequest =
      isMarketingHost &&
      request.method === "GET" &&
      !url.pathname.split("/").pop()?.includes(".");

    const acceptsHtml =
      marketingDocumentRequest ||
      request.headers.get("sec-fetch-mode") === "navigate" ||
      (request.headers.get("accept") || "").includes("text/html");

    if (acceptsHtml) {
      const assetHeaders = new Headers(request.headers);
      assetHeaders.set("authorization", "Bearer remote-arc-html-shell");
      assetHeaders.set("cache-control", "no-store");

      const assetResponse = await env.ASSETS.fetch(
        new Request(request, { headers: assetHeaders }),
      );
      const headers = new Headers(assetResponse.headers);
      headers.set("cache-control", "no-store");
      headers.set("cloudflare-cdn-cache-control", "no-store");
      headers.delete("etag");

      const html = await assetResponse.text();
      const rendered = isMarketingHost ? renderMarketingHtml(html, url.pathname) : html;

      if (!isMarketingHost) {
        headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      } else {
        const canonical = canonicalForPath(url.pathname);
        if (canonical) headers.set("link", "<" + canonical + '>; rel="canonical"');
        if (marketingStatusCode(url.pathname) === 404) {
          headers.set("x-robots-tag", "noindex, nofollow, noarchive");
        }
      }

      return new Response(rendered, {
        status: isMarketingHost ? marketingStatusCode(url.pathname) : assetResponse.status,
        statusText: isMarketingHost && marketingStatusCode(url.pathname) === 404 ? "Not Found" : assetResponse.statusText,
        headers,
      });
    }

    return env.ASSETS.fetch(request);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const response = await handleFetch(request, env, ctx);
      if (response.status >= 500) {
        ctx.waitUntil(
          recordServiceIncident(
            env,
            incidentFromRequest(request, {
              severity: response.status >= 503 ? "critical" : "error",
              kind: "http_5xx",
              statusCode: response.status,
              message: "Remote Arc returned HTTP " + response.status,
            }),
          ),
        );
      }
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("worker_unhandled_exception", { message });
      ctx.waitUntil(
        recordServiceIncident(
          env,
          incidentFromRequest(request, {
            severity: "critical",
            kind: "exception",
            statusCode: 500,
            message,
          }),
        ),
      );
      return Response.json(
        {
          error: "internal_error",
          message: "Remote Arc encountered an unexpected error.",
        },
        {
          status: 500,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    if (["* * * * *", "*/5 * * * *"].includes(controller.cron)) {
      ctx.waitUntil(runScheduledTasks(env, controller.cron));
    }
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(runSyntheticMonitor(env));
    }
  },
};
