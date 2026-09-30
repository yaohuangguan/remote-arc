type PreviewEnv = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

const isSpaNavigation = (request: Request) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const url = new URL(request.url);
  const segment = url.pathname.split("/").filter(Boolean).pop() || "";
  return !segment.includes(".");
};

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404 || !isSpaNavigation(request)) {
      return asset;
    }

    const indexUrl = new URL("/", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
