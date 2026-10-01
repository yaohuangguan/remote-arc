
const SITE = "https://remotearc.app";

type ArticleBlock = { heading?: string; text: string };
type SeoPage = {
  title: string;
  description: string;
  canonical: string;
  type?: "website" | "article";
  author?: string;
  blocks?: ArticleBlock[];
};

function esc(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const articles: Record<string, SeoPage> = {
  "/blogs/why-i-built-remote-arc": {
    title: "Why I built Remote Arc: AI should reach your computer without owning it",
    description: "Why Remote Arc exists: controlled access from AI clients to real computers without surrendering the security boundary.",
    canonical: SITE + "/blogs/why-i-built-remote-arc",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "I spend a lot of time using AI tools, and I kept running into the same boundary: the model could explain what I should do, write the command I should run, or generate the patch I should apply — but the final mile was still mine. My files, terminals, repositories and development environments were sitting on real computers, while the AI was trapped behind a chat box." },
      { text: "That gap is what pushed me to build Remote Arc. The idea sounds simple: let an AI client reach a computer you own. The implementation is not simple at all, because the moment an AI can read files, edit code or run a command, the product stops being a convenience layer and becomes security-sensitive infrastructure." },
      { heading: "The goal was never full control.", text: "A lot of remote-agent products are marketed around how much control they can give an AI. I wanted to start from the opposite question: how little authority does the AI need in order to finish the job? Remote Arc therefore treats every computer as its own trust boundary." },
      { heading: "No public port. No VPN. No inbound listener.", text: "The local Remote Arc agent creates an outbound connection to the hosted relay. You pair the device explicitly, it receives its own revocable credential, and it can be removed independently later." },
      { heading: "MCP turned out to be the right interface.", text: "I did not want Remote Arc to be tied to one model vendor. MCP lets clearly described tools be discovered and called by compatible clients. The AI client can change while the paired computers and their permission model stay the same." },
      { heading: "The hardest part is not execution. It is trust.", text: "Running a command remotely is technically easy. Deciding when that command should be allowed, showing which machine will receive it, preserving useful audit metadata without turning the service into a content archive, and giving the user a reliable way to revoke access deserve most of the engineering attention." },
      { heading: "What I want Remote Arc to become", text: "I want connecting an AI to your own computer to feel as normal as connecting a calendar or code repository — but with controls that reflect how much more consequential a computer actually is. Installation should be simple. Permissions should be explicit. The AI client should be replaceable. And the user should always know where the boundary is." }
    ]
  },
  "/blogs/remote-arc-vs-openclaw": {
    title: "Remote Arc vs OpenClaw: two different layers of the AI stack",
    description: "Remote Arc and OpenClaw can both help AI act on computers, but they solve different layers: controlled remote execution versus a self-hosted assistant and agent gateway.",
    canonical: SITE + "/blogs/remote-arc-vs-openclaw",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "Remote Arc is sometimes compared with OpenClaw because both products can ultimately connect AI to a real computer. At a screenshot level the similarity is obvious: an AI asks for something, software on a machine receives the request, and something happens. But that is roughly where the architectural similarity ends." },
      { text: "OpenClaw describes itself as an open-source AI assistant that runs on your own hardware. Its Gateway owns conversations, channels, agent sessions and integrations. It can connect to chat platforms, host coding or agent runtimes, expose capabilities over MCP, and manage outbound MCP servers for its own runtimes." },
      { text: "Remote Arc intentionally stops earlier. It does not try to own the conversation, memory, model or agent loop. It gives an AI client you already chose — ChatGPT, Claude, Codex or another compatible MCP client — a controlled way to reach computers you explicitly paired." },
      { heading: "OpenClaw is an AI home. Remote Arc is an AI bridge.", text: "OpenClaw is a broader self-hosted assistant and gateway platform. Remote Arc is narrower: a remote computer execution layer with per-device skills, OAuth and a managed routing plane." },
      { heading: "The deployment philosophy is almost opposite.", text: "OpenClaw emphasizes that the assistant, state and Gateway can live on hardware you control. Remote Arc makes a different trade-off: the control plane is hosted so pairing, OAuth, discovery and routing work without you operating a public Gateway, while operating-system execution stays on the paired computer." },
      { heading: "Their relationship with MCP is different too.", text: "For Remote Arc, MCP is the primary product boundary exposed to AI clients. For OpenClaw, MCP is one interface among a wider set of agent, channel and runtime capabilities." },
      { heading: "They can actually complement each other.", text: "If you want a self-hosted personal assistant that owns channels, memory and agent sessions, OpenClaw solves a broader problem. If you already live in ChatGPT or Claude and mainly want those clients to reach real computers with explicit device permissions, Remote Arc is intentionally narrower. Because OpenClaw can consume remote MCP servers and Remote Arc exposes one, the two models can even meet." }
    ]
  },
  "/blogs/powerful-ai-access-without-exposing-your-computer": {
    title: "How Remote Arc keeps AI access powerful without exposing your computer",
    description: "How Remote Arc combines outbound-only connectivity, OAuth, per-device permissions, protected paths, local undo and audit metadata for controlled AI access.",
    canonical: SITE + "/blogs/powerful-ai-access-without-exposing-your-computer",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "An AI that can only tell you what command to run is safe but limited. An AI that can run every command everywhere is useful but reckless. Remote Arc is built around the space between those two extremes." },
      { heading: "1. Your computer never needs a public inbound port.", text: "The local Remote Arc agent establishes an outbound connection to the hosted control plane. Your router does not need port forwarding, your laptop does not need a public IP, and the machine does not sit on the internet waiting for arbitrary inbound connections." },
      { heading: "2. Pairing creates a device identity, not a shared master password.", text: "Every paired computer receives its own revocable credential. The hosted database stores only the credential hash, so a device can be revoked independently." },
      { heading: "3. OAuth controls the AI client separately from the device.", text: "A paired computer and an authorized AI client are two different trust relationships. Revoking an AI client does not require re-pairing the computer, and revoking a computer does not require changing every AI connection." },
      { heading: "4. Permission is per device, not one global agent switch.", text: "A work laptop, gaming PC and home server should not expose the same capabilities. Safe access can stay read-only, Developer access can add targeted file edits, and Full access can add terminal execution only where it is genuinely required." },
      { heading: "5. Sensitive paths and workspace roots reduce accidental reach.", text: "File-oriented workflows can be constrained to configured workspace roots and protected sensitive paths. These controls do not replace operating-system sandboxing once unrestricted terminal access is enabled, but they provide an important first boundary for normal AI file work." },
      { heading: "6. Supported edits can be undone locally.", text: "The local agent can keep a bounded undo snapshot on the device itself, providing a recovery path without turning the hosted service into a backup of your file contents." },
      { heading: "7. Audit metadata is useful without becoming content retention.", text: "Remote Arc records operational metadata such as tool, device, result and time while intentionally avoiding persistence of file contents, raw command arguments, OAuth tokens and raw device credentials." },
      { heading: "The important limitation: permissions are not magic.", text: "Once unrestricted terminal execution is explicitly enabled, the shell inherits the permissions of the local operating-system user. The honest security model is layered control plus explicit user choice, not pretending that powerful execution has no consequences." }
    ]
  },
  "/blogs/how-remote-arc-works": {
    title: "How Remote Arc works: Worker, Durable Objects, OAuth and the local agent",
    description: "A request-by-request walkthrough of Remote Arc architecture: Remote MCP, OAuth, Cloudflare Worker, D1, Durable Objects, the local agent and OS execution.",
    canonical: SITE + "/blogs/how-remote-arc-works",
    type: "article",
    author: "Sam Yao",
    blocks: [
      { text: "From the outside Remote Arc looks simple: connect an AI client, pair a computer, ask the AI to do something. Internally that request crosses several boundaries, and every boundary exists for a reason." },
      { heading: "Step 1: the AI client sees a Remote MCP server.", text: "ChatGPT, Claude or another compatible client connects to a single Remote Arc MCP URL. Tool discovery describes device discovery, file inspection, process inspection, file editing, managed processes, terminal execution and undo." },
      { heading: "Step 2: OAuth answers who the AI is acting for.", text: "OAuth establishes user identity, scopes and the client grant. Access tokens can be short-lived, refresh tokens can rotate, and a grant can be revoked without changing the paired-device credential." },
      { heading: "Step 3: the Cloudflare Worker is the control-plane entry point.", text: "The Worker handles MCP requests, OAuth endpoints, pairing APIs, account APIs and the web application. It authenticates requests, checks account and device policy, applies rate limits and decides whether a call may proceed." },
      { heading: "Step 4: D1 keeps durable identity and policy.", text: "D1 stores users, paired-device metadata, credential hashes, sessions, OAuth grants, per-device policy, security settings, usage counters and audit metadata. It is not the live transport for tool execution." },
      { heading: "Step 5: a per-user Durable Object owns live routing.", text: "Durable Objects coordinate WebSockets, track which paired devices are reachable and forward a tool call to exactly the selected connection." },
      { heading: "Step 6: the local agent is the final execution boundary.", text: "The local agent receives an authenticated routed request, checks what it actually exposes and executes the operation through Remote Arc local execution core. File operations, process inspection, terminal commands and undo terminate at the machine itself." },
      { heading: "Step 7: the result travels back, not the machine.", text: "The agent returns the specific tool result through the existing outbound connection. Remote Arc can therefore give AI useful access to local state without moving the entire development environment into a hosted VM." },
      { heading: "Why split control plane and execution plane?", text: "The hosted side is good at identity, discovery, routing, policy and availability. The local side is the only place that should own operating-system execution. Keeping those responsibilities separate is the core of the architecture." }
    ]
  }
};

