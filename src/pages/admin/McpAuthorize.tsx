import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export default function McpAuthorize() {
  const [params] = useSearchParams();
  const oauthAction = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-oauth/authorize`;

  const values = useMemo(() => ({
    clientId: params.get("client_id") ?? "",
    clientName: params.get("client_name") || "Claude",
    redirectUri: params.get("redirect_uri") ?? "",
    state: params.get("state") ?? "",
    codeChallenge: params.get("code_challenge") ?? "",
    codeChallengeMethod: params.get("code_challenge_method") ?? "S256",
    scope: params.get("scope") ?? "mcp",
    error: params.get("error") ?? "",
  }), [params]);

  const missingDetails = !values.clientId || !values.redirectUri || !values.codeChallenge;

  return (
    <main className="crm-shell">
      <section className="crm-page" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            background: "var(--crm-charcoal)",
            border: "1px solid var(--crm-border-dark)",
            padding: "48px 40px",
          }}
        >
          <div className="crm-label" style={{ marginBottom: 16 }}>Cre8 · MCP</div>
          <h1
            style={{
              fontFamily: "var(--crm-font-serif)",
              fontWeight: 300,
              fontSize: 44,
              lineHeight: 1,
              color: "var(--crm-warm-white)",
              margin: "0 0 12px 0",
            }}
          >
            Connect <em style={{ color: "var(--crm-accent)" }}>{values.clientName}</em>.
          </h1>
          <hr style={{ width: 48, height: 1, background: "var(--crm-accent)", border: 0, margin: "0 0 24px 0" }} />
          <p style={{ color: "var(--crm-taupe)", fontSize: 17, marginBottom: 28, lineHeight: 1.7 }}>
            Approve access to the Project Tasks workspace with an admin account.
          </p>

          {(values.error || missingDetails) && (
            <div
              role="alert"
              style={{
                background: "hsl(0 32% 18%)",
                border: "1px solid hsl(0 35% 34%)",
                color: "hsl(0 55% 86%)",
                padding: "12px 14px",
                marginBottom: 20,
                fontSize: 16,
              }}
            >
              {missingDetails ? "This OAuth request is missing required details. Start the connector setup again from Claude." : values.error}
            </div>
          )}

          <form method="post" action={oauthAction} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <input type="hidden" name="client_id" value={values.clientId} />
            <input type="hidden" name="redirect_uri" value={values.redirectUri} />
            <input type="hidden" name="state" value={values.state} />
            <input type="hidden" name="code_challenge" value={values.codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={values.codeChallengeMethod} />
            <input type="hidden" name="scope" value={values.scope} />

            <div>
              <label className="crm-label" htmlFor="mcp-email">Email</label>
              <input id="mcp-email" className="crm-input" name="email" type="email" autoComplete="email" required autoFocus />
            </div>
            <div>
              <label className="crm-label" htmlFor="mcp-password">Password</label>
              <input id="mcp-password" className="crm-input" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button
              type="submit"
              className="crm-btn crm-btn--primary"
              disabled={missingDetails}
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            >
              Approve and connect
            </button>
          </form>

          <div className="crm-label" style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--crm-border-dark)" }}>
            Grants scope: {values.scope}
          </div>
        </div>
      </section>
    </main>
  );
}