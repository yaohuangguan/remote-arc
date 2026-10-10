/** Non-blocking, sampled request telemetry. No usernames, IP addresses,
 * access tokens, device names, paths, or arguments enter Analytics Engine.
 * Query P95 from Analytics Engine; query D1 rows/latency from native D1 metrics.
 */
export type TelemetryEnv = {
  MCP_ANALYTICS?: AnalyticsEngineDataset;
  MCP_METRICS_SAMPLE_RATE?: string;
};
export function telemetrySampleRate(env: TelemetryEnv): number {
  const raw = Number(env.MCP_METRICS_SAMPLE_RATE ?? "0.1");
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
}
export function recordMcpTelemetry(
  env: TelemetryEnv,
  input: { status: number; durationMs: number; method: string; kind?: "mcp" | "device_tool"; outcome?: string },
  random = Math.random(),
): boolean {
  const binding = env.MCP_ANALYTICS;
  if (!binding) return false;
  const rate = telemetrySampleRate(env);
  // Always include errors and throttling, even if successful requests are sampled.
  const shouldRecord = input.status >= 400 || (rate > 0 && random < rate);
  if (!shouldRecord) return false;
  try {
    binding.writeDataPoint({
      indexes: ["mcp"],
      blobs: [
        input.kind ?? "mcp",
        input.kind === "device_tool" ? "TOOL" : input.method === "POST" ? "POST" : "OTHER",
        String(input.status),
        input.outcome ?? (input.status >= 500 ? "server_error" : input.status === 429 ? "throttled" :
          input.status >= 400 ? "client_error" : "ok"),
      ],
      doubles: [
        Math.max(0, input.durationMs),
        input.status >= 400 ? 1 : 1 / rate,
      ],
    });
    return true;
  } catch (error) {
    console.warn("mcp_metric_write_failed", { message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
