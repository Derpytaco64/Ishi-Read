// CLAUDE-ADDED: Thin server-side AniList client -- single GraphQL POST endpoint, no client library
// needed (see docs.anilist.co). Every route in src/app/api/anilist/** and api/auth/anilist/**
// goes through this instead of calling fetch() directly, so the "is this an auth failure vs a
// transient one" distinction (AniListAuthError below) is made in exactly one place.
const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const ANILIST_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";
const ANILIST_AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";

// CLAUDE-ADDED: AniList's redirect URL for the PIN flow -- a fixed, AniList-hosted page, not a
// route on this server. This is *why* PIN flow was chosen over a real redirect-URI callback: a
// self-hosted Ishi-Read instance can be LAN-only/Tailscale-only/otherwise unreachable from AniList's
// servers, but this URL always works because the browser (not AniList's backend) is what "returns"
// here, and the user manually copies the resulting code back into the app themselves.
export const ANILIST_PIN_REDIRECT_URI = "https://anilist.co/api/v2/oauth/pin";

// CLAUDE-ADDED: Thrown specifically when AniList rejects the request as unauthenticated/unauthorized
// (expired/invalid token, or bad client credentials) -- callers use this to distinguish "the user
// needs to reconnect their AniList account" (permanent until they do) from any other failure
// (network blip, AniList downtime, rate limit) that's worth retrying later. Surfaced to Android as
// a distinct HTTP status so its sync worker can stop retrying instead of backing off forever.
export class AniListAuthError extends Error {}

export class AniListApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export function buildAniListAuthorizeUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ANILIST_PIN_REDIRECT_URI,
    response_type: "code"
  });
  return `${ ANILIST_AUTHORIZE_URL }?${ params.toString() }`;
}

export async function exchangeAniListCode(code: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(ANILIST_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: ANILIST_PIN_REDIRECT_URI,
      code
    })
  });

  const json: unknown = await res.json().catch(() => null);
  const accessToken = (json as { access_token?: string } | null)?.access_token;

  if (!res.ok || typeof accessToken !== "string") {
    if (res.status === 401 || res.status === 400) {
      throw new AniListAuthError("That code was rejected by AniList -- it may be expired or already used. Try connecting again.");
    }
    throw new AniListApiError("Couldn't reach AniList to complete the connection", res.status);
  }

  return accessToken;
}

// CLAUDE-ADDED: rate-limit headers AniList sends back (X-RateLimit-Remaining) aren't inspected here
// -- see the search/list-entry routes for the per-user debounce that keeps this instance's shared
// budget (90/min normally, 30/min while AniList is degraded, as of Aug 2026) from being exhausted by
// one chatty user.
export async function anilistGraphQL<T>(query: string, variables: Record<string, unknown>, accessToken?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${ accessToken }`;

  const res = await fetch(ANILIST_GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });

  const json: unknown = await res.json().catch(() => null);
  const errors = (json as { errors?: { message?: string }[] } | null)?.errors;

  if (res.status === 401 || res.status === 403) {
    throw new AniListAuthError(errors?.[0]?.message || "AniList rejected this request -- reconnect your account.");
  }
  if (!res.ok || errors) {
    throw new AniListApiError(errors?.[0]?.message || `AniList request failed (${ res.status })`, res.status);
  }

  return (json as { data: T }).data;
}
