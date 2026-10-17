# Apps expansion: implementation and release status

Remote Arc Connect owns the Apps connection and execution layer. It works with compatible MCP clients without an Arc Agent deployment or hosted model. Lindy and Composio are references only; neither is a dependency. This implementation calls native provider APIs through bounded adapters. It does not borrow credentials or private tools from ChatGPT plugins, and it does not claim that every App exposes an official MCP server.

The catalog contains **29 integrations in eight categories**. The homepage floating hero features GitHub, Vercel, Runway, Drive, Notion and Slack. The preserved lower live demo and the Arc page share three schema-checked examples: GitHub + Vercel → Slack, Runway balance + reviewed video request, and Drive → reviewed Notion page. The Arc directory comes from the same executable registry; Arc Agent remains in development and Connect Apps rolls out independently. The directory is generated from the same executable registry used by the service. Run `pnpm --filter @remotearc/relay exec tsx scripts/apps-directory.ts` after registry changes; CI checks it with `--check`. Logos are genuine vendor marks; new asset sources are in `apps/ui/public/app-brands/SOURCES.json`.

## Authentication and scope

There are **27 OAuth connectors across 15 identity platforms**: GitHub, Slack, Google, Microsoft, Meta, Atlassian, Notion, Shopify, LinkedIn, HubSpot, Salesforce, Vercel, Linear, Supabase and X. Remote Arc registers the provider applications once, and each user subsequently authorizes their own account. This is independent of signing in to Remote Arc itself.

**Two** connectors accept the user's API credentials: Runway and WhatsApp Business. Credentials are submitted only through the authenticated Apps form, validated against the provider, then encrypted with account-bound AES-GCM. API keys are not passed to an MCP model. X uses a managed confidential OAuth application, not user-supplied API tokens; its developer-project API consumption is billed to Remote Arc.


Shopify validates a strict myshopify.com tenant and callback HMAC. Its initial support creates draft products, never automatically publishes them. Reading orders requires Shopify's applicable protected-customer-data approval. Atlassian uses Remote Arc's own 3LO application and authorized cloud IDs. Notion requires integration capabilities and user-selected shared pages. Instagram requires an eligible professional account linked to a Facebook Page. WhatsApp requires the user's Cloud API business account and owned phone number; free-form text remains subject to the provider's conversation-window rules.

Pin a supported Meta Graph API version using `APP_META_GRAPH_VERSION`. Google Ads also requires `APP_GOOGLE_ADS_DEVELOPER_TOKEN`; user OAuth alone is insufficient. Request only the documented scopes/capabilities for the actual supported operations. Provider reviews, business verification and distribution approval cannot be replaced by adding an icon or enabling a flag.

## Operations and approvals

Browse `list_apps` by category, query and cursor. Broad results omit operation schemas; selecting one provider loads its schemas. `call_app` uses a user-owned connection and stable request ID. Expanding the catalog does not add hundreds of tools to every AI turn.

The supported depth differs by provider: YouTube, Search Console, Google Analytics and Google Ads currently expose reads/reports; social posting is implemented for X, Facebook Pages, LinkedIn and eligible Instagram accounts. Runway supports balance, task status and Gen-4.5 text-to-video. Supabase arbitrary SQL is always classified as a write, including SELECT, since SQL can have side effects.

All writes require local write permission, MCP write scope and review of the exact arguments. Instagram publication also requires the successful source media-creation call from the same user/connection and includes the original image URL/caption in approval. Runway review includes model, duration, credit estimate, pricing source and requested estimate ceiling. The Gen-4.5 estimate is 12 API credits/second, checked against the request's maxCredits; this is an estimate gate, **not a provider-enforced monetary spending cap**. Provider prices can change. Use provider-side budgets to control actual account charges.

Each execution is claimed once in SQLite. Concurrent retries cannot duplicate writes; an unknown dispatched write is never automatically retried. Provider acknowledgements are not independent semantic verification or delivery guarantees. Results are marked untrusted and returned credential fields are stripped.

## Cost ownership

Using a user's Runway API key spends that API organization's credits. Web-subscription credits are separate unless Runway enables an organization transfer. X reads and writes may both consume API credits belonging to the developer project behind the user's token. WhatsApp messages can be billed to the user's Business account. Vercel/Supabase infrastructure usage follows the user's project plan.

