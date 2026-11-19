# Eye Clinic - web client

React 19 + TypeScript (strict) + Vite. Talks to the Express API in `../server`.

## Scripts

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Dev server on http://localhost:5173 (proxies `/api`)   |
| `npm run build`        | Type-check, then production build into `dist/`         |
| `npm run check`        | Type-check + lint + tests (run before committing)      |
| `npm run typecheck`    | TypeScript only                                        |
| `npm run lint`         | oxlint (React, hooks, TypeScript, accessibility rules) |
| `npm run test`         | Vitest + Testing Library, once                         |
| `npm run test:watch`   | Tests in watch mode                                    |
| `npm run format`       | Prettier: format all source files                      |
| `npm run format:check` | Prettier: fail if anything is unformatted              |

## Folder layout

```
src/
  main.tsx              Entry point: providers + <App />
  app/                  App shell: routing, auth, providers
    App.tsx             Auth gate, layout, route → page
    routes.ts           Route type, parseRoute, navigate, breadcrumbs, tab titles
    useAuth.ts          Signed-in user, sign-out (manual / idle)
    useHashRoute.ts     Current route from the URL hash
  components/
    ui/                 Reusable building blocks (no app knowledge) - start here
    layout/             TopBar, IdleWarningDialog
    *.tsx               Domain components (VisitTodayTick, CameraCapture, …)
  hooks/                Reusable hooks (usePatientList, useLeaveGuard, useIdleLogout, …)
  lib/                  Non-React code: API client, errors, formatting, PDF, WhatsApp
  pages/                One component per screen
  diseaseForms/         Disease form catalog, form renderer and context
  test/setup.ts         Test setup (DOM matchers)
```

Imports use the `@/` alias for `src/` (`import { api } from '@/lib/api'`). Files in the same
folder import each other with `./`.

## Shared UI components (`@/components/ui`)

Use these instead of writing raw markup, so every screen looks and behaves the same:

| Component                                   | Use for                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                                    | All buttons. `variant`: primary, secondary, danger, danger-outline, link. `busy` + `busyLabel` while saving. Defaults to `type="button"`.                              |
| `TextField`, `SelectField`, `TextAreaField` | Labelled form controls (label, hint and error linked for screen readers).                                                                                              |
| `Field`                                     | Same, for custom controls: `<Field label="Date">{({ id }) => <DateInput id={id} />}</Field>`                                                                           |
| `Card`                                      | White panel with optional `title` and `actions`.                                                                                                                       |
| `PageHeader`                                | Page title + subtitle + action buttons.                                                                                                                                |
| `DataTable`                                 | Typed tables: define `columns` once, pass `rows`. `onRowClick`, `stopRowClick` for checkbox/button cells.                                                              |
| `Tabs`                                      | Pill tabs with proper `tab` roles.                                                                                                                                     |
| `Modal`                                     | Dialogs (focus handling, Escape to close).                                                                                                                             |
| `Notice`, `EmptyState`, `LoadingBlock`      | Banners, empty lists, loading spinners.                                                                                                                                |

Helpers: `errorMessage(err, fallback)` (`@/lib/errors`) for messages from caught errors;
`formatDate` ("15 Nov 2026"), `formatDateTime`, `formatMonth`, `formatSize` (`@/lib/format`);
`cx(...)` (`@/lib/cx`) to join class names. Always show dates through `formatDate`, never raw
`YYYY-MM-DD` or `toLocaleDateString()`.

Hooks: `useLeaveGuard(dirty)` for unsaved-changes warnings, `usePatientList` for the paged patient list.

## Conventions

- Never store or handle the login token in the browser: the server keeps it in an HttpOnly
  cookie. All calls go through `request()` in `lib/api.ts`, which adds the
  `X-Requested-With` header the server requires for changes. Images and downloads use plain
  URLs (the cookie is sent automatically).
- Strict TypeScript: no `any`; type-only imports use `import type`.
- Forms that can lose work call `useLeaveGuard(dirty)` and `clearLeaveGuard()` after saving.
- Data loading lives in hooks (see `hooks/usePatientList.ts`), pages stay presentational.
- User-facing text uses a plain hyphen "-", never the long em dash.
- Tests sit next to the code they test: `thing.ts` → `thing.test.ts`.

## Known lint warnings

`npm run lint` passes with warnings only. Most are in the long legacy forms (`VisitForm`,
`StatsPage` filters, parts of `PatientDetail`): labels not yet linked to inputs and
effect-dependency notes. Moving those forms onto `TextField` / `Field` clears them.
