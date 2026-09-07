# KM Command operations board

Live static copy (GitHub Pages): **https://mwelsh84.github.io/km-command-board/**

This GitHub Pages URL (`*.github.io`) is **public**. Anyone with the link can read whatever is in `index.html`.

- Sealed personal-litigation items are never on this page.
- Chief of Staff (CoS) refreshes `index.html` on `main` after morning desks (and when the board changes).
- Nothing on the page sends mail.
- **Approve / Decline** write a comment on one Asana task and mark it complete. They are HMAC-signed so a random visitor cannot forge a write. **Other** opens the Asana permalink (Asana login still required to see the task).

## Files

- `index.html` — the live board (dark UI; auto-refresh every 5 minutes)
- `decide-board.js` — injects Approve / Decline / Other on Decide cards
- `api/decide.js` — Vercel function: `GET|POST /api/decide`
- `scripts/mint-decide-url.mjs` — mint signed URLs + `data-sig-*` attributes
- `.nojekyll` — serve the root as static files
- `robots.txt` — `User-agent: *` / `Disallow: /` so crawlers do not index this URL

## Hosting

GitHub Pages still serves the static board. Buttons that **write** to Asana need the Vercel function.

**Recommended:** import this repo on [Vercel](https://vercel.com/new) (Framework Preset: Other). After deploy, the board and `/api/decide` share an origin — use that URL as the live Command board.

If you keep the GitHub Pages bookmark, point the board at Vercel:

```html
<meta name="km-decide-api" content="https://YOUR-PROJECT.vercel.app/api/decide" />
```

CORS allows `https://mwelsh84.github.io`, `*.vercel.app`, and localhost.

### Vercel env vars (Michael, once)

Project → Settings → Environment Variables (Production + Preview):

| Name | Value |
| --- | --- |
| `ASANA_PAT` | Asana personal access token (alias: `ASANA_TOKEN`) |
| `APPROVAL_SECRET` | Long random string, e.g. `openssl rand -hex 32` |

Do not commit either value. Copy `.env.example` to `.env` only on the machine that runs `npm run mint`.

Redeploy after saving env vars.

## Asana mapping

Command Center project `1215460449693075`. Use the existing section **Needs Decision** (`1215460449693077`). Do not create a new section.

Each Decide item is one Asana task (`default_task` — Approvals subtype is not available on this plan).

| Card | Task GID | Permalink |
| --- | --- | --- |
| Ops · Asana Advanced | `1218244286398772` | [task](https://app.asana.com/1/1214552995115111/project/1215460449693075/task/1218244286398772) |
| Finance · Stephanie 2025 company packet | `1218244215193427` | [task](https://app.asana.com/1/1214552995115111/project/1215460449693075/task/1218244215193427) |
| Money · John Walnut consulting invoice | `1218244183839107` | [task](https://app.asana.com/1/1214552995115111/project/1215460449693075/task/1218244183839107) |
| Finance · QBO kirsten@ Access denied | *(placeholder — CoS injects GID)* | |

### What each button does

| Action | Asana |
| --- | --- |
| **Approve** | Comment `Approved via Command` (plus optional `Actor:`), then mark complete. If the task is an approval subtype, set `approval_status=approved` instead. |
| **Decline** | Comment `Declined via Command` plus optional note, then mark complete (or `approval_status=rejected`). Simplest reliable close — we do **not** move the task to a Declined section. |
| **Other** | Does not complete the task. Client opens `data-asana-url` (or the permalink returned by the API). |

Already-complete tasks still get the comment; the complete call is skipped.

## HMAC signed URLs

Paper-only security: anyone who has a signed URL for a task+action can fire that action. Do not post signed Approve/Decline URLs in a public channel you do not trust.

Message (UTF-8):

```text
{taskGid}:{action}
```

`action` is `approve`, `decline`, or `other`. Signature is **HMAC-SHA256** hex with `APPROVAL_SECRET`.

### Mint with Node

```bash
cp .env.example .env   # then put APPROVAL_SECRET in .env
set -a && source .env && set +a
npm run mint -- 1218244286398772 https://YOUR-PROJECT.vercel.app/api/decide
```

Paste the printed `data-sig-approve` / `data-sig-decline` / `data-sig-other` onto that card in `index.html`. Approve / Decline stay disabled until those attributes are 64-char hex.

### Mint with openssl + curl

```bash
TASK_GID=1218244286398772
ACTION=approve
SIG=$(printf '%s' "${TASK_GID}:${ACTION}" | openssl dgst -sha256 -hmac "$APPROVAL_SECRET" -hex | awk '{print $NF}')

# Signed GET (opens a dark confirmation page)
echo "https://YOUR-PROJECT.vercel.app/api/decide?taskGid=${TASK_GID}&action=${ACTION}&sig=${SIG}"

# POST
curl -sS -X POST 'https://YOUR-PROJECT.vercel.app/api/decide' \
  -H 'Content-Type: application/json' \
  -d "{\"taskGid\":\"${TASK_GID}\",\"action\":\"${ACTION}\",\"sig\":\"${SIG}\",\"actor\":\"Michael\",\"note\":\"\"}"
```

POST body: `{ taskGid, action: "approve"|"decline"|"other", actor?, note?, sig }`.

## CoS: new Decide cards

On each Decide `.item`:

```html
<div class="item"
  data-task-gid=""
  data-asana-url=""
  data-sig-approve=""
  data-sig-decline=""
  data-sig-other="">
```

Keep `decide-board.js` and the `km-decide-api` meta tag when you refresh the board. Do not invent GIDs — copy them from Asana.

## Tests

```bash
npm test
```

Local board (no Vercel):

```bash
APPROVAL_SECRET=dev MOCK_ASANA=1 npm run dev
# http://127.0.0.1:4173/
```

`MOCK_ASANA=1` fakes Asana so you can click Approve without a PAT. Mint signatures with the same `APPROVAL_SECRET` and paste them onto the cards.

## Turn GitHub Pages on (owner, once)

Free personal GitHub Pages needs a **public** repo, then Pages from `main` / root:

1. Settings → General → Danger Zone → Change repository visibility → **Public**
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch **`main`** / folder **`/` (root)** → Save

After that, https://mwelsh84.github.io/km-command-board/ is the public static board. Later CoS updates are commits to `index.html` on `main`.
