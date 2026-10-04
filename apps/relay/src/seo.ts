
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
  "/": { title: "Remote Arc — Remote Computer Access for AI via MCP", description: "Connect ChatGPT, Claude, Cursor and compatible MCP clients to paired Windows, macOS and Linux computers with explicit per-device permissions.", canonical: SITE + "/" },
  "/install": { title: "Install Remote Arc for ChatGPT, Claude and Cursor", description: "Install Remote Arc, pair your computer and connect your AI client through Remote MCP.", canonical: SITE + "/install/chatgpt" },
  "/install/chatgpt": { title: "Install Remote Arc for ChatGPT", description: "Connect ChatGPT to Windows, macOS or Linux through Remote Arc and a secure OAuth-protected Remote MCP endpoint.", canonical: SITE + "/install/chatgpt" },
  "/install/claude": { title: "Install Remote Arc for Claude", description: "Connect Claude to paired computers through Remote Arc using a secure Remote MCP connector and explicit device permissions.", canonical: SITE + "/install/claude" },
  "/install/cursor": { title: "Install Remote Arc for Cursor", description: "Use Remote Arc to give Cursor controlled access to paired Windows, macOS and Linux computers through MCP.", canonical: SITE + "/install/cursor" },
  "/pricing": { title: "Remote Arc Pricing — Hosted remote MCP for AI", description: "Start free with 10,000 monthly hosted MCP tool calls. Understand account usage, separate AI subscriptions and current capacity availability.", canonical: SITE + "/pricing" },
  "/releases": { title: "Remote Arc Releases — Product version history", description: "Remote Arc release history from the first remote MCP prototype through durable automations, adaptive Agent Goals and cloud-side CI actions.", canonical: SITE + "/releases" },
  "/demo": { title: "Remote Arc Plugin Demo — ChatGPT to a real computer", description: "Watch a real Remote Arc demo showing ChatGPT connecting to a paired Mac, inspecting a Node.js project and running its tests.", canonical: SITE + "/demo" },
  "/docs": { title: "Remote Arc Docs — Remote MCP & Computer Access", description: "Set up Remote Arc, connect AI clients, understand device permissions, MCP tools, long-running work, restart recovery, scheduling, isolation and task data.", canonical: SITE + "/docs" },
  "/docs/long-running-work": { title: "Remote Arc Long-running Work — Overnight goals and scheduled tasks", description: "Learn how persistent goals, source agents, device task permissions, recovery and completion evidence support long-running work.", canonical: SITE + "/docs/long-running-work" },
  "/docs/mcp": { title: "Remote Arc MCP Reference — OAuth, Tools & Browser", description: "Remote MCP connection, OAuth scopes, device tools, source-goal decisions, conditional task events and browser companion setup for Remote Arc.", canonical: SITE + "/docs/mcp" },
  "/connect-ai": { title: "Connect an AI client to Remote Arc", description: "Pair a computer, choose its device permissions, then connect ChatGPT, Claude, Cursor or another compatible MCP client through OAuth.", canonical: SITE + "/connect-ai" },
  "/security-model": { title: "Remote Arc Security and Trust Model", description: "Remote Arc trust boundaries, per-device skills, directory and sensitive-path controls, encrypted transport, data handling, Local Undo and revocation.", canonical: SITE + "/security-model" },
  "/blogs": { title: "Remote Arc Blog", description: "Engineering notes, architecture decisions, security trade-offs and product reasoning from building Remote Arc.", canonical: SITE + "/blogs" },
  "/use-cases": { title: "Remote Arc Use Cases — Let AI work on your real computer", description: "Explore ten workflows for coding, file organization, overnight goals, long jobs, scheduled checks, CI follow-up, data, diagnostics and browser context.", canonical: SITE + "/use-cases" },
  "/chatgpt-computer-access": { title: "ChatGPT Computer Access via Remote MCP — Remote Arc", description: "Connect ChatGPT to a real Windows, macOS or Linux computer through Remote MCP, OAuth and explicit per-device permissions.", canonical: SITE + "/chatgpt-computer-access" },
  "/claude-computer-access": { title: "Claude Computer Access via Remote MCP — Remote Arc", description: "Connect Claude to explicitly paired Windows, macOS and Linux computers through Remote MCP, OAuth and per-device permissions.", canonical: SITE + "/claude-computer-access" },
  "/mcp-computer-access": { title: "MCP Computer Access for AI Agents — Remote Arc", description: "Use a hosted Remote MCP bridge to give compatible AI clients controlled access to files, processes, browser tabs and approved commands on paired computers.", canonical: SITE + "/mcp-computer-access" },
  "/privacy": { title: "Remote Arc Privacy Policy", description: "How Remote Arc handles account, device, usage and operational data.", canonical: SITE + "/privacy" },
  "/terms": { title: "Remote Arc Terms of Service", description: "Terms governing use of Remote Arc.", canonical: SITE + "/terms" },
  "/support": { title: "Remote Arc Support", description: "Help with installation, pairing, MCP connections and account access.", canonical: SITE + "/support" }
};

