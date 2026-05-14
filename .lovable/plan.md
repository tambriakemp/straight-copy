# Fix Menovia preview rendering

## Root cause

The Menovia file is a single self-contained HTML bundle. Its inline bootstrap script calls `URL.createObjectURL(new Blob([finalBytes], { type: entry.mime }))` to render packed assets.

The `preview-serve` edge function rewrites asset URLs in served HTML using three regexes — `src|href|...` attributes, `srcset`, and **`url(...)` in inline styles**. The `url(...)` regex runs case-insensitively across the entire HTML body, including `<script>` contents, so it matches the `URL(` inside `createObjectURL(new Blob(...))` and rewrites it to:

```
URL.createObjecturl(https://…/preview-serve?slug=…&path=new%20Blob(...))
```

That mangles the script (note the lowercased `createObjecturl` and the URL-encoded `new Blob(...)` argument), the unpack loop throws, and the page is stuck on the dark-purple "Menovia / Honor the Pause" loading splash — exactly what the second screenshot shows.

## Fix

In `supabase/functions/preview-serve/index.ts`, stop rewriting inside `<script>...</script>` blocks. Style tag bodies should keep their `url(...)` rewrites (real CSS), but script bodies must be left untouched.

Approach: before applying the three rewrite passes, split the HTML into segments that are either "code" (anything between `<script…>` and `</script>`) or "rewritable" (everything else). Run the existing `src/href`, `srcset`, and `url(...)` replacements only on the rewritable segments, then re-join. This is small, surgical, and preserves all current behavior for normal multi-file uploads.

After deploy, reload `https://…/p/kl8miy518hkv5hiwrp2bpgpp` — the bundler should unpack and render the full Home/Web+Native design surface (first screenshot).

## Files

- `supabase/functions/preview-serve/index.ts` — wrap the three rewrite passes in a script-aware splitter.

No DB migration, no other code changes.
