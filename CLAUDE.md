# Range Finder — contributor notes

Vite + React 19 + TypeScript PWA. No backend; all data in IndexedDB via `src/store/db.ts`.
Deployed to Azure Static Web Apps (Free) by the Azure-generated GitHub workflow on push to `main`; Oryx runs `npm run build`, output `dist/`.

## Layout
- `src/app/` — shell (`App.tsx` tabs), `styles.css` (design tokens + primitives), `ui.tsx` (Sheet, Field, Seg, ConfirmButton), `geo.ts` (haversine, bearing, unit conversions), `useGps.ts` (shared GPS watcher, `collectFixes`, `useWakeLock`).
- `src/store/types.ts` — all domain types. `src/store/db.ts` — `useCollection`, `useDoc`, `put`, `remove`, `create`, `useSettings`.
- `src/features/<name>/` — one folder per tab. A feature owns only its folder. Default export `<Name>Page`.

## Rules
- Phone-first UI, dark theme, use the classes in `styles.css` (`.panel`, `.btn`, `.list`, `.field`, `.big-readout`, `table.data`…) before inventing new CSS. Feature CSS goes in `src/features/<name>/<name>.css`, imported by the page.
- No `alert`/`confirm`/`prompt`; use `ConfirmButton` or inline UI.
- Units: store meters, m/s, °C, hPa internally where types say so; display per `useSettings()` (yd/m, fps/mps, F/C). `geo.ts` has conversions.
- Persist only through `db.ts`. Add new collections to `types.ts` Schema + `COLLECTIONS` in `db.ts` only if truly needed (bump DB_VERSION).
- `npm run typecheck && npm run build` must pass. Pure logic (solvers, parsers) gets a vitest `*.test.ts` next to it.
- CSP: only `https://api.open-meteo.com` is allowed for fetch. No other external hosts, no CDN scripts.

## Access
Invite-only via SWA built-in auth (Microsoft/`aad`), role `shooter`. Static files stay public; `src/app/access.ts` checks `/.auth/me` on launch (see comment there for why). `/api/*` is gated to `shooter` in `staticwebapp.config.json`. Invite users in the portal: Static Web App → Role management → Invite → role `shooter`. Local dev (`localhost`) skips the check.