const useCaseSeo: Record<string, [string, string]> = {
  "file-organization": ["Organize files with a reviewed move plan", "Inspect a folder, review destinations and collisions, then execute an authorized move plan with a before/after manifest."],
  "remote-development": ["Fix a project on your own computer", "Inspect, edit and test the existing checkout using Remote Arc device tools and explicit permissions."],
  "overnight-goals": ["Leave a verifiable Agent Goal", "Save an adaptive goal with success criteria, a continuing controller, evidence and bounded limits."],
  "long-running-jobs": ["Track a long build, export or script", "Save a Long Task, follow its outcome after chat ends and understand process-handle recovery."],
  "scheduled-checks": ["Schedule a check or recurring goal", "Understand future starts, completion-based intervals, per-run results and device availability."],
  "ci-follow-up": ["Run an authorized CI follow-up", "Use a Condition Watch with explicit event matching, authorized actions and recorded outcomes."],
  "data-work": ["Process data in your local environment", "Use installed runtimes to analyze local files, validate results and understand task-data handling."],
  "home-lab": ["Inspect a headless host", "Inspect logs and services through an outbound device connection without opening an inbound Remote Arc port."],
  "browser-research": ["Work with explicitly shared browser tabs", "Read text, selections, links and tables, then optionally enable scoped click and fill on individual shared Chrome tabs."],
  "remote-support": ["Diagnose an authorized computer", "Read real logs and processes while keeping diagnosis and repair authorization separate."],
};
for (const [slug, [title, description]] of Object.entries(useCaseSeo)) {
  const path = "/use-cases/" + slug;
  pages[path] = { title: title + " — Remote Arc", description, canonical: SITE + path };
}

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

type CrawlSection = { heading: string; text: string };
type CrawlPage = {
  h1: string;
  intro: string;
  sections?: CrawlSection[];
  links?: Array<[string, string]>;
};

