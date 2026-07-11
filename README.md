# Quipnotes — host/manager client

The big-screen **host client** for [Quipnotes](#the-system), a party game where players
arrange word tiles into a "ransom note" answering a prompt. The host starts a game, shows
the 4-digit join code (with a scannable QR deep-link), draws each round's prompt, and drives
the shared board — the live scoreboard, each player's submitted note, and the reveal when
the judge picks a favorite.

Built with **Vue 3 + Vite**. Like the player client, it's a pure client: the
[game server](#the-system) owns all state, and this app reflects it over REST plus a live
WebSocket event stream.

## The system

Quipnotes is three independently-versioned projects (each its own git repo):

| Project | Role |
| --- | --- |
| `quipnotes` | Go + Gin game server — the source of truth for all game state |
| `quipnotesclient` | Player client — join with a name + code, draw, submit, judge |
| **`quipnotesmanager`** (this repo) | Host/manager client — start a game, show the code, drive the board |

## What the host does

- **Start a game** (`POST /games`) and share the 4-digit code — shown as a giant hero with
  a **QR deep-link** and a **Copy invite** button. A **family-friendly toggle** in the lobby
  limits the game's prompts to family-friendly ones (fixed once the game starts).
- **Draw each round's prompt** (`POST /games/:code/rounds`), pushed live to every phone.
- **Watch the board fill** — a live player roster/scoreboard, an "Answered: n/total" count,
  and each submitted note as a face-down slate that flips when the judge reveals it.
- **See the winner** — the favorite is badged and the author's score ticks up.
- **Save a keepsake** — "📸 Save image" renders the prompt + notes to a PNG.

## Quick start

```bash
npm install
npm run dev            # dev server on http://localhost:8082
```

`npm run dev` talks to the real backend at `VITE_API_URL` (default `http://localhost:8081` —
start the `quipnotes` server first). Port **8082** keeps it clear of the player client
(8080) and the game server (8081).

### Run without a server (offline mode)

```bash
npm run dev:offline
```

Routes every API call to an in-memory mock backend ([`src/mockApi.js`](src/mockApi.js))
instead of `fetch`, so the manager runs with **no server**. The mock seeds a sample game
(code `1234`) with a couple of scored players so the scoreboard and board are populated,
persists to `localStorage`, and shows an "Offline mode" badge in the UI.

### Other scripts

```bash
npm run build          # production build (Vite)
npm run preview        # preview the production build locally
npm run lint           # eslint --fix — keep this green before pushing
npm test               # Vitest, single run
npm run test:watch     # Vitest, watch mode
```

## Configuration

Vite loads these from mode-specific `.env` files:

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `.env`, `.env.production` | Backend base URL. The WebSocket URL is derived from it (`http`→`ws`), so `https` yields a secure `wss`. |
| `VITE_CLIENT_URL` | `.env`, `.env.production` | Player-client base URL used to build the invite QR / deep-link (`?code=1234`). |
| `VITE_OFFLINE` | `.env.offline` | `true` routes all calls to `mockApi.js` (set by `dev:offline`). |

## Architecture

- **`src/api.js`** — a generic `apiRequest(method, url, body)`; routes to `mockApi.js` when
  `VITE_OFFLINE=true`, else `fetch` against `VITE_API_URL`.
- **`src/App.vue`** — lobby vs. hosting. Adaptive layout: before any prompt is drawn the
  code is a centered hero with the join QR; once a round starts the code shrinks to a corner
  badge so the prompt and note board take center stage. Reads the roster/board from the
  `players`/`submission`/`note_flipped`/`favorite_picked` events (online) or by fetching
  `GET /players` and the note board (offline).
- **`src/socket.js`** — the same resilient `WebSocket` wrapper as the player client, opened
  while hosting for live round/judging/roster events.
- **`src/mockApi.js`** — the in-memory offline backend, persisted to `localStorage`
  (key `quipnotes.manager.mock.v2`); mirrors the server's judging contract.
- **`src/components/`** — `NoteSlate.vue` (a controlled, one-way flip card),
  `PlayerRoster.vue` (the scoreboard, with a gavel on the judge), and `PromptCard.vue`.
- **`src/noteImage.js`** — renders the prompt + notes to a keepsake PNG on an offscreen
  canvas (dependency-free, deterministic; not a DOM screenshot).
- **`src/clipboard.js`** — the async Clipboard API (with an `execCommand` fallback) behind
  the "Copy invite" button.

The player, manager, and server all speak the same wire protocol; keep `mockApi.js` in sync
with the server whenever an endpoint changes.

## Testing

Unit and component tests run on **Vitest** + **@vue/test-utils** (jsdom). Tests sit next to
the code they cover (`src/**/*.test.js`).

```bash
npm test               # single run
npm run test:watch     # watch mode
```

Guidelines:

- **Test the contract, not the server.** `mockApi.js` encodes the server's contract —
  assert against it so offline tests stay meaningful.
- **Reset state between tests.** Clear `localStorage` (and call `vi.resetModules()`) in a
  `beforeEach` — `mockApi.js` holds module-level state loaded at import time. jsdom doesn't
  provide Web Storage here, so `src/test-setup.js` installs an in-memory polyfill.

To reset the offline mock manually, run
`localStorage.removeItem('quipnotes.manager.mock.v2')` in the devtools console, or just use
a private window.

## Development notes

Despite the legacy name, this is **Vite + Vitest**, not Vue CLI. It's its own git repo —
branch off the latest `master` and open a PR rather than committing straight to `master`.
See [Vite Configuration Reference](https://vite.dev/config/) to customize the build.

## License

The code in this repository is licensed under the [MIT License](LICENSE).

The Ransom Notes word tiles and prompt cards are **proprietary** to Very Special Games and
are **not** covered by this license — none are committed here.
