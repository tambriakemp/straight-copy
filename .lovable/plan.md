## Goal

On the admin side for Launch/Growth (automation_build) projects, replace the S-shaped journey canvas + popup modal with a responsive vertical list of collapsible cards — one per journey node — styled like the dark Payment Schedule cards in the reference screenshot.

## Scope

File: `src/pages/admin/AutomationBuildView.tsx` (and minor CSS in `src/index.css` for new card classes).

Out of scope: the journey data model, edge functions, `StageModal`'s sub-panels (BrandVoicePanel, BrandKitPanel, OnboardingChatLinkPanel, EmailTrackingPanel, BuildSchedulePanel, NodeChecklist, ClientFieldEditor, etc.) — these are reused as-is inside the new card body.

## What changes

1. **Remove the S-curve canvas** (`<svg className="canvas__svg">` block, lines ~552–605) along with the helpers that exist only for it: `buildSCurve`, `buildPartial`, `svgNodes`/`fullPath`/`progressPath`/`nodeSize` memos, the `wrapRef`/`size` resize observer, and the `canvas__legend` / `canvas__hint` / `canvas__ghost` chrome.

2. **Remove `<StageModal>` mounting** and the `openNodeId` modal state. Keep `StageModal`'s body content and refactor it into a new presentational component `JourneyNodeCard` (same file) that renders inline as a collapsible card instead of inside `crm-modal-backdrop` / `crm-modal`.

3. **Render a list of cards** in place of the canvas:
   ```
   <div className="journey-cards">
     {nodes.map((n, i) => <JourneyNodeCard ... />)}
   </div>
   ```
   Built on the existing shadcn `Collapsible` primitive (`@/components/ui/collapsible`).

4. **Card header (always visible), matching the screenshot's payment-schedule row:**
   - Eyebrow: `STAGE 0{i+1}` (uppercase, tracked, taupe).
   - Title: node label (Cormorant italic accent on last word, same as current modal title).
   - Right side: status pill (Complete / In Progress / Blocked / Not Started, reusing `crm-pill` classes) + chevron that rotates on open.
   - Sub-line: `Started — · Completed —` dates when present.
   - Whole header is the `CollapsibleTrigger`.

5. **Card body (revealed on expand):** exactly the current `StageModal` right-column contents in the existing order — status segmented control, `<NodeChecklist>`, plus the per-node-key panels (`brand_voice`, `brand_kit`, `intake`, `delivery`, `automation_02`, etc.). The left-column meta from the modal (Client / Tier / Started / Completed) moves into a compact meta row at the top of the body.

6. **Default open state:** the first node with status `in_progress` is open by default; if none, the first not-yet-complete node is open; otherwise all collapsed. Users can toggle any card freely (local `Set<string>` of open ids in `AutomationBuildView`).

7. **Progress ring stays.** The header strip with `completedCount / total` and the circular `pct` ring is unchanged — `pct`/`completedCount`/`currentIdx` calculations are kept (they don't depend on S-curve geometry).

8. **Styles.** Add a small block in `src/index.css` for `.journey-cards`, `.journey-card`, `.journey-card__header`, `.journey-card__title`, `.journey-card__body`, `.journey-card__chevron` using the existing dark editorial tokens (`--crm-ink`, `--crm-stone`, `--crm-taupe`, hairline borders, rounded-lg, same hover treatment as the Payment Schedule card the user referenced). Drop now-unused S-curve CSS (`.canvas__svg`, `.journey-path-*`, `.node`, `.node__*`, `.canvas__legend`, `.canvas__hint`, `.canvas__ghost`).

## Behavior preserved

- Realtime channel subscription on `journey_nodes`.
- Checklist sync via `syncChecklist` / `templateIdFor`.
- `updateNode` patch flow used by status buttons, notes, asset fields, and `NodeChecklist`.
- `auto_complete_journey_node` DB trigger continues to drive node status; UI just reflects it.
- Escape-to-close goes away (no modal). All other keyboard behavior is native to `Collapsible`.

## Visual reference

Cards mirror the Payment Schedule card from the user's screenshot: `1px hsl(40 20% 97% / 0.08)` border, `hsl(0 0% 8%)` background, generous padding, rounded corners, subtle hover lift, chevron on the right.