const crawlPages: Record<string, CrawlPage> = {
  "/": {
    h1: "Remote computer access for AI through MCP",
    intro: "Remote Arc connects ChatGPT, Claude, Cursor and other compatible AI clients to Windows, macOS and Linux computers that you explicitly pair.",
    sections: [
      { heading: "Use the computer where the work already lives", text: "Your repositories, files, runtimes and command-line tools stay on your own machine. Remote Arc provides a controlled Remote MCP path for reading, editing and running approved work there." },
      { heading: "Separate AI authorization from device permission", text: "OAuth authorizes the AI client. Each paired computer separately controls which tools, workspace roots, sensitive paths and long-running task capabilities are available." },
      { heading: "No inbound Remote Arc port", text: "The local agent establishes an outbound connection to the hosted control plane, so normal setup does not require exposing a Remote Arc listener on your router or machine." }
    ],
    links: [["/install/chatgpt", "Install for ChatGPT"], ["/install/claude", "Install for Claude"], ["/mcp-computer-access", "MCP computer access"], ["/security-model", "Security model"], ["/docs", "Documentation"]]
  },
  "/install/chatgpt": {
    h1: "Install Remote Arc for ChatGPT",
    intro: "Pair a computer, connect ChatGPT to the Remote Arc MCP endpoint, complete OAuth and choose the capabilities that ChatGPT may use on that device.",
    sections: [
      { heading: "1. Pair the computer", text: "Run npx remotelink on Windows, macOS or Linux and approve the short-lived pairing request in your Remote Arc account." },
      { heading: "2. Add the Remote MCP connection", text: "Connect ChatGPT to https://mcp.remotearc.app/mcp and complete Remote Arc OAuth when your ChatGPT account supports the required MCP app path." },
      { heading: "3. Keep permissions explicit", text: "Start with read access. Enable editing, terminal execution, browser interaction or long-running work only where the task and device require them." }
    ],
    links: [["/chatgpt-computer-access", "How ChatGPT computer access works"], ["/docs/mcp", "MCP reference"], ["/security-model", "Security model"]]
  },
  "/install/claude": {
    h1: "Install Remote Arc for Claude",
    intro: "Connect Claude to a paired computer through a remote MCP connector while keeping device permissions and operating-system execution on the computer you control.",
    sections: [
      { heading: "Pair once", text: "Run npx remotelink on the target computer and approve the device in Remote Arc." },
      { heading: "Connect Claude", text: "Add the Remote Arc Remote MCP endpoint to Claude, complete OAuth and then ask Claude to work with the paired device." },
      { heading: "Control the boundary per device", text: "A development workstation can expose editing and terminal tools while another computer remains read-only." }
    ],
    links: [["/claude-computer-access", "How Claude computer access works"], ["/docs/mcp", "MCP reference"], ["/security-model", "Security model"]]
  },
  "/install/cursor": {
    h1: "Install Remote Arc for Cursor",
    intro: "Use Remote Arc as a remote HTTP MCP server so Cursor can reach approved files, processes and tools on paired computers.",
    sections: [
      { heading: "Pair the target computer", text: "Run npx remotelink and approve the device before connecting Cursor." },
      { heading: "Install the MCP connection", text: "Add Remote Arc to Cursor using the remote MCP configuration and complete OAuth." },
      { heading: "Limit what Cursor can reach", text: "Configure device tools, workspace roots and sensitive-path rules so the connection exposes only the capabilities needed for the project." }
    ],
    links: [["/docs/mcp", "MCP reference"], ["/use-cases/remote-development", "Remote development workflow"], ["/security-model", "Security model"]]
  },
  "/chatgpt-computer-access": {
    h1: "Give ChatGPT access to your computer through Remote MCP",
    intro: "Remote Arc gives ChatGPT a controlled route to a real Windows, macOS or Linux computer without sharing an operating-system password or opening a Remote Arc inbound port.",
    sections: [
      { heading: "ChatGPT sees tools, not a raw desktop login", text: "The MCP connection exposes named capabilities such as file inspection, file editing and managed commands according to the policy of the selected device." },
      { heading: "Your computer remains a separate trust boundary", text: "The device can be read-only, developer-oriented or terminal-enabled. Workspace roots, protected paths and Local Undo add narrower controls for supported file workflows." }
    ],
    links: [["/install/chatgpt", "Install for ChatGPT"], ["/mcp-computer-access", "MCP computer access"], ["/security-model", "Security model"]]
  },
  "/claude-computer-access": {
    h1: "Give Claude controlled access to your computer through Remote MCP",
    intro: "Remote Arc connects Claude to explicitly paired Windows, macOS and Linux computers through an OAuth-protected remote MCP endpoint.",
    sections: [
      { heading: "Remote connector, local execution", text: "Claude connects to Remote Arc over MCP while file and command execution still terminates on the paired computer through the local agent." },
      { heading: "Device permissions stay independent", text: "Changing AI clients does not change the computer policy. Tool access, workspace scope, sensitive paths and revocation remain attached to the paired device and account." }
    ],
    links: [["/install/claude", "Install for Claude"], ["/mcp-computer-access", "MCP computer access"], ["/security-model", "Security model"]]
  },
  "/mcp-computer-access": {
    h1: "Remote MCP computer access for AI agents",
    intro: "Remote Arc is a hosted Remote MCP bridge that lets compatible AI clients discover and invoke approved capabilities on computers you pair.",
    sections: [
      { heading: "Why remote MCP instead of a public local server", text: "AI clients connect to one hosted MCP endpoint while each computer makes an outbound device connection. The computer does not need to host a publicly reachable MCP listener." },
      { heading: "What the MCP tools can cover", text: "Depending on device policy, Remote Arc can expose file and directory inspection, supported file edits, process inspection, managed commands, local undo, browser tab context and durable task controls." },
      { heading: "Where the security boundary lives", text: "OAuth controls the AI client and per-device policy controls the computer. Terminal execution, when enabled, still inherits the permissions of the local operating-system user." }
    ],
    links: [["/docs/mcp", "Remote MCP reference"], ["/install/chatgpt", "ChatGPT setup"], ["/install/claude", "Claude setup"], ["/security-model", "Security model"]]
  },
  "/docs": {
    h1: "Remote Arc documentation",
    intro: "Technical documentation for pairing devices, connecting AI clients, choosing permissions, understanding data flow and running bounded long-running work.",
    links: [["/docs/mcp", "MCP reference"], ["/docs/long-running-work", "Long-running work"], ["/security-model", "Security model"], ["/use-cases", "Use cases"]]
  },
  "/docs/mcp": {
    h1: "Remote Arc Remote MCP reference",
    intro: "Reference for the Remote Arc MCP endpoint, OAuth authorization, device discovery, file and process tools, browser capabilities, task controls and client integration.",
    links: [["/mcp-computer-access", "MCP computer access overview"], ["/install/chatgpt", "ChatGPT setup"], ["/install/claude", "Claude setup"], ["/security-model", "Security model"]]
  },
  "/docs/long-running-work": {
    h1: "Long-running AI work on your own computer",
    intro: "Understand saved goals, bounded command slices, verification, recovery, scheduled work and the limits of continuing a task after a chat turn ends.",
    links: [["/use-cases/overnight-goals", "Overnight goals"], ["/use-cases/long-running-jobs", "Long-running jobs"], ["/pricing", "Pricing"]]
  },
  "/security-model": {
    h1: "Remote Arc security and trust model",
    intro: "Remote Arc separates AI-client authorization, hosted routing and local operating-system execution so each paired computer can keep its own explicit capability boundary.",
    sections: [
      { heading: "Outbound device connection", text: "The local agent connects outward to the hosted relay rather than requiring a normal inbound Remote Arc port." },
      { heading: "Per-device capability policy", text: "Read, edit, terminal, browser and long-running task capabilities can be controlled separately, with workspace and sensitive-path policy for file-oriented work." },
      { heading: "Revocation and recovery", text: "AI grants and paired devices can be revoked independently. Supported file edits can use local snapshots for conflict-aware undo when enabled." }
    ],
    links: [["/docs", "Documentation"], ["/docs/mcp", "MCP reference"], ["/privacy", "Privacy"]]
  },
  "/use-cases": {
    h1: "Remote Arc use cases",
    intro: "Practical workflows for remote development, file organization, long-running jobs, scheduled checks, CI follow-up, data work, home-lab diagnostics, browser context and remote support.",
    links: [["/use-cases/remote-development", "Remote development"], ["/use-cases/overnight-goals", "Overnight goals"], ["/use-cases/browser-research", "Browser research"], ["/use-cases/home-lab", "Home lab"]]
  },
  "/pricing": {
    h1: "Remote Arc pricing",
    intro: "Use the hosted Remote MCP control plane with a free account, then add paid capabilities for heavier or longer-running workflows as they become available.",
    links: [["/docs", "Documentation"], ["/install/chatgpt", "Get started"], ["/security-model", "Security model"]]
  },
  "/blogs": {
    h1: "Remote Arc blog",
    intro: "Engineering notes, architecture decisions, security trade-offs and product reasoning from building a controlled Remote MCP bridge to real computers."
  },
  "/releases": {
    h1: "Remote Arc release history",
    intro: "Product changes across device access, MCP tooling, browser capabilities, security controls, task persistence and the hosted control plane.",
    links: [["/docs", "Documentation"], ["/blogs", "Engineering blog"]]
  },
  "/demo": {
    h1: "Remote Arc demo",
    intro: "See the shape of a Remote Arc session from an AI request through the hosted MCP control plane to a paired computer and back.",
    links: [["/install/chatgpt", "Install for ChatGPT"], ["/security-model", "Security model"]]
  },
  "/connect-ai": {
    h1: "Connect an AI client to Remote Arc",
    intro: "Pair a computer first, then connect ChatGPT, Claude, Cursor or another compatible MCP client through OAuth.",
    links: [["/install/chatgpt", "ChatGPT"], ["/install/claude", "Claude"], ["/install/cursor", "Cursor"], ["/docs/mcp", "MCP reference"]]
  },
  "/privacy": {
    h1: "Remote Arc privacy policy",
    intro: "How Remote Arc handles account, device, usage and operational data across the hosted control plane and paired-device workflows."
  },
  "/terms": {
    h1: "Remote Arc terms of service",
    intro: "Terms governing access to and use of Remote Arc."
  },
  "/support": {
    h1: "Remote Arc support",
    intro: "Help with installation, device pairing, Remote MCP connections, account access and security reporting.",
    links: [["/docs", "Documentation"], ["/install/chatgpt", "ChatGPT setup"], ["/security-model", "Security"]]
  }
};

