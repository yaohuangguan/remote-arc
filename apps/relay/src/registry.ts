import type {
  AgentCallMessage,
  AgentHelloMessage,
  AgentResultMessage,
  DeviceMetadata,
} from "@remote-link/protocol";

type Env = {
  REGISTRY: DurableObjectNamespace;
  AGENT_TOKEN: string;
  MCP_ACCESS_KEY: string;
};

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type SocketAttachment = {
  deviceId: string;
  device?: DeviceMetadata;
  tools?: string[];
};

export class DeviceRegistry {
  private pending = new Map<string, PendingCall>();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/agent") {
      return this.handleAgentConnect(request, url);
    }

    if (url.pathname === "/devices" && request.method === "GET") {
      return Response.json(this.listDevices());
    }

    if (url.pathname === "/call" && request.method === "POST") {
      return this.handleCall(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleAgentConnect(request: Request, url: URL): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const deviceId = url.searchParams.get("device");
    if (!deviceId) {
      return new Response("Missing device id", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment({ deviceId } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [deviceId]);

    return new Response(null, { status: 101, webSocket: client });
  }

  private listDevices() {
    return this.ctx.getWebSockets().map((socket) => {
      const attachment: SocketAttachment =
        (socket.deserializeAttachment() as SocketAttachment | null) || {
          deviceId: "unknown",
        };
      return {
        id: attachment.deviceId,
        ...(attachment.device || {}),
        tools: attachment.tools || [],
        status: "online",
      };
    });
  }

  private async handleCall(request: Request): Promise<Response> {
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

    const socket = this.ctx.getWebSockets(body.deviceId)[0];
    if (!socket) {
      return Response.json({ error: "device offline" }, { status: 404 });
    }

    const attachment: SocketAttachment =
      (socket.deserializeAttachment() as SocketAttachment | null) || {
        deviceId: body.deviceId,
      };
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
        { error: String((result as { __remoteLinkError: unknown }).__remoteLinkError) },
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
        (socket.deserializeAttachment() as SocketAttachment | null) || {
          deviceId: parsed.device.id,
        };

      socket.serializeAttachment({
        ...attachment,
        deviceId: parsed.device.id,
        device: {
          ...parsed.device,
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
