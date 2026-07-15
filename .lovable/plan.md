## Mobile-native overhaul — Admin CRM

Make every admin screen feel like a native mobile app: bottom tab bar, bottom-sheet forms, tabbed task board, and a locked viewport (no horizontal swipe/pan).

### 1. Global mobile shell

- Add a `MobileShell` wrapper used by `AdminLayout` when `useIsMobile()` is true:
  - Hide the desktop `topnav` on mobile; show a slim top app bar with page title + contextual action (back arrow on nested routes).
  - Add a fixed **bottom tab bar** with 5 destinations: Dashboard, Clients, Tasks, Knowledge, Profile. Secondary items (Invites, Tokens/Settings, Previews) move into a "More" sheet reachable from Profile.
  - Reserve bottom padding equal to tab-bar height so content never sits under it. Respect iOS safe-area (`env(safe-area-inset-bottom)`).
- **Lock the viewport** (no horizontal drift, no rubber-banding, no accidental swipe-nav):
  - `index.html` meta viewport: `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`.
  - Global CSS on `html, body`: `overflow-x: hidden; overscroll-behavior: none; touch-action: pan-y; width: 100%; position: relative;`.
  - Add `overscroll-behavior-x: none` to scrollable containers.

### 2. Navigation

- New `MobileTabBar` component (icons + labels, active state matches editorial palette).
- Nested/detail pages (ClientDetail, ProjectDetail, PreviewDetail, Wiki article) get a top-left back button instead of relying on breadcrumbs.
- `ProjectTabs` (currently horizontal chip row) becomes a horizontally-scrollable tab strip on mobile with snap and an active underline — still keyboard/tap accessible, no page-level horizontal scroll.

### 3. Task board (Tasks page + ProjectTasksPanel)

- Mobile layout = **single-column list per status with tabs**: To do / Doing / Done (+ counts).
- Task rows: larger tap targets (min 44px), status pill, due-date chip, assignee avatar, swipe-free — status changes via long-press action sheet or a status dropdown in the row.
- Sticky filter bar under the top app bar (client filter + search) that collapses on scroll.
- Calendar view: collapse to month grid with day-detail bottom sheet; skip week view on mobile.

### 4. Add/edit task — bottom sheet

- Replace the current dialog with a `BottomSheet` component on mobile (Radix Dialog styled as a sheet, or `vaul`).
  - Drag handle, dismiss on swipe-down or backdrop tap.
  - Full-height on keyboard open; fields stacked, large inputs, native date/select controls.
  - Primary "Save" button pinned to the sheet footer above the keyboard.
- Reuse the same sheet pattern for other quick-entry dialogs on mobile (new client, new invoice, new proposal, add secret, new batch) — no scope creep in fields, just presentation.

### 5. Per-screen mobile passes (Admin CRM only)

Tighten each admin screen to a single-column, thumb-reachable layout. No new features — layout, spacing, and control ergonomics only:

- **Dashboard / AdminDashboard** — stacked KPI cards, horizontal snap for card carousels only where already present.
- **Clients (roster)** — full-width rows already close; enlarge tap target, move sort into a small chip row, search sticky under top bar.
- **ClientDetail** — collapse the side meta panel into an accordion above tabs; tab strip becomes the mobile tabs pattern from §2.
- **ProjectDetail** — same tabs treatment; each tab's inner panels (Invoices, Proposals, Preview, Social, Secrets, Resources, Progress Reports, Automation Subscription, Contract, Portal Actions) reflow to single column with sheet-based edit forms.
- **Previews / PreviewDetail** — list rows enlarged; detail actions collapse into a bottom action bar.
- **Wiki** — list rows single column; editor gets a mobile toolbar that sticks above the keyboard; history/users/export pages stack.
- **Invites, Tokens (Settings), Profile** — stacked forms, full-width inputs, sheet confirmations.
- **AllTasks** — uses the new task board treatment from §3.

### 6. Technical details

- Add `vaul` (or build a small Radix-based `Sheet` primitive) for bottom sheets. Prefer `vaul` — small, well-tested, gesture-friendly.
- New files (approx):
  - `src/components/admin/mobile/MobileShell.tsx`
  - `src/components/admin/mobile/MobileTopBar.tsx`
  - `src/components/admin/mobile/MobileTabBar.tsx`
  - `src/components/admin/mobile/MobileTabs.tsx` (shared tab strip)
  - `src/components/ui/bottom-sheet.tsx`
- Edits: `AdminLayout.tsx` (branch on `useIsMobile`), `index.html` (viewport meta), `src/index.css` (global lock + safe-area vars + mobile utility classes), each admin page file for responsive spacing, `ProjectTasksPanel.tsx` + add-task dialog for tabs/sheet, `ProjectTabs.tsx` for mobile tabs.
- Keep desktop layouts untouched — every change gated on `useIsMobile()` or Tailwind `md:` breakpoints so nothing regresses on desktop.
- Preserve the editorial palette, Cormorant/Karla typography, and existing button styling rules from project memory.

### Out of scope

- Client Portal, Marketing site, Onboarding (can be a follow-up).
- Any business-logic / data-model changes.
- Turning the app into a true Capacitor native app (this is mobile-web only).