for (const [slug, [title, description]] of Object.entries(useCaseSeo)) {
  const path = "/use-cases/" + slug;
  crawlPages[path] = {
    h1: title,
    intro: description,
    links: [["/use-cases", "All use cases"], ["/docs", "Documentation"], ["/security-model", "Security model"]]
  };
}

function pageFor(pathname: string): SeoPage | null {
  return articles[pathname] ?? pages[pathname] ?? null;
}

export function isKnownMarketingPath(pathname: string) {
  return Boolean(pageFor(pathname));
}

export function marketingStatusCode(pathname: string) {
  return isKnownMarketingPath(pathname) ? 200 : 404;
}

export function canonicalForPath(pathname: string) {
  return pageFor(pathname)?.canonical ?? null;
}

function breadcrumbItems(pathname: string, page: SeoPage) {
  if (pathname === "/") return [];
  const parts = pathname.split("/").filter(Boolean);
  const items = [{ "@type": "ListItem", position: 1, name: "Remote Arc", item: SITE + "/" }];
  let current = "";
  parts.forEach((part, index) => {
    current += "/" + part;
    const currentPage = pageFor(current);
    const fallbackName = part.replaceAll("-", " ").replace(/\b\w/g, c => c.toUpperCase());
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: index === parts.length - 1 ? page.title : (currentPage?.title ?? fallbackName),
      item: index === parts.length - 1 ? page.canonical : (currentPage?.canonical ?? SITE + current)
    });
  });
  return items;
}

