# quipnotesmanager

Vue 3 admin / reader client for the quipNotes game. It reads the notes players
have turned in (`GET /game/submitted-notes`) and can clear them
(`DELETE /game/submitted-notes`). Each note renders as a "click to reveal" card
so a host can unveil them one at a time.

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run dev
```
Talks to the real server at `VITE_API_URL` (see `.env`, default
`http://localhost:8081`). The dev server runs on port **8082** so it doesn't
collide with the player client (8080) or the game server (8081).

### Run without a server (offline mode)
```
npm run dev:offline
```
Routes all API calls to an in-memory mock backend (`src/mockApi.js`) instead of
`fetch`, so the manager runs with no server. The mock implements the
submitted-notes contract, seeds a few sample ransom notes, and persists to
`localStorage` so state survives reloads. An "Offline mode" badge appears in the
UI so it's obvious you're on the mock.

### Compiles and minifies for production
```
npm run build
```
Preview the production build locally with `npm run preview`.

### Lints and fixes files
```
npm run lint
```

## Testing

Unit and component tests run on **Vitest** + **@vue/test-utils** (jsdom
environment). Run them with:

```
npm test            # single run
npm run test:watch  # watch mode
```

Tests live next to the code they cover (`src/**/*.test.js`). Current coverage:
the mock backend contract (`src/mockApi.test.js`), the `apiRequest` offline /
fetch dispatch (`src/api.test.js`), the `ClickCard` reveal toggle, and `App`'s
get/clear-notes wiring plus the offline badge. jsdom doesn't expose Web Storage
here, so `src/test-setup.js` installs a small in-memory `localStorage` polyfill
that `mockApi.js` persists against.

### Manual / exploratory testing

Use offline mode so you can exercise the full UI without standing up a server:

```
npm run dev:offline
```

Then walk the core flows:

- **Get Notes** → the seeded notes appear as cards, and the count updates.
- **Click a card** → it reveals the note; click again to hide it.
- **Clear Notes** → the cards disappear and the count drops to 0.
- **Reload the page** → a cleared list stays cleared (localStorage).

Reset mock state between runs:

```js
// in the browser devtools console
localStorage.removeItem('quipnotes.manager.mock.v1')
```

or just use a private/incognito window for a clean slate.

### Best practices

- **Test against the contract, not the server.** The submitted-notes endpoints
  (`GET /game/submitted-notes`, `DELETE /game/submitted-notes`) are the seam.
  `mockApi.js` encodes that contract — keep it and the real server in sync so
  offline tests stay meaningful.
- **Reset state between tests.** Clear `localStorage` (and `vi.resetModules()`)
  in a `beforeEach` so cases don't leak into each other — `mockApi.js` holds
  module-level state loaded at import time.

## Customize configuration
See the [Vite Configuration Reference](https://vite.dev/config/).
