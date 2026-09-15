# KM Command operations board

Private internal board hosted on **Vercel only**. GitHub Pages is not a supported production host.

This is not a public page. Access is enforced by **Vercel Authentication** (Deployment Protection) for **All Deployments**, not by `robots.txt`, `noindex`, or an unknown URL.

- Sealed personal-litigation items are never on this page.
- Chief of Staff (CoS) refreshes `index.html` on `main` after morning desks (and when the board changes).
- Nothing on the page sends mail.
- Browser code contains **no secrets and no authorization tokens**. Approve / Decline `POST` to same-origin `/api/decide`. The Asana PAT stays on the server.
- **Other** opens the Asana permalink in the browser (Asana login still required to see the task). It does not call `/api/decide`.

## Files

- `index.html` — the live board (dark UI; auto-refresh every 5 minutes)
- `command-board.css` — static stylesheet (kept separate so CSP does not need `unsafe-inline`)
- `decide-board.js` — injects Approve / Decline / Other on Decide cards
- `api/decide.js` — Vercel function: `POST /api/decide` only
- `robots.txt` — `User-agent: *` / `Disallow: /` so well-behaved crawlers skip this URL. **This is not a security control.**

## Hosting (Vercel only)

Import this **private** repo on [Vercel](https://vercel.com/new) (Framework Preset: Other). Production is the Vercel deployment URL. The board and `/api/decide` share that origin.

Do **not** enable GitHub Pages. Do **not** point a public `*.github.io` URL at this board.

Production operates same-origin. There is no production CORS allow-list for GitHub Pages or `*.vercel.app`. Localhost CORS is allowed only when `NODE_ENV` is not `production` (local `npm run dev`).

### Vercel Authentication (required)

In the Vercel project:

1. Settings → Deployment Protection → **Vercel Authentication**
2. Protect **All Deployments** (Production + Preview)
3. Only people who can log into this Vercel project should open the board or call `/api/decide`

Test protection in an **incognito** (or private) window:

1. Open the production URL while signed out of Vercel.
2. You should get Vercel’s authentication / SSO gate, not the Command board.
3. `/api/decide` must also be gated: an unauthenticated `POST` should not reach Asana.

### Vercel env vars (Michael, once)

Project → Settings → Environment Variables (Production + Preview). Server-side only — never `NEXT_PUBLIC_*`:

| Name | Value |
| --- | --- |
| `ASANA_PAT` | Asana personal access token (alias: `ASANA_TOKEN`) |
| `ASANA_COMMAND_CENTER_PROJECT_GID` | `1215460449693075` |
| `ASANA_NEEDS_DECISION_SECTION_GID` | `1215460449693077` |

Do not commit these values. Copy `.env.example` to `.env` only on a local machine for `npm run dev`. Redeploy after saving env vars in Vercel.

`APPROVAL_SECRET` is retired. Remove it from Vercel if it is still set.

## GitHub settings (Michael, once)

1. Repository visibility: **Private**.
2. Settings → Pages: **Disable** GitHub Pages (no `main` / root deploy).
3. Confirm `https://mwelsh84.github.io/km-command-board/` no longer serves this board.

## Asana mapping

Command Center project `1215460449693075`. Use the existing section **Needs Decision** (`1215460449693077`). Do not create a new section.

Each Decide item is one Asana task (`default_task` — Approvals subtype is not available on this plan).

The server **does not trust** GIDs from the browser beyond the task id the user clicked. Before any write it fetches the Asana task and requires a membership in **that project and that section**. Tasks outside the workflow get HTTP 403.

| Card | Task GID | Permalink |
| --- | --- | --- |
| Ops · Asana Advanced | `1218244286398772` | [task](https://app.asana.com/1/1214552995115111/project/1215460449693075/task/1218244286398772) |
| Finance · Stephanie 2025 company packet | `1218244215193427` | [task](https://app.asana.com/1/1214552995115111/project/1215460449693075/task/1218244215193427) |
| Money · John Walnut consulting invoice | `1218244183839107` | [task](https://app.asana.com/1/1214552995115111/project/1215460449693075/task/1218244183839107) |
| Finance · QBO kirsten@ Access denied | *(placeholder — CoS injects GID)* | |

### What each button does

| Action | Asana |
| --- | --- |
| **Approve** | Mark complete (or `approval_status=approved` on approval subtype), then comment `Approved via KM Command Board.` |
| **Decline** | Mark complete (or `approval_status=rejected`), then comment `Declined via KM Command Board.` plus optional note. Simplest reliable close — we do **not** move the task to a Declined section. |
| **Other** | Does not call `/api/decide`. Opens `data-asana-url` in a new tab. |

`GET /api/decide` is rejected (HTTP 405). There is no confirmation page that writes to Asana.

The client does not send an actor name. Audit comments do not claim a human identity unless the server has a verified login (it currently does not read Vercel Authentication identity).

If the task is already completed or already has `approval_status` approved/rejected, the API returns `{ ok: true, alreadyDecided: true }` and does **not** post another comment or reverse the existing decision.

## CoS: new Decide cards

On each Decide `.item`:

```html
<div class="item"
  data-task-gid=""
  data-asana-url="">
```

Keep `decide-board.js` and `command-board.css` when you refresh the board. Do not invent GIDs — copy them from Asana. Do not add signatures or secrets to the HTML.

## Tests

```bash
npm test
```

Tests mock Asana. They do not call live Asana or deploy to Vercel.

Local board (no Vercel):

```bash
MOCK_ASANA=1 npm run dev
# http://127.0.0.1:4173/
```

`MOCK_ASANA=1` fakes Asana so you can click Approve without a PAT. Use the authorized project/section GIDs from `.env.example` if you run against the mock.