const pages: Record<string, SeoPage> = {
  "/": { title: "Remote Arc — Secure remote computer access for AI", description: "Connect ChatGPT, Claude, Codex and compatible MCP clients to Windows, macOS and Linux computers you explicitly pair.", canonical: SITE + "/" },
  "/install": { title: "Install Remote Arc for ChatGPT, Claude and Cursor", description: "Install Remote Arc, pair your computer and connect your AI client through Remote MCP.", canonical: SITE + "/install/chatgpt" },
  "/install/chatgpt": { title: "Install Remote Arc for ChatGPT", description: "Connect ChatGPT to Windows, macOS or Linux through Remote Arc and a secure OAuth-protected Remote MCP endpoint.", canonical: SITE + "/install/chatgpt" },
  "/install/claude": { title: "Install Remote Arc for Claude", description: "Connect Claude to paired computers through Remote Arc using a secure Remote MCP connector and explicit device permissions.", canonical: SITE + "/install/claude" },
  "/install/cursor": { title: "Install Remote Arc for Cursor", description: "Use Remote Arc to give Cursor controlled access to paired Windows, macOS and Linux computers through MCP.", canonical: SITE + "/install/cursor" },
  "/pricing": { title: "Remote Arc Pricing — Hosted remote MCP for AI", description: "Start Remote Arc free with hosted MCP usage and add capacity when you need more.", canonical: SITE + "/pricing" },
  "/releases": { title: "Remote Arc Releases — Product version history", description: "Remote Arc release history from the first remote MCP prototype through durable automations, adaptive Agent Goals and cloud-side CI actions.", canonical: SITE + "/releases" },
  "/demo": { title: "Remote Arc Plugin Demo — ChatGPT to a real computer", description: "Watch a real Remote Arc demo showing ChatGPT connecting to a paired Mac, inspecting a Node.js project and running its tests.", canonical: SITE + "/demo" },
  "/docs": { title: "Remote Arc Documentation", description: "Install Remote Arc, connect an AI client, understand the permission model, public MCP tools, background jobs, Local Undo, architecture and data handling.", canonical: SITE + "/docs" },
  "/docs/long-running-work": { title: "Remote Arc Long-running Work — Overnight goals and scheduled tasks", description: "Learn how persistent goals, source agents, device task permissions, recovery and completion evidence support long-running work.", canonical: SITE + "/docs/long-running-work" },
  "/docs/mcp": { title: "Remote Arc MCP Reference", description: "Remote MCP reference for ChatGPT, Claude, Cursor and compatible AI clients.", canonical: SITE + "/docs/mcp" },
  "/connect-ai": { title: "Connect an AI client to Remote Arc", description: "Pair a computer, choose its device permissions, then connect ChatGPT, Claude, Cursor or another compatible MCP client through OAuth.", canonical: SITE + "/connect-ai" },
  "/security-model": { title: "Remote Arc Security and Trust Model", description: "Remote Arc trust boundaries, per-device skills, directory and sensitive-path controls, encrypted transport, data handling, Local Undo and revocation.", canonical: SITE + "/security-model" },
  "/resources": { title: "Remote Arc Resources — Architecture, security and MCP", description: "Technical resources for Remote Arc: architecture, OAuth, device permissions, edge protection and operational audit.", canonical: SITE + "/resources" },
  "/blogs": { title: "Remote Arc Blog", description: "Engineering notes, architecture decisions, security trade-offs and product reasoning from building Remote Arc.", canonical: SITE + "/blogs" },
  "/use-cases": { title: "Remote Arc Use Cases — Let AI work on your real computer", description: "Use Remote Arc for remote coding, file work, terminal workflows, device inspection and mobile-to-computer AI tasks.", canonical: SITE + "/use-cases" },
  "/chatgpt-computer-access": { title: "Give ChatGPT access to your computer with Remote Arc", description: "Connect ChatGPT to a real Windows, macOS or Linux computer with Remote Arc, Remote MCP, OAuth and per-device permissions.", canonical: SITE + "/chatgpt-computer-access" },
  "/privacy": { title: "Remote Arc Privacy Policy", description: "How Remote Arc handles account, device, usage and operational data.", canonical: SITE + "/privacy" },
  "/terms": { title: "Remote Arc Terms of Service", description: "Terms governing use of Remote Arc.", canonical: SITE + "/terms" },
  "/support": { title: "Remote Arc Support", description: "Help with installation, pairing, MCP connections and account access.", canonical: SITE + "/support" }
};