OAuth does not universally place API charges on the end user. Some quotas or fees belong to the developer project, and the service must account for them. There is a per-connection daily **operation** limit (API-key connections default to 25) and atomic provider-wide daily operation limit (`APP_DAILY_PROVIDER_LIMIT`, default 1000). An operation can involve more than one upstream HTTP request; these limits are not exact financial caps. Credential validation can itself use provider quota and requires explicit consent in the API-credential form.

Remote Arc still pays for its Workers/database/storage, development, maintenance, provider review and incident support. An idle listed adapter has no dedicated process, model call or automatic polling loop. Hundreds of adapters can share the runtime, but registration, policy review and maintenance do not become zero-cost.

## Release gates

Apps runtime is now enabled in production, but individual provider readiness is explicitly configuration-gated. An enabled Apps directory does **not** mean individual OAuth clients are registered, publicly approved or live-account tested. The public `/api/apps/status` endpoint reports metadata-only provider readiness, not successful OAuth or API execution. For a read-only operational checklist, run `pnpm --filter @remotearc/relay apps:preflight`; `--json` produces a machine-readable summary and `--require-p0` exits nonzero when the priority five identity platforms still have unconfigured providers. Never dump real client secrets into reports.


Apply migrations 0030 and 0031 together in an isolated staging database first. Migration 0031 rebuilds both the provider table and its dependent call table, retaining existing IDs, encrypted credentials, action records and foreign keys. The upgrade test starts with populated 0030 tables, commits the migration and checks existing data and foreign-key integrity.

Before enabling production: register the provider applications, configure server secret names from the generated pack, validate exact staging callbacks and consent, run real-account acceptance using approved test resources, exercise token expiry/reconnect/disconnect, verify paid-provider billing ownership and confirm policy/review requirements. Release configured providers in stages; unconfigured providers remain visibly unavailable.

The automated suite uses actual source and SQLite with mocked upstream protocols. It covers all 23 added providers and every added operation, but does not claim live provider acceptance. `pnpm coverage:apps` enforces 90% per metric **per Apps core file**. Browser QA covers categories, search, read-only controls, OAuth, Shopify tenant entry, API credential consent, permission changes, disconnect and approvals in EN/ZH, dark/light and desktop/mobile.

## Primary references checked

- [OpenAI MCP apps](https://developers.openai.com/plugins/concepts/mcp-server), [Composio's developer layer](https://docs.composio.dev/docs/how-composio-works)
- [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/), [Runway API credits](https://help.runwayml.com/hc/en-us/articles/21668552945171-Runway-API-FAQs), [Runway attribution](https://docs.dev.runwayml.com/usage/attribution/)
- [X API billing](https://docs.x.com/x-api/getting-started/pricing), [Google Workspace API scaling](https://developers.google.com/workspace/tools-safety)
- [Atlassian 3LO](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/), [Shopify auth](https://shopify.dev/docs/apps/build/authentication-authorization), [Linear GraphQL](https://linear.app/developers/graphql)
- [HubSpot OAuth token/introspection protocol](https://developers.hubspot.com/docs/api-reference/legacy/authentication/manage-oauth-tokens), [HubSpot version timeline](https://developers.hubspot.com/changelog/legacy-apis-and-legacy-apps-whats-going-unsupported-and-when?hs_amp=true)

API versions are explicit in adapters and must be reviewed when the provider deprecates them. HubSpot's v3 support timeline requires a migration before its announced September 2027 enforcement.

## Managed OAuth upgrades (2026-10-17)

Vercel external Integration installation, Linear user-actor PKCE, Supabase Management API OAuth, and X confidential-client PKCE now use Remote Arc-managed clients. There are 27 OAuth connectors across 15 identity platforms and two user-credential connectors: Runway and WhatsApp Business. Vercel and Supabase configure upstream scopes on the platform app; local read/write choices and exact write approvals still apply. Vercel team access is fenced to the token-authorized installation. X API charges belong to Remote Arc’s developer project; do not enable automatic funding. See [cost ownership](apps-cost-ownership.md).

The owner chose production code release followed by their own account trial instead of requiring 29 separate real-account acceptance runs before release. Automated checks remain required. Registration, platform review and runtime credentials remain necessary; unconfigured connectors are not shown as ready.
