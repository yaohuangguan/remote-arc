import type {
  AgentCallMessage,
  AgentHelloMessage,
  AgentResultMessage,
  DeviceMetadata,
} from "@remote-link/protocol";

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
};

export class DeviceRegistry {
  private pending = new Map<string, PendingCall>();

  constructor(private readonly ctx: DurableObjectState) {}

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

    return new Response(null, { status: 101, webSocket: client });
  }

  private listDevices(request: Request) {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) return [];

    return this.ctx.getWebSockets("user:" + userId).map((socket) => {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) {
        return {
          id: "unknown",
          status: "online",
          tools: [],
        };
      }

      return {
        id: attachment.deviceId,
        ...(attachment.device || {}),
        tools: attachment.tools || [],
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
      deviceId?: string;
      tool?: string;
      arguments?: Record<string, unknown>;
    };

    if (!body.deviceId || !body.tool) {
      return Response.json(
        { error: "deviceId and tool are required" },
        { status: 400 },
      );
    }

    const socket = this.ctx.getWebSockets("device:" + body.deviceId)[0];
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

    const id = crypto.randomUUID();
    const message: AgentCallMessage = {
      type: "call",
      id,
      tool: body.tool,
      arguments: body.arguments || {},
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