function howToSchema(pathname: string, page: SeoPage) {
  const copy = crawlPages[pathname];
  if (!copy?.sections?.length) return null;
  return {
    "@type": "HowTo",
    name: copy.h1,
    description: copy.intro,
    step: copy.sections.map((section, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: section.heading,
      text: section.text,
      url: page.canonical + "#step-" + (index + 1)
    }))
  };
}

function jsonLd(page: SeoPage, pathname: string) {
  const graph: unknown[] = [
    {
      "@type": "Organization",
      "@id": SITE + "/#organization",
      name: "Remote Arc",
      url: SITE,
      logo: { "@type": "ImageObject", url: SITE + "/remote-arc-512.png", width: 512, height: 512 },
      sameAs: ["https://github.com/yaohuangguan/remote-arc"]
    },
    {
      "@type": "WebSite",
      "@id": SITE + "/#website",
      name: "Remote Arc",
      url: SITE,
      publisher: { "@id": SITE + "/#organization" },
      inLanguage: "en"
    }
  ];

  if (page.type === "article") {
    graph.push({
      "@type": "TechArticle",
      "@id": page.canonical + "#article",
      headline: page.title,
      description: page.description,
      datePublished: "2026-09-27",
      dateModified: "2026-09-27",
      author: { "@type": "Person", name: page.author || "Sam Yao" },
      publisher: { "@id": SITE + "/#organization" },
      mainEntityOfPage: page.canonical,
      image: SITE + "/demos/connect-workflow-poster.webp",
      inLanguage: "en"
    });
  } else if (pathname === "/") {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": SITE + "/#software",
      name: "Remote Arc",
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "Remote MCP computer access",
      operatingSystem: "Windows, macOS, Linux",
      url: SITE,
      description: page.description,
      publisher: { "@id": SITE + "/#organization" },
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Remote MCP computer access",
        "Per-device tool permissions",
        "Workspace and sensitive-path controls",
        "File inspection and supported edits",
        "Managed command execution",
        "Browser tab context",
        "Local undo for supported edits",
        "Long-running task controls"
      ]
    });
  } else if (pathname === "/blogs") {
    graph.push({ "@type": "CollectionPage", name: page.title, description: page.description, url: page.canonical, isPartOf: { "@id": SITE + "/#website" } });
  } else if (pathname === "/use-cases") {
    graph.push({ "@type": "CollectionPage", name: page.title, description: page.description, url: page.canonical, isPartOf: { "@id": SITE + "/#website" } });
  } else if (pathname.startsWith("/docs") || pathname === "/security-model" || pathname === "/mcp-computer-access") {
    graph.push({
      "@type": "TechArticle",
      headline: page.title,
      description: page.description,
      url: page.canonical,
      author: { "@type": "Organization", name: "Remote Arc" },
      publisher: { "@id": SITE + "/#organization" },
      inLanguage: "en"
    });
  } else {
    graph.push({
      "@type": "WebPage",
      name: page.title,
      description: page.description,
      url: page.canonical,
      isPartOf: { "@id": SITE + "/#website" },
      about: { "@id": SITE + "/#software" }
    });
  }

  if (pathname.startsWith("/install/")) {
    const howTo = howToSchema(pathname, page);
    if (howTo) graph.push(howTo);
  }

  if (pathname === "/chatgpt-computer-access") {
    graph.push({
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Does Remote Arc expose a port on my computer?", acceptedAnswer: { "@type": "Answer", text: "No. The local agent creates an outbound connection to the hosted control plane." } },
        { "@type": "Question", name: "Can I keep a computer read-only?", acceptedAnswer: { "@type": "Answer", text: "Yes. Tool availability is configured per device, so terminal and write tools can remain disabled." } },
        { "@type": "Question", name: "Do I have to use only ChatGPT?", acceptedAnswer: { "@type": "Answer", text: "No. The same Remote Arc endpoint can also be used by Claude, Cursor and compatible Remote MCP clients." } }
      ]
    });
  }

  const breadcrumbs = breadcrumbItems(pathname, page);
  if (breadcrumbs.length) {
    graph.push({ "@type": "BreadcrumbList", itemListElement: breadcrumbs });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

function crawlablePageHtml(pathname: string, page: SeoPage) {
  const copy = crawlPages[pathname] ?? {
    h1: page.title.replace(/ — Remote Arc$/, ""),
    intro: page.description,
    sections: [],
    links: [["/docs", "Documentation"], ["/security-model", "Security model"]]
  };
  const sections = (copy.sections || []).map((section, index) =>
    '<section id="step-' + (index + 1) + '"><h2>' + esc(section.heading) + '</h2><p>' + esc(section.text) + '</p></section>'
  ).join("");
  const links = (copy.links || []).map(([href, label]) =>
    '<li><a href="' + esc(href) + '">' + esc(label) + '</a></li>'
  ).join("");
  return '<main class="seo-blog-shell"><article><p class="seo-eyebrow">REMOTE ARC</p><h1>' + esc(copy.h1) + '</h1><p>' + esc(copy.intro) + '</p>' + sections + (links ? '<nav aria-label="Related Remote Arc pages"><h2>Related guides</h2><ul>' + links + '</ul></nav>' : '') + '</article></main>';
}

function notFoundHtml(pathname: string) {
  return '<main class="seo-blog-shell"><section><p class="seo-eyebrow">404</p><h1>Page not found</h1><p>No Remote Arc page exists at ' + esc(pathname) + '.</p><p><a href="/">Remote Arc home</a> · <a href="/docs">Documentation</a> · <a href="/install/chatgpt">Install for ChatGPT</a></p></section></main>';
}

export function renderMarketingHtml(html: string, pathname: string) {
  const page = pageFor(pathname);
  const resolved = page ?? {
    title: "Page not found — Remote Arc",
    description: "The requested Remote Arc page could not be found.",
    canonical: SITE + pathname
  };
  const indexable = Boolean(page);
  const structured = indexable ? JSON.stringify(jsonLd(resolved, pathname)).replaceAll("<", "\\u003c") : "";
  const robots = indexable
    ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : "noindex,nofollow,noarchive";
  const image = SITE + "/demos/connect-workflow-poster.webp";
  const extra =
    '<meta name="robots" content="' + robots + '" />' +
    '<meta name="googlebot" content="' + robots + '" />' +
    '<meta name="bingbot" content="' + robots + '" />' +
    '<meta name="author" content="' + esc(resolved.type === "article" ? (resolved.author || "Sam Yao") : "Remote Arc") + '" />' +
    '<meta property="og:type" content="' + (resolved.type === "article" ? "article" : "website") + '" />' +
    '<meta property="og:locale" content="en_US" />' +
    '<meta property="og:image" content="' + image + '" />' +
    '<meta property="og:image:secure_url" content="' + image + '" />' +
    '<meta property="og:image:type" content="image/webp" />' +
    '<meta property="og:image:width" content="1280" />' +
    '<meta property="og:image:height" content="800" />' +
    '<meta property="og:image:alt" content="Remote Arc connecting an AI client to a paired computer" />' +
    '<meta name="twitter:card" content="summary_large_image" />' +
    '<meta name="twitter:title" content="' + esc(resolved.title) + '" />' +
    '<meta name="twitter:description" content="' + esc(resolved.description) + '" />' +
    '<meta name="twitter:image" content="' + image + '" />' +
    '<meta name="twitter:image:alt" content="Remote Arc connecting an AI client to a paired computer" />' +
    '<link rel="alternate" type="application/rss+xml" title="Remote Arc Blog" href="' + SITE + '/feed.xml" />' +
    (resolved.type === "article" ? '<meta property="article:published_time" content="2026-09-27T00:00:00Z" /><meta property="article:modified_time" content="2026-09-27T00:00:00Z" />' : '') +
    (indexable ? '<script type="application/ld+json">' + structured + '</script>' : '');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(resolved.title) + '</title>')
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(resolved.description) + '" />')
    .replace(/<link rel="canonical"[^>]*>/, indexable ? '<link rel="canonical" href="' + esc(resolved.canonical) + '" />' : "")
    .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + esc(resolved.title) + '" />')
    .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + esc(resolved.description) + '" />')
    .replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="' + esc(indexable ? resolved.canonical : SITE + pathname) + '" />')
    .replace(/<meta property="og:image"[^>]*>/, "")
    .replace("</head>", extra + "</head>");

  if (!page) {
    return html.replace('<div id="root"></div>', '<div id="root">' + notFoundHtml(pathname) + '</div>');
  }
  if (pathname === "/blogs") {
    return html.replace('<div id="root"></div>', '<div id="root">' + blogIndexHtml() + '</div>');
  }
  if (articles[pathname]) {
    return html.replace('<div id="root"></div>', '<div id="root">' + articleHtml(page) + '</div>');
  }
  return html.replace('<div id="root"></div>', '<div id="root">' + crawlablePageHtml(pathname, page) + '</div>');
}

