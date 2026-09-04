# KM Command operations board

Bookmark: **https://mwelsh84.github.io/km-command-board/**

This GitHub Pages URL (`*.github.io`) is **public**. Anyone with the link can read whatever is in `index.html`.

- Sealed personal-litigation items are never on this page.
- Chief of Staff (CoS) refreshes `index.html` on `main` after morning desks (and when the board changes).
- Nothing on the page sends mail.

## Files

- `index.html` — the live board (dark UI; auto-refresh every 5 minutes)
- `.nojekyll` — serve the root as static files
- `robots.txt` — `User-agent: *` / `Disallow: /` so crawlers do not index this URL

## Turn the URL on (owner, once)

Free personal GitHub Pages needs a **public** repo, then Pages from `main` / root:

1. Settings → General → Danger Zone → Change repository visibility → **Public**
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch** → Branch **`main`** / folder **`/` (root)** → Save

After that, https://mwelsh84.github.io/km-command-board/ is the live board. Later CoS updates are commits to `index.html` on `main`.
