import { randomToken } from "./auth.js";

const NAME = "__Host-ra_email_form";
const validToken = (value: string) => /^[a-f0-9]{64}$/.test(value);

function tokenFromCookie(request: Request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === NAME) {
      const token = rest.join("=");
      return validToken(token) ? token : null;
    }
  }
  return null;
}

/** A host-only secure double-submit cookie for forms in privacy browsers. */
export function emailFormToken(request: Request) {
  const previous = tokenFromCookie(request);
  if (previous) return { token: previous, setCookie: null };
  const token = randomToken();
  return {
    token,
    setCookie: `${NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`,
  };
}

export function validEmailFormToken(request: Request, body: FormData) {
  const cookieToken = tokenFromCookie(request);
  const postedToken = body.get("email_csrf");
  if (!cookieToken || typeof postedToken !== "string" || !validToken(postedToken)) return false;
  // Equal-length constant-work comparison.
  let difference = 0;
  for (let i = 0; i < postedToken.length; i++) {
    difference |= postedToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }
  return difference === 0;
}