const sitemapPaths = [
  "/",
  "/install/chatgpt",
  "/install/claude",
  "/install/cursor",
  "/chatgpt-computer-access",
  "/claude-computer-access",
  "/mcp-computer-access",
  "/connect-ai",
  "/docs",
  "/docs/long-running-work",
  "/docs/mcp",
  "/security-model",
  "/use-cases",
  "/pricing",
  "/releases",
  "/demo",
  "/blogs",
  "/blogs/why-i-built-remote-arc",
  "/blogs/remote-arc-vs-openclaw",
  "/blogs/powerful-ai-access-without-exposing-your-computer",
  "/blogs/how-remote-arc-works",
  "/privacy",
  "/terms",
  "/support"
];

export function sitemapXml() {
  const paths = [...sitemapPaths, ...Object.keys(useCaseSeo).map(slug => "/use-cases/" + slug)];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    paths.map(function(path) {
      const isRoot = path === "/";
      const isPrimary = path.startsWith("/install/") || path === "/chatgpt-computer-access" || path === "/claude-computer-access" || path === "/mcp-computer-access" || path === "/docs/mcp";
      return '<url><loc>' + SITE + path + '</loc><lastmod>2026-10-04</lastmod><changefreq>' + (isRoot ? "weekly" : "monthly") + '</changefreq><priority>' + (isRoot ? "1.0" : isPrimary ? "0.9" : "0.8") + '</priority></url>';
    }).join("") + '</urlset>';
}

