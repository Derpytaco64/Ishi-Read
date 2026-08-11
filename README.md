# Ishi-Read

A self-hosted, multi-user EPUB/audiobook reader server. It started as a clone of [Thorium Web](https://github.com/edrlab/thorium-web) and has since grown accounts, a library/shelving system, audiobook support, server-side progress sync, and a bunch of reader-quality-of-life fixes on top of it.

### Disclaimer
I cloned the Thorium repository and have been vibecoding the hell out of it so that the reader and library page behave the way I want them to. I can not promise that this is a stable, secure, or well engineered app, but I can say that I test every feature I try to have Claude make so that it functions at the least. If you happen to try this personal project, bug reports would be nice.

## Screenshots (Old)
![](./screenshots/Screenshot_20260725_011246.png)
![](./screenshots/Screenshot_20260725_011309.png)
![](./screenshots/Screenshot_20260725_011340.png)
![](./screenshots/Screenshot_20260725_011434.png)
![](./screenshots/Screenshot_20260725_011446.png)
![](./screenshots/Screenshot_20260725_011514.png)
![](./screenshots/Screenshot_20260725_011536.png)

## Install
- For now I think you can just install it from Docker Hub: `dt64/ishi-read`. A `Dockerfile` and `docker-compose.yml` are included in this repo if you'd rather build it yourself.
- You will need to set up a reverse proxy (e.g. nginx) so Readium can serve covers, metadata, and manifests over HTTPS to non-local devices — Readium doesn't like cross-origin/mixed-content requests.
- A first-run setup wizard walks you through picking a book folder, a userdata folder, and the Readium URL/port on first launch.

## Nginx (required)
Ishi-Read runs **two** servers side by side: the Next.js app (port `3000`) and the Readium CLI server (`readium serve`, port `15080` by default) that actually streams manifests, covers, and page images to the reader. A reverse proxy in front of both is not optional if you want anything but local, plain-HTTP access:

- **Readium itself has no HTTPS/TLS support** — `readium serve` only speaks plain HTTP. If the Next.js app is served over HTTPS (which it needs to be for cookies/auth to work correctly off `localhost`) but Readium is still plain HTTP, browsers block the mixed-content requests and books simply fail to load their manifest, cover, or pages.
- The reader's client-side code calls the Readium URL directly from the browser, so Readium has to be reachable at a real hostname/port from wherever you're reading — not just from inside the server/container.
- Without a shared origin, cross-origin requests from the app to Readium can also get blocked outright depending on browser/network config.

The fix is to put nginx (or any reverse proxy) in front of both processes, terminate TLS there, and forward to each backend by path or subdomain. A minimal example, assuming both processes run on the same host:

```nginx
server {
    listen 443 ssl;
    server_name reader.example.com;

    ssl_certificate     /etc/letsencrypt/live/reader.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/reader.example.com/privkey.pem;

    # Next.js app
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Readium server (manifests, covers, page images)
    location /readium/ {
        proxy_pass http://127.0.0.1:15080/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then point the admin panel's **Readium URL** setting at `https://reader.example.com/readium` so the browser fetches Readium through the same HTTPS origin instead of hitting the raw HTTP port directly. If you're running via the included `docker-compose.yml`, set `READIUM_ADDRESS=0.0.0.0` (already set there) so the container's Readium process is reachable from outside the container for nginx to proxy to, and set `ISHI_INSECURE_COOKIES=true` only if you are *not* fronting the app with HTTPS — remove it once nginx is terminating TLS.

## Built on
Ishi-Read isn't built from scratch — it's a heavily modified fork of Thorium Web, layered on top of the Readium web toolkit. Credit for the reading-engine foundation goes to [EDRLab](https://www.edrlab.org/) and the [Readium](https://readium.org/) project.

- [**edrlab/thorium-web**](https://github.com/edrlab/thorium-web) — the Next.js reader app this repo was forked from. The core reading UI, plugin/preferences architecture, and component structure all trace back to this.
- [**readium/ts-toolkit**](https://github.com/readium/ts-toolkit) — source of the `@readium/shared` and `@readium/navigator` packages: the EPUB/audio navigators, locators, and publication model everything here is built on.
- [**readium/navigator-html-injectables**](https://github.com/readium/ts-toolkit) — the scripts Readium injects into EPUB iframes for selection, highlighting, and text-anchoring (`@readium/navigator-html-injectables`, same monorepo as above).
- [**readium/css**](https://github.com/readium/css) — the reflowable/FXL EPUB stylesheets and reading-system CSS variables (`@readium/css`).
- [**readium/cli**](https://github.com/readium/cli) — the bundled `readium` binary (`readium_linux_x86_64/`) that serves publication manifests, covers, and assets; built on [readium/go-toolkit](https://github.com/readium/go-toolkit).
- [**edrlab/thorium-locales**](https://github.com/edrlab/thorium-locales) — the upstream translation strings Thorium Web's own UI pulls from (`@edrlab/thorium-locales`); this repo layers its own additions on top since these get regenerated on every `pnpm build` — see the i18n note below.

## Features & Additions

### From Thorium Web (base)
- EPUB (reflowable + fixed layout) rendering via the Readium navigator, with fast, accessible pagination and scrolling.
- Themeable reading experience: font size, font family, line height, word/letter spacing, light/dark/sepia themes.
- Plugin/action architecture (toolbar actions, overflow menu, preferences panels) that most of the additions below are built on top of.

### Accounts & Security
- Jellyfin-style multi-user login: username/password auth with scrypt password hashing, httpOnly-cookie file-backed sessions, and lockout after repeated failed attempts.
- `/login` account picker, per-user profile editing (display name, password, avatar upload).
- Admin panel (`/admin`) for creating/editing/deleting users and unlocking locked-out accounts.
- Optional passwordless accounts (with safeguards so a passwordless account can't be promoted to admin).
- First-run setup wizard (`/setup`) that gates the whole app until an admin configures the book folder, userdata folder, and Readium URL — with backward-compatible detection so existing installs are never forced through it.
- Every API route is guarded server-side (session-validating proxy layer + a defense-in-depth check per-route); server-wide config (book folder, Readium URL/port, userdata folder) is admin-only.

### Library & Organization
- Full-text library search: title, author, genre, release-date range, and page-count range.
- Recursive subdirectory scanning of the book folder.
- Custom shelves — user-created, emoji-icon, accent-color-themed, manageable from a right-click context menu on any book.
- Automatic series shelves generated from Readium metadata, with a series detail/carousel view and correct volume-number ordering.
- "Continue Series"/last-read and "Recently Added" home-page carousels (recently-added capped at 20), navigable via left/right arrows instead of taking up a full grid.
- Book detail/metadata view, including both Readium's calculated 1024-character "pages" and pages recalculated for the current viewport.
- One-click userdata backup from the profile menu.
- Locally-scoped (not server-synced) cover-size and most other reader display settings, so they don't leak across devices sharing an account.

### Reader
- Server-side position/progress tracking — moved off browser localStorage entirely, keyed to a deterministic content hash (KOsync-style) so progress follows the book across devices.
- Position-drift correction: font-size changes, fullscreen toggling, and paginated↔scroll switches re-anchor to the actually-visible text (via Readium's own `first_visible_locator` text-anchoring pipeline) instead of drifting to the wrong page.
- Manual margin and font-size sliders.
- Landscape images span two pages automatically in double-column mode.
- Extra keyboard shortcuts: Tab for table of contents, Up/Down to zoom, Escape to exit to library.
- Highlighting, bookmarking, and notes, all accessible outside the book itself (not just in-reader), with bookmarks/notes/highlights labeled by their actual chapter/ToC name instead of raw EPUB appendix titles.
- Dictionary integration.
- Click-to-expand images with an easy-to-dismiss overlay.
- Dynamic page numbering that recalculates against the current viewport rather than a fixed page count.
- Reading Timer: tracks time spent reading, with save/reset, a running words-per-minute estimate (globally sampled so it doesn't skew per-book), and a history of completed reading sessions you can review or delete.

### Audiobooks
- Single-file `.m4b` audiobook scanning and playback via Readium's `AudioNavigator`.
- Listening Timer with a lifetime (never-reset) accumulated-seconds total per book, separate from the ebook Reading Timer's per-session reset model.
- Completed Listens history (start/finish timestamps) and daily listening history, mirroring the ebook stats but intentionally simpler.
- Client-side backfill of `totalProgression` during playback — Readium's navigator only computes per-track progression for audio, so this repo fills in the whole-book percentage the library grid and progress rings depend on.

### Stats
- Per-user stats page (from the profile menu): total books, minutes spent reading and listening, average WPM, and counts of each annotation type.
- Ebook vs. audiobook stats are split by hashing files directly, since progress/position data is keyed by content hash rather than file extension.

### Server / Deployment
- Configurable Readium URL and port from the admin panel, for proxying Readium behind nginx/SSL for remote access.
- Dockerized deployment (`dt64/ishi-read` on Docker Hub, plus a local `Dockerfile`/`docker-compose.yml`), with a dedicated config volume separate from the book/userdata mounts.
- User-data folder migration tooling, usable both from the setup wizard and later from the admin panel.

## License
Thorium Web, and by extension the parts of this repo derived from it, is licensed under the [BSD-3-Clause license](https://opensource.org/licenses/BSD-3-Clause).

## Acknowledgments
This project is built on the work of [EDRLab](https://www.edrlab.org/) and the [Readium](https://readium.org/) project — see [Built on](#built-on) above — as well as [React](https://reactjs.org/), [React Aria](https://react-spectrum.adobe.com/react-aria/index.html), and [Material Symbols and Icons](https://fonts.google.com/icons).