function blogIndexHtml() {
  const items = Object.entries(articles).map(function(entry) {
    return '<li><a href="' + entry[0] + '">' + esc(entry[1].title) + '</a> — Sam Yao</li>';
  }).join("");
  return '<main class="seo-blog-shell"><section><p class="seo-eyebrow">BLOG</p><h1>Remote Arc blog</h1><p>Engineering notes, architecture decisions, security trade-offs and product reasoning from building Remote Arc.</p><ol>' + items + '</ol></section></main>';
}

function articleHtml(page: SeoPage) {
  const blocks = (page.blocks || []).map(function(block) {
    return (block.heading ? '<h2>' + esc(block.heading) + '</h2>' : '') + '<p>' + esc(block.text) + '</p>';
  }).join("");
  return '<main class="seo-blog-shell"><article><p class="seo-eyebrow">REMOTE ARC BLOG</p><h1>' + esc(page.title) + '</h1><p class="seo-byline">Sam Yao · Creator of Remote Arc · 27 Sep 2026</p>' + blocks + '</article></main>';
}

function pageFor(pathname: string): SeoPage {
  return articles[pathname] ?? pages[pathname] ?? pages["/"]!;
}

function jsonLd(page: SeoPage) {
  if (page.type === "article") {
    return {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: page.title,
      description: page.description,
      datePublished: "2026-09-27",
      dateModified: "2026-09-27",
      author: { "@type": "Person", name: page.author || "Sam Yao" },
      publisher: { "@type": "Organization", name: "Remote Arc", url: SITE, logo: { "@type": "ImageObject", url: SITE + "/remote-arc.svg" } },
      mainEntityOfPage: page.canonical
    };
  }
  if (page.canonical === SITE + "/") {
    return [
      { "@context": "https://schema.org", "@type": "Organization", name: "Remote Arc", url: SITE, logo: SITE + "/remote-arc.svg", sameAs: ["https://github.com/yaohuangguan/remote-arc"] },
      { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Remote Arc", applicationCategory: "DeveloperApplication", operatingSystem: "Windows, macOS, Linux", url: SITE, description: page.description, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      { "@context": "https://schema.org", "@type": "WebSite", name: "Remote Arc", url: SITE }
    ];
  }
  return { "@context": "https://schema.org", "@type": "WebPage", name: page.title, description: page.description, url: page.canonical, isPartOf: { "@type": "WebSite", name: "Remote Arc", url: SITE } };
}

export function renderMarketingHtml(html: string, pathname: string) {
  const page = pageFor(pathname);
  const structured = JSON.stringify(jsonLd(page)).replaceAll("<", "\\u003c");
  const extra = '<meta property="og:type" content="' + (page.type === "article" ? "article" : "website") + '" />' +
    '<meta name="twitter:card" content="summary_large_image" />' +
    '<meta name="twitter:title" content="' + esc(page.title) + '" />' +
    '<meta name="twitter:description" content="' + esc(page.description) + '" />' +
    '<script type="application/ld+json">' + structured + '</script>';

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(page.title) + '</title>')
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(page.description) + '" />')
    .replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="' + esc(page.canonical) + '" />')
    .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + esc(page.title) + '" />')
    .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + esc(page.description) + '" />')
    .replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="' + esc(page.canonical) + '" />')
    .replace("</head>", extra + "</head>");

  if (pathname === "/blogs") {
    html = html.replace('<div id="root"></div>', '<div id="root">' + blogIndexHtml() + '</div>');
  } else if (articles[pathname]) {
    html = html.replace('<div id="root"></div>', '<div id="root">' + articleHtml(page) + '</div>');
  }
  return html;
}

export function sitemapXml() {
  const paths = ["/","/install/chatgpt","/install/claude","/install/cursor","/connect-ai","/docs","/docs/long-running-work","/security-model","/pricing","/releases","/demo","/docs/mcp","/resources","/blogs","/blogs/why-i-built-remote-arc","/blogs/remote-arc-vs-openclaw","/blogs/powerful-ai-access-without-exposing-your-computer","/blogs/how-remote-arc-works","/use-cases","/chatgpt-computer-access","/privacy","/terms","/support"];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map(function(path) {
      return '<url><loc>' + SITE + path + '</loc><lastmod>2026-10-01</lastmod><changefreq>' + (path === "/" ? "weekly" : "monthly") + '</changefreq><priority>' + (path === "/" ? "1.0" : "0.8") + '</priority></url>';
    }).join("") + '</urlset>';
}

export function robotsTxt() {
  return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /oauth/\nDisallow: /auth/\nDisallow: /device\nDisallow: /dashboard\nDisallow: /overview\nDisallow: /devices\nDisallow: /connect\nDisallow: /settings\nDisallow: /security\n\nSitemap: " + SITE + "/sitemap.xml\n";
}
