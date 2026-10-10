/**
 * Email-client-safe Remote Arc one-time passcode message.
 *
 * The template deliberately uses inline styles, layout tables, absolute
 * HTTPS image URLs, visible text branding, and no JavaScript or external CSS.
 * Missing remote images never obscure the verification code.
 */
const BRAND_ORIGIN = "https://remotearc.app";
const LOGIN_ORIGIN = "https://mcp.remotearc.app";

export function renderOtpEmail(code: string) {
  if (!/^[0-9]{6}$/.test(code)) {
    throw new Error("OTP email requires a six-digit numeric code");
  }
  const subject = "Your Remote Arc verification code";
  const text = [
    "REMOTE ARC · SECURE SIGN-IN",
    "",
    "Verify your email",
    "",
    "Your one-time Remote Arc code:",
    code,
    "",
    "This code expires in 10 minutes and can only be used once.",
    `Enter it on ${LOGIN_ORIGIN} to finish signing in or creating your account.`,
    "",
    "Didn't request this code? You can safely ignore this email.",
    "Never share the code with anyone — Remote Arc will never ask for it in a chat.",
    "",
    `Remote Arc | ${BRAND_ORIGIN}`,
    `Privacy: ${BRAND_ORIGIN}/privacy`,
    `Security: ${BRAND_ORIGIN}/security-model`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Remote Arc verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f7fa;color:#193243;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:transparent;">Your Remote Arc code: ${code}. Expires in 10 minutes.&#8199;&#65279;&#847;&#8199;&#65279;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f3f7fa" style="border-collapse:collapse;background-color:#f3f7fa;">
<tr><td align="center" style="padding:36px 16px 42px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:560px;border-collapse:separate;border-spacing:0;">
<tr><td align="left" bgcolor="#071724" style="padding:28px 32px;background-color:#071724;border-radius:18px 18px 0 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr><td valign="middle" style="width:46px;padding-right:13px;"><img src="${BRAND_ORIGIN}/remote-arc-192.png" alt="Remote Arc" width="44" height="44" style="display:block;width:44px;height:44px;border:0;border-radius:11px;outline:none;text-decoration:none;"></td><td valign="middle"><span style="display:block;font-size:20px;font-weight:800;line-height:1.15;letter-spacing:-.4px;color:#f4fbff;">Remote Arc</span><span style="display:block;margin-top:5px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.7px;color:#65d5f7;text-transform:uppercase;">Your AI. Your computer. Your control.</span></td></tr>
  </table>
</td></tr>
<tr><td align="left" bgcolor="#ffffff" style="padding:36px 34px 12px;background-color:#ffffff;border-left:1px solid #e1ebf0;border-right:1px solid #e1ebf0;">
  <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:1.9px;color:#1684ad;line-height:1.4;">SECURE ACCOUNT ACCESS</p>
  <h1 style="margin:0 0 15px;font-size:29px;font-weight:800;line-height:1.2;letter-spacing:-.7px;color:#112f40;">Verify your email</h1>
  <p style="margin:0;font-size:15px;line-height:1.75;color:#536e7a;">Use this one-time code to sign in or create your Remote Arc account. Enter it in the verification screen you already opened.</p>
</td></tr>
<tr><td align="center" bgcolor="#ffffff" style="padding:20px 34px 10px;background-color:#ffffff;border-left:1px solid #e1ebf0;border-right:1px solid #e1ebf0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">
  <tr><td align="center" bgcolor="#eefaff" style="padding:24px 14px 21px;background-color:#eefaff;border:1px solid #caeaf7;border-radius:13px;">
    <p style="margin:0 0 12px;font-size:12px;letter-spacing:1.4px;font-weight:800;color:#397891;">YOUR VERIFICATION CODE</p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-variant-numeric:tabular-nums;font-weight:800;font-size:38px;line-height:1.3;letter-spacing:8px;color:#0c3148;white-space:nowrap;">${code}</p>
    <p style="margin:12px 0 0;font-size:13px;line-height:1.45;color:#4e7788;">Expires in <strong style="color:#103e58;">10 minutes</strong> · One-time use</p>
  </td></tr></table>
</td></tr>
<tr><td align="left" bgcolor="#ffffff" style="padding:16px 34px 33px;background-color:#ffffff;border-left:1px solid #e1ebf0;border-right:1px solid #e1ebf0;border-radius:0 0 18px 18px;border-bottom:1px solid #e1ebf0;">
  <p style="margin:0 0 18px;font-size:13px;line-height:1.7;color:#536e7a;">Only enter this code on <strong style="color:#174f68;">mcp.remotearc.app</strong>. Remote Arc will never ask you to share it in an AI chat or message.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:16px 17px;background-color:#f5f9fb;border-left:3px solid #38bdf8;">
    <p style="margin:0;font-size:13px;line-height:1.65;color:#526d7b;"><strong style="color:#173f53;">Wasn't you?</strong> Ignore this email. Your account will not be signed into unless the code is entered.</p>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:26px 18px 4px;">
  <p style="margin:0 0 9px;font-size:12px;line-height:1.6;color:#718b99;">Remote Arc · Secure access to your own computers.</p>
  <p style="margin:0;font-size:12px;line-height:1.8;color:#658598;">
    <a href="${BRAND_ORIGIN}" style="color:#186f93;text-decoration:none;font-weight:700;">Website</a>
    &nbsp; · &nbsp;<a href="${BRAND_ORIGIN}/privacy" style="color:#186f93;text-decoration:none;">Privacy</a>
    &nbsp; · &nbsp;<a href="${BRAND_ORIGIN}/security-model" style="color:#186f93;text-decoration:none;">Security</a>
  </p>
  <p style="margin:12px 0 0;font-size:11px;line-height:1.6;color:#8aa2ae;">This is an automated security email. Please do not reply.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
  return { subject, text, html };
}