export function feedXml() {
  const items = Object.entries(articles).map(([path, article]) =>
    '<item><title>' + esc(article.title) + '</title><link>' + article.canonical + '</link><guid isPermaLink="true">' + article.canonical + '</guid><description>' + esc(article.description) + '</description><pubDate>Sun, 27 Sep 2026 00:00:00 GMT</pubDate></item>'
  ).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Remote Arc Blog</title><link>' + SITE + '/blogs</link><description>Engineering notes, architecture decisions and security trade-offs from Remote Arc.</description><language>en</language><lastBuildDate>Sun, 04 Oct 2026 00:00:00 GMT</lastBuildDate>' + items + '</channel></rss>';
}

export function llmsTxt() {
  return [
    "# Remote Arc",
    "",
    "> Remote Arc is a hosted Remote MCP bridge that connects compatible AI clients to explicitly paired Windows, macOS and Linux computers.",
    "",
    "## Core pages",
    "- [Home](" + SITE + "/): product overview and setup path",
    "- [Remote MCP computer access](" + SITE + "/mcp-computer-access): vendor-neutral architecture and capability overview",
    "- [ChatGPT computer access](" + SITE + "/chatgpt-computer-access): ChatGPT-specific setup and trust model",
    "- [Claude computer access](" + SITE + "/claude-computer-access): Claude-specific remote MCP setup",
    "- [MCP reference](" + SITE + "/docs/mcp): endpoint, OAuth and tool reference",
    "- [Security model](" + SITE + "/security-model): trust boundaries, permissions, data handling and revocation",
    "- [Long-running work](" + SITE + "/docs/long-running-work): durable tasks and recovery model",
    "- [Use cases](" + SITE + "/use-cases): practical workflows",
    "",
    "## Install",
    "- [ChatGPT](" + SITE + "/install/chatgpt)",
    "- [Claude](" + SITE + "/install/claude)",
    "- [Cursor](" + SITE + "/install/cursor)",
    "",
    "## Source",
    "- [GitHub](https://github.com/yaohuangguan/remote-arc)",
    ""
  ].join("\n");
}

