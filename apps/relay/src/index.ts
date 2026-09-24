import { DeviceRegistry } from "./registry.js";
import { createRemoteLinkMcp } from "./mcp.js";

export { DeviceRegistry };

type Env = {
  REGISTRY: DurableObjectNamespace;
  AGENT_TOKEN: string;
  MCP_ACCESS_KEY: string;
};

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

function accessKeyFromPath(pathname: string) {
  const match = pathname.match(/^\/mcp\/([^/]+)\/?$/);
  return match?.[1] || "";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "remote-link-relay",
        version: "0.1.0",
      });
    }

    if (url.pathname === "/agent") {
      if (bearerToken(request) !== env.AGENT_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }

      return env.REGISTRY.getByName("global").fetch(request);
    }

    if (url.pathname === "/api/devices") {
      const key =
        url.searchParams.get("key") || request.headers.get("x-remote-link-key");
      if (key !== env.MCP_ACCESS_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      return env.REGISTRY
        .getByName("global")
        .fetch("https://registry/devices");
    }

    const mcpAccessKey = accessKeyFromPath(url.pathname);
    if (mcpAccessKey) {
      if (mcpAccessKey !== env.MCP_ACCESS_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      const handler = createRemoteLinkMcp(env);
      return handler.fetch(request);
    }

    return new Response(
      [
        "Remote Link relay",
        "",
        "Health: /health",
        "MCP: /mcp/<private-access-key>",
      ].join("\n"),
      {
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  },
};
