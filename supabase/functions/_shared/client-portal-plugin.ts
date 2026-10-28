// The Client Portal plugin's v1 API, as called from this server.
//
// THE CREDENTIAL NEVER REACHES A BROWSER, and that is the only hard rule in
// this file. The plugin authenticates a Paperclip board session or an agent
// API key; the key we hold is an agent key for the whole company, so a copy
// of it in a client's browser is a copy of every client's proposals,
// invoices and saved logins. So: no `VITE_` variable, no value echoed in a
// response, no value in an error message, and `describeConfig()` below exists
// precisely so a health check can report whether it is set without reporting
// what it is.
//
// WHY THIS IS A THIN CLIENT AND NOT A MODEL
//
// It does paths, auth, the client scope and error mapping, and nothing else.
// The composition into view models lives in `client-portal/plugin.ts`, which
// has no credentials in it and can therefore be read by anyone reviewing what
// the screens show. Mixing the two would put the key in the same file as the
// screen logic, which is the file that changes most often.
//
// WHY THE VERSION IS IN THE PATH
//
// `/api/v1/...` is the plugin's own choice and this follows it. The plugin's
// compatibility promise is that `v1` never removes or renames a field, that
// an error code never changes meaning, and that an enum may gain members --
// so this client treats unknown `status` and `kind` values as "something
// newer" rather than as errors, and a reader of this file should too.

/** The environment variables that point at a Paperclip install. */
export interface PluginConfig {
  /** Origin of the Paperclip install, with no trailing slash. */
  baseUrl: string;
  /** A Paperclip agent API key. Never logged, never returned. */
  apiKey: string;
  /** The company every request is authorised against. */
  companyId: string;
}

const PLUGIN_ID = "cre8visions.plugin-client-portal";
const API_PREFIX = `/api/plugins/${PLUGIN_ID}/api/v1`;
const CLIENT_SCOPE_HEADER = "x-client-portal-client-scope";

/** How long we wait on the plugin before giving the client an answer. */
const TIMEOUT_MS = 10_000;

/**
 * Read the configuration, or `null` when this install has none.
 *
 * Null is a supported state and not an error, because it is the state every
 * install is in until the CP-6 import has run: the plugin exists, nothing has
 * been migrated into it, and the portal is still serving the `/admin` tables.
 * Callers branch on it rather than catching -- see `client-portal/index.ts`.
 */
export function readPluginConfig(
  env: { get(key: string): string | undefined } = Deno.env,
): PluginConfig | null {
  const baseUrl = (env.get("CLIENT_PORTAL_API_URL") ?? "").trim().replace(/\/+$/, "");
  const apiKey = (env.get("CLIENT_PORTAL_API_KEY") ?? "").trim();
  const companyId = (env.get("CLIENT_PORTAL_COMPANY_ID") ?? "").trim();
  if (!baseUrl || !apiKey || !companyId) return null;
  return { baseUrl, apiKey, companyId };
}

/**
 * What a health check may say about the configuration.
 *
 * Three booleans and no values. A diagnostic that printed the first few
 * characters of the key would be a diagnostic somebody eventually pastes into
 * a ticket.
 */
export function describeConfig(
  env: { get(key: string): string | undefined } = Deno.env,
): { baseUrl: boolean; apiKey: boolean; companyId: boolean; configured: boolean } {
  const has = (key: string) => (env.get(key) ?? "").trim().length > 0;
  const parts = {
    baseUrl: has("CLIENT_PORTAL_API_URL"),
    apiKey: has("CLIENT_PORTAL_API_KEY"),
    companyId: has("CLIENT_PORTAL_COMPANY_ID"),
  };
  return { ...parts, configured: parts.baseUrl && parts.apiKey && parts.companyId };
}

/**
 * A refusal from the plugin, carried intact.
 *
 * `code` is the plugin's contract and the thing to branch on; `message` is
 * written for a person and is safe to show one. `status` is kept so a caller
 * can pass a 404 through as a 404 rather than turning every plugin problem
 * into a 500, which is what makes "that proposal is not yours" readable in
 * the portal instead of looking like an outage.
 */
export class PluginApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PluginApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface CallOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Merged into the body for POST/PATCH and the query for GET/DELETE. */
  body?: Record<string, unknown>;
  query?: Record<string, string | number | undefined | null>;
  /**
   * The client this request is on behalf of.
   *
   * Set on every call the portal makes, and the plugin then refuses any id
   * that belongs to someone else. It is a second line and not the first: the
   * first is that `client-portal/index.ts` resolved the caller's session to
   * this client id before getting here. Two independent checks, because the
   * consequence of one bug here is one client reading another's contracts.
   */
  clientScope?: string;
  signal?: AbortSignal;
}

export class PluginClient {
  readonly #config: PluginConfig;
  readonly #fetch: typeof fetch;

  constructor(config: PluginConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  get companyId(): string {
    return this.#config.companyId;
  }

  async call<T>(path: string, options: CallOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const sendsBody = method === "POST" || method === "PATCH";

    const url = new URL(`${this.#config.baseUrl}${API_PREFIX}${path}`);
    // `companyId` goes in the query for GET and DELETE and in the body for
    // POST and PATCH, which is the plugin's own rule rather than a
    // preference: the host reads it from one place per method to authorise
    // the caller before the plugin sees the request at all.
    if (!sendsBody) url.searchParams.set("companyId", this.#config.companyId);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#config.apiKey}`,
      Accept: "application/json",
    };
    if (sendsBody) headers["Content-Type"] = "application/json";
    if (options.clientScope) headers[CLIENT_SCOPE_HEADER] = options.clientScope;

    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;

    let response: Response;
    try {
      response = await this.#fetch(url.toString(), {
        method,
        headers,
        signal,
        body: sendsBody
          ? JSON.stringify({ companyId: this.#config.companyId, ...(options.body ?? {}) })
          : undefined,
      });
    } catch (caught) {
      // The URL is in the message and the key is not, which is the whole
      // reason this is caught and rethrown rather than left to propagate: a
      // thrown `TypeError` from fetch carries the request, and the request
      // carries an Authorization header.
      throw new PluginApiError(
        502,
        "plugin_unreachable",
        `The client portal service did not answer (${describeFailure(caught)}).`,
      );
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const payload = (parsed ?? {}) as { error?: string; message?: string; details?: unknown };
      throw new PluginApiError(
        response.status,
        payload.error ?? "plugin_error",
        payload.message ?? `The client portal service refused the request (${response.status}).`,
        payload.details,
      );
    }
    return parsed as T;
  }
}

/** A failure description with nothing sensitive in it. */
function describeFailure(caught: unknown): string {
  if (caught instanceof DOMException && caught.name === "TimeoutError") return "timed out";
  if (caught instanceof Error) return caught.name;
  return "unknown error";
}

export const __testing = { API_PREFIX, CLIENT_SCOPE_HEADER, PLUGIN_ID, TIMEOUT_MS };
