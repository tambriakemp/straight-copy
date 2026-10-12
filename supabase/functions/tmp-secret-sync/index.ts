Deno.serve(async () => {
  const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-paperclip-pending`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-agent-secret": secret! }, body: "{}" });
  const body = await res.text();
  return new Response(JSON.stringify({ status: res.status, body }), { headers: { "Content-Type": "application/json" } });
});
