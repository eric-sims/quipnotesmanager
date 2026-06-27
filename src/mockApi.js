// Mock backend that mirrors the quipNotes server's host endpoints.
//
// Lets the manager run with no server: api.js routes here when VITE_OFFLINE
// is set. The manager drives the host side of the contract:
//
//   POST   /games                          -> { code }   (start a game)
//   DELETE /games/:code                     -> 200        (end a game)
//   GET    /games/:code/submitted-notes     -> { notes: [ ... ] }
//   DELETE /games/:code/submitted-notes     -> { notes: [] }   (clears them)
//
// State is persisted to localStorage so games survive page reloads, and one
// sample game (code "1234") is seeded with a few ransom notes so the manager
// has something to reveal in offline mode.

const SEED_NOTES = [
  "the wizard demands your golden cheese before midnight",
  "i never ate the suspicious espresso",
  "nobody whispers but the haunted robot screams now",
  "return my tiny dragon and we forget the forbidden noodle",
]

const SEED_CODE = "1234"
const STORAGE_KEY = "quipnotes.manager.mock.v2"

// games: { [code]: { notes: string[] } }
let games = { [SEED_CODE]: { notes: [...SEED_NOTES] } }

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null // localStorage can throw in private-mode / sandboxed contexts
  }
}

function load() {
  const store = storage()
  if (!store) return
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data && typeof data.games === "object" && data.games !== null) {
      games = data.games
    }
  } catch (e) {
    console.warn("[mockApi] could not load saved state", e)
  }
}

function save() {
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ games }))
  } catch (e) {
    console.warn("[mockApi] could not save state", e)
  }
}

load()

// Wrap a payload so it quacks like a fetch Response for the manager's usage:
// response.ok, response.status, response.json().
function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }
}

function newCode() {
  let code
  do {
    code = String(Math.floor(Math.random() * 10000)).padStart(4, "0")
  } while (games[code])
  return code
}

// Match "/games/:code" and "/games/:code/submitted-notes".
const NOTES_RE = /^\/games\/(\d{4})\/submitted-notes$/
const GAME_RE = /^\/games\/(\d{4})$/

// Drop-in replacement for api.js#apiRequest's network call. The manager's host
// endpoints take no request body, so it is accepted for signature parity only.
export async function mockApiRequest(method, url) {
  // Start a game.
  if (method === "POST" && url === "/games") {
    const code = newCode()
    games[code] = { notes: [] }
    save()
    return jsonResponse({ code }, 201)
  }

  // Read / clear a game's notes.
  const notesMatch = url.match(NOTES_RE)
  if (notesMatch) {
    const code = notesMatch[1]
    const game = games[code]
    if (!game) return jsonResponse({ error: `game ${code} not found` }, 404)

    if (method === "GET") {
      return jsonResponse({ notes: [...game.notes] })
    }
    if (method === "DELETE") {
      game.notes = []
      save()
      return jsonResponse({ notes: [] })
    }
  }

  // End a game.
  const gameMatch = url.match(GAME_RE)
  if (gameMatch && method === "DELETE") {
    const code = gameMatch[1]
    if (!games[code]) return jsonResponse({ error: `game ${code} not found` }, 404)
    delete games[code]
    save()
    return jsonResponse({}, 200)
  }

  console.warn(`[mockApi] unhandled ${method} ${url}`)
  return jsonResponse({ error: "not found" }, 404)
}
