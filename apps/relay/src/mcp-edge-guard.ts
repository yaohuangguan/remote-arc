/** Before the OAuth/D1 lookup, enforce IP-scoped abuse budgets.
 * This DOES NOT replace zone WAF/DDoS rules, which act before Worker billing.
 */
export type TrafficLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type McpIngressEnv = {
  MCP_EDGE_RATE_LIMITER?: TrafficLimit;
  MCP_ANON_RATE_LIMITER?: TrafficLimit;
};

export async function limitMcpIngress(
  request: Request,
  env: McpIngressEnv,
): Promise<Response | null> {
  const edgeIp = request.headers.get("cf-connecting-ip");
  if (!edgeIp) return null; // Cloudflare sets it in production; local tests may not.
  if (env.MCP_EDGE_RATE_LIMITER) {
    const result = await env.MCP_EDGE_RATE_LIMITER.limit({ key: "mcp:" + edgeIp });
    if (!result.success) return Response.json({ error: "edge_rate_limited" }, {
      status: 429, headers: { "retry-after": "60", "cache-control": "no-store" },
    });
  }
  // Discovery/anonymous methods need a tighter budget. Any invalid Bearer
  // token still has to pass the outer per-IP budget before hitting D1.
  if (!request.headers.get("authorization")?.startsWith("Bearer ") &&
      env.MCP_ANON_RATE_LIMITER) {
    const result = await env.MCP_ANON_RATE_LIMITER.limit({ key: "anonymous:" + edgeIp });
    if (!result.success) return Response.json({ error: "anonymous_rate_limited" }, {
      status: 429, headers: { "retry-after": "60", "cache-control": "no-store" },
    });
  }
  return null;
}
