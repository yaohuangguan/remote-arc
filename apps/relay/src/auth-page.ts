/** Shared lightweight identity pages: no JS runtime, client-side token handling, or external CDN. */
const css = `
:root { color-scheme:light; font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-synthesis:none; }
* { box-sizing:border-box }
body { min-height:100vh; margin:0; padding:40px 20px; display:flex; align-items:center; justify-content:center; background:radial-gradient(ellipse 55% 50% at 50% -12%,#d9f5fc 0%,transparent 80%),#f4f8fa; color:#163440 }
.shell { width:100%; max-width:448px }
.brand { display:flex; justify-content:center; align-items:center; gap:10px; margin:0 0 22px; color:#173644; font-size:19px; font-weight:800; letter-spacing:-.03em; text-decoration:none }
.brand img { height:37px; width:37px; object-fit:contain }
.card { background:#fff; border:1px solid #dbe7ed; border-radius:22px; padding:34px; box-shadow:0 20px 72px rgba(30,74,92,.095),0 2px 8px rgba(30,74,92,.035) }
.eyebrow { margin:0 0 10px; font-size:12px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#197b91 }
h1 { margin:0 0 10px; font-size:29px; line-height:1.2; letter-spacing:-.045em; color:#132d39 }
.lead { margin:0 0 26px; font-size:15px; line-height:1.65; color:#5a727b }
.google { display:flex; align-items:center; justify-content:center; gap:12px; width:100%; min-height:54px; padding:10px 18px; border:1.5px solid #d4dee5; border-radius:12px; background:#fff; color:#203a47; font-size:15px; font-weight:700; line-height:1.25; text-decoration:none; transition:border-color .15s,background .15s,box-shadow .15s }
.google:hover { background:#f8fcfe; border-color:#83b7c6; box-shadow:0 3px 12px rgba(20,64,81,.055) }
.google img { width:22px; height:22px; flex:none }
.divider { display:flex; align-items:center; gap:14px; margin:26px 0 22px; font-size:13px; color:#6c8591; white-space:nowrap }
.divider:before,.divider:after { content:""; height:1px; flex:1; background:#dbe8ed }
form { display:grid; gap:0; margin:0 }
label { display:block; font-size:14px; color:#263f4b; font-weight:680; margin-bottom:8px }
.field { display:block; width:100%; min-height:52px; border:1px solid #c8d8e0; border-radius:11px; padding:0 15px; background:#fff; color:#142f3b; font-size:16px; font-weight:500; line-height:1.2; outline:none; transition:border-color .15s,box-shadow .15s }
.field:focus { border-color:#178faf; box-shadow:0 0 0 3px rgba(30,162,184,.16) }
.field::placeholder { color:#8ca0a9 }
.field.code { text-align:center; font-size:24px; font-weight:720; letter-spacing:.32em; font-variant-numeric:tabular-nums }
.primary { display:flex; align-items:center; justify-content:center; min-height:52px; width:100%; border:0; border-radius:11px; margin-top:16px; background:#153f4c; color:#fff; font-size:15px; font-weight:700; line-height:1.2; cursor:pointer; transition:background .15s }
.primary:hover { background:#0c6578 }
.primary:focus-visible,.google:focus-visible,a:focus-visible,summary:focus-visible { outline:3px solid #47a8c0; outline-offset:3px }
.note { margin:15px 0 0; font-size:13px; line-height:1.55; color:#738994 }
.foot { max-width:410px; margin:19px auto 0; text-align:center; font-size:13px; line-height:1.6; color:#708791 }
.foot a,.link { color:#146a81; font-weight:650; text-decoration:none }
.foot a:hover,.link:hover { text-decoration:underline }
.back { display:inline-flex; align-items:center; gap:8px; margin:0 0 20px; text-decoration:none; color:#4c7180; font-size:14px; font-weight:650 }
.badge { display:inline-flex; align-items:center; gap:7px; background:#edf8f8; border:1px solid #d5ebe9; color:#25717b; border-radius:999px; padding:6px 11px; font-size:13px; font-weight:650; margin:0 0 20px }
.badge:before { content:"✓"; font-weight:800 }
.email-highlight { overflow-wrap:anywhere; color:#183f4b; font-weight:720 }
.error { margin:0 0 16px; padding:12px 14px; border-radius:9px; background:#fff4f3; border:1px solid #ffdad5; color:#a13d33; font-size:14px }
details { margin-top:22px; border-top:1px solid #e3edf1; padding-top:17px; color:#738994 }
summary { cursor:pointer; font-size:13px; font-weight:650 }
details form { margin-top:16px; display:grid; gap:9px }
details input { min-height:44px }
details button { margin-top:6px }
@media(max-width:480px) {
 body { align-items:flex-start; padding:34px 16px }
 .card { padding:27px 23px; border-radius:18px }
 h1 { font-size:27px }
}
@media(prefers-color-scheme:dark) {
 :root { color-scheme:dark }
 body { background:radial-gradient(ellipse 60% 45% at 50% -5%,#193f50 0%,transparent 85%),#07121b; color:#ebf7fa }
 .brand,h1 { color:#ebf7fa }
 .card { background:#101e29; border-color:#2b4453; box-shadow:0 18px 55px #0003 }
 .eyebrow { color:#75d3e4 }
 .lead,.note,.foot,summary { color:#a1b9c4 }
 .google { color:#253945; background:#fff; border-color:#e2e7ea }
 .google:hover { background:#f4fafc }
 .divider { color:#9ab0bd }
 .divider:before,.divider:after,details { border-color:#34505c; background-color:transparent }
 .divider:before,.divider:after { background:#34505c }
 label { color:#d9ecf2 }
 .field { background:#0b1722; color:#f6fdff; border-color:#3d5664 }
 .field::placeholder { color:#849eab }
 .primary { background:#d1f5fc; color:#102b36 }
 .primary:hover { background:#abe5f0 }
 .badge { background:#122e36; border-color:#2b555c; color:#a0e1e9 }
 .email-highlight { color:#e8fafb }
 .error { background:#341c21; color:#ffc5be; border-color:#743e45 }
 .back,.foot a,.link { color:#88d6e8 }
}
`;

export function escapeAuthHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

export function authPage(title: string, inner: string): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#f4f8fa">
<title>${escapeAuthHtml(title)} · Remote Arc</title><link rel="icon" href="/remote-arc.svg" type="image/svg+xml">
<style>${css}</style></head>
<body><div class="shell"><a class="brand" href="https://remotearc.app/" aria-label="Remote Arc homepage">
<img src="/remote-arc.svg" alt="" width="37" height="37">Remote Arc</a>
<main class="card">${inner}</main>
<p class="foot">Secure access to your computers, with permission controls.<br>
<a href="https://remotearc.app/privacy">Privacy</a> · <a href="https://remotearc.app/security-model">Security</a></p>
</div></body></html>`;
  return new Response(html, { headers: {
    "content-type":"text/html; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer",
    "content-security-policy":"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  }});
}
