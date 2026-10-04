import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Cloudflare Access already gates every request at the edge; this re-verifies the
 * Access JWT on API calls so the Worker fails closed if Access is ever turned off.
 * Returns an error Response, or null when the request is allowed.
 */
export async function checkAccess(req: Request, env: Env): Promise<Response | null> {
  if (env.DEV_BYPASS_AUTH === "1") return null; // only set in .dev.vars for `wrangler dev`
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return new Response("Cloudflare Access is not configured for this Worker", { status: 503 });
  }
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return new Response("Missing Access token", { status: 401 });
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
  jwks ??= createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
  try {
    await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
    return null;
  } catch {
    return new Response("Invalid Access token", { status: 403 });
  }
}
