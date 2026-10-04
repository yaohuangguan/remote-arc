import type {
  AgentCallMessage,
  AgentHelloMessage,
  AgentResultMessage,
  DeviceMetadata,
} from "@remotearc/protocol";

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type SocketAttachment = {
  userId: string;
  deviceId: string;
  device?: DeviceMetadata;
  tools?: string[];
  capabilities?: string[];
};

export class DeviceRegistry {
  private pending = new Map<string, PendingCall>();

  constructor(private readonly ctx: DurableObjectState) {}

  private preferredSocket(sockets: WebSocket[]) {
    return [...sockets].sort((a, b) => {
      const left = a.deserializeAttachment() as SocketAttachment | null;
      const right = b.deserializeAttachment() as SocketAttachment | null;
      const leftPolicy = left?.capabilities?.includes("device_policy_v1") ? 1 : 0;
      const rightPolicy = right?.capabilities?.includes("device_policy_v1") ? 1 : 0;
      if (leftPolicy !== rightPolicy) return rightPolicy - leftPolicy;

      const leftTime = Date.parse(left?.device?.connectedAt || "") || 0;
      const rightTime = Date.parse(right?.device?.connectedAt || "") || 0;
      return rightTime - leftTime;
    })[0];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/agent") {
      return this.handleAgentConnect(request);
    }

    if (url.pathname === "/devices" && request.method === "GET") {
      return Response.json(this.listDevices(request));
    }

    if (url.pathname === "/call" && request.method === "POST") {
      return this.handleCall(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleAgentConnect(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const userId = request.headers.get("x-remote-link-user-id");
    const deviceId = request.headers.get("x-remote-link-device-id");
    if (!userId || !deviceId) {
      return new Response("Missing trusted device identity", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment({
      userId,
      deviceId,
    } satisfies SocketAttachment);

    this.ctx.acceptWebSocket(server, [
      "user:" + userId,
      "device:" + deviceId,
    ]);

    const requestedProtocols = (request.headers.get("sec-websocket-protocol") || "")
      .split(",")
      .map((value) => value.trim());

    const headers = new Headers();
    if (requestedProtocols.includes("remotearc")) {
      headers.set("sec-websocket-protocol", "remotearc");
    }

    return new Response(null, { status: 101, webSocket: client, headers });
  }

  private listDevices(request: Request) {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) return [];

    const byDevice = new Map<string, WebSocket[]>();
    for (const socket of this.ctx.getWebSockets("user:" + userId)) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.deviceId) continue;
      const sockets = byDevice.get(attachment.deviceId) || [];
      sockets.push(socket);
      byDevice.set(attachment.deviceId, sockets);
    }

    return Array.from(byDevice.entries()).map(([deviceId, sockets]) => {
      const socket = this.preferredSocket(sockets);
      const attachment =
        socket?.deserializeAttachment() as SocketAttachment | null;
      return {
        id: deviceId,
        ...(attachment?.device || {}),
        tools: attachment?.tools || [],
        capabilities: attachment?.capabilities || [],
        status: "online",
      };
    });
  }

  private async handleCall(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return Response.json({ error: "missing user identity" }, { status: 401 });
    }

    const body = (await request.json()) as {
      requestId?: string;
      deviceId?: string;
      tool?: string;
      arguments?: Record<string, unknown>;
      policy?: AgentCallMessage["policy"];
    };

    if (!body.deviceId || !body.tool) {
      return Response.json(
        { error: "deviceId and tool are required" },
        { status: 400 },
      );
    }

    const socket = this.preferredSocket(
      this.ctx.getWebSockets("device:" + body.deviceId),
    );
    if (!socket) {
      return Response.json({ error: "device offline" }, { status: 404 });
    }

    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;

    if (!attachment || attachment.userId !== userId) {
      return Response.json({ error: "device not found" }, { status: 404 });
    }

    const tools = attachment.tools || [];
    if (!tools.includes(body.tool)) {
      return Response.json(
        { error: `tool not available on device: ${body.tool}` },
        { status: 403 },
      );
    }

    const id =
      body.requestId && /^[0-9a-f-]{36}$/i.test(body.requestId)
        ? body.requestId
        : crypto.randomUUID();
    const message: AgentCallMessage = {
      type: "call",
      id,
      tool: body.tool,
      arguments: body.arguments || {},
      policy: body.policy,
    };

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("device call timed out"));
      }, 45_000);

      this.pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify(message));
    }).catch((error) => ({
      __remoteLinkError:
        error instanceof Error ? error.message : String(error),
    }));

    if (
      typeof result === "object" &&
      result !== null &&
      "__remoteLinkError" in result
    ) {
      return Response.json(
        {
          error: String(
            (result as { __remoteLinkError: unknown }).__remoteLinkError,
          ),
        },
        { status: 504 },
      );
    }

    return Response.json({ result });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    let parsed: AgentHelloMessage | AgentResultMessage;
    try {
      parsed = JSON.parse(message) as AgentHelloMessage | AgentResultMessage;
    } catch {
      return;
    }

    if (parsed.type === "hello") {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) return;

      socket.serializeAttachment({
        ...attachment,
        device: {
          ...parsed.device,
          id: attachment.deviceId,
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
        tools: parsed.tools,
        capabilities: parsed.capabilities || [],
      } satisfies SocketAttachment);
      return;
    }

    if (parsed.type === "result") {
      const pending = this.pending.get(parsed.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(parsed.id);

      if (parsed.error) {
        pending.reject(new Error(parsed.error));
      } else {
        pending.resolve(parsed.result);
      }
    }
  }

  webSocketClose(socket: WebSocket) {
    try {
      socket.close(1000, "closed");
    } catch {
      // ignore
    }
  }

  webSocketError(socket: WebSocket) {
    try {
      socket.close(1011, "error");
    } catch {
      // ignore
    }
  }
}