export function llmsFullTxt() {
  return llmsTxt() + [
    "",
    "## Architecture summary",
    "AI clients connect to the hosted Remote Arc MCP endpoint over OAuth. The hosted control plane handles identity, policy and routing. Each paired computer keeps an outbound connection to Remote Arc, receives only routed tool calls for that device, and executes them through the local agent.",
    "",
    "## Security summary",
    "AI-client authorization and device authorization are separate. Device policies can limit tools, workspace roots, sensitive paths, browser interaction and long-running task capabilities. Terminal access, when enabled, inherits the permissions of the local operating-system user and is not presented as an OS sandbox.",
    "",
    "## Data-flow summary",
    "Requested tool arguments, selected file content and tool output can pass through the hosted relay to the connected AI provider. Local Undo snapshots for supported file edits stay on the device. See the privacy policy and security model for current details.",
    "",
    "## Product positioning",
    "Remote Arc is not a replacement AI assistant and does not own the user's model or conversation. It is a bridge between an AI client the user already chose and computers the user explicitly paired."
  ].join("\n");
}

export function robotsTxt() {
  return "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /oauth/\nDisallow: /auth/\nDisallow: /device$\nDisallow: /dashboard$\nDisallow: /overview$\nDisallow: /devices$\nDisallow: /automations$\nDisallow: /connect$\nDisallow: /monitor$\nDisallow: /settings$\nDisallow: /security$\n\nSitemap: " + SITE + "/sitemap.xml\n";
}
