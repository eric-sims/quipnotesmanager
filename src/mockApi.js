// Mock backend that mirrors the quipNotes server's host endpoints.
//
// Lets the manager run with no server: api.js routes here when VITE_OFFLINE
// is set. The manager drives the host side of the contract:
//
//   POST   /games                          -> { code }   (start a game)
//   DELETE /games/:code                     -> 200        (end a game)
//   GET    /games/:code/submitted-notes     -> { notes: [ ... ] }  (cleared each round)
//   POST   /games/:code/rounds              -> { round, prompt }  (draw prompt)
//   GET    /games/:code/round               -> { round, prompt }
//   GET    /games/:code/players             -> { players: [{ id }] }  (roster)
//
// State is persisted to localStorage so games survive page reloads, and one
// sample game (code "1234") is seeded with a few ransom notes so the manager
// has something to reveal in offline mode.
//
// Offline has no WebSocket, and the player/manager mocks are separate
// registries, so live joins never reach here — the manager fetches the roster
// via GET /players (mirroring how offline polls GET /round). The sample game is
// seeded with a couple of players so offline hosting still shows a roster.

const SEED_NOTES = [
  "the wizard demands your golden cheese before midnight",
  "i never ate the suspicious espresso",
  "nobody whispers but the haunted robot screams now",
  "return my tiny dragon and we forget the forbidden noodle",
]

// Sample roster for the seeded game so offline hosting shows joined players.
const SEED_PLAYERS = [{ id: "Ada" }, { id: "Grace" }]

// A small built-in prompt bank so offline hosting can draw prompts. Each game
// gets its own shuffled copy (a "deck") so rounds vary per game.
const PROMPT_BANK = [
  "The worst possible thing to say on a first date",
  "A rejected slogan for an energy drink",
  "What the villain monologues about before losing",
  "A terrible name for a boat",
  "What your pet is really thinking about you",
  "The last text message before the world ended",
  "A motivational poster nobody asked for",
  "What the fortune cookie should have said",
  "A newspaper headline from the year 3000",
  "The title of your unauthorized autobiography",
]

const SEED_CODE = "1234"
const STORAGE_KEY = "quipnotes.manager.mock.v2"

function shuffled(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// games: { [code]: { notes: string[], deck: string[], cursor: number,
//                    round: number, prompt: string, players: {id}[] } }
let games = {
  [SEED_CODE]: {
    notes: [...SEED_NOTES],
    deck: shuffled(PROMPT_BANK),
    cursor: 0,
    round: 0,
    prompt: "",
    players: [...SEED_PLAYERS],
  },
}

// Draw the next prompt off a game's deck, reshuffling on exhaustion so it never
// runs out. Mirrors the server's StartRound.
function drawNextPrompt(game) {
  if (game.cursor >= game.deck.length) {
    game.deck = shuffled(PROMPT_BANK)
    game.cursor = 0
  }
  game.prompt = game.deck[game.cursor]
  game.cursor += 1
  game.round += 1
  game.notes = []
  return { round: game.round, prompt: game.prompt }
}

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
const ROUNDS_RE = /^\/games\/(\d{4})\/rounds$/
const ROUND_RE = /^\/games\/(\d{4})\/round$/
const PLAYERS_RE = /^\/games\/(\d{4})\/players$/

// Backfill round/roster fields on games persisted before they existed.
function withRoundFields(game) {
  if (!Array.isArray(game.deck)) game.deck = shuffled(PROMPT_BANK)
  if (typeof game.cursor !== "number") game.cursor = 0
  if (typeof game.round !== "number") game.round = 0
  if (typeof game.prompt !== "string") game.prompt = ""
  if (!Array.isArray(game.players)) game.players = []
  return game
}

// Drop-in replacement for api.js#apiRequest's network call. The manager's host
// endpoints take no request body, so it is accepted for signature parity only.
export async function mockApiRequest(method, url) {
  // Start a game.
  if (method === "POST" && url === "/games") {
    const code = newCode()
    games[code] = {
      notes: [],
      deck: shuffled(PROMPT_BANK),
      cursor: 0,
      round: 0,
      prompt: "",
      players: [],
    }
    save()
    return jsonResponse({ code }, 201)
  }

  // Current roster.
  const playersMatch = url.match(PLAYERS_RE)
  if (playersMatch && method === "GET") {
    const code = playersMatch[1]
    const game = games[code]
    if (!game) return jsonResponse({ error: `game ${code} not found` }, 404)
    return jsonResponse({ players: [...withRoundFields(game).players] })
  }

  // Draw the next prompt (start a round).
  const roundsMatch = url.match(ROUNDS_RE)
  if (roundsMatch && method === "POST") {
    const code = roundsMatch[1]
    const game = games[code]
    if (!game) return jsonResponse({ error: `game ${code} not found` }, 404)
    const result = drawNextPrompt(withRoundFields(game))
    save()
    return jsonResponse(result, 201)
  }

  // Current round.
  const roundMatch = url.match(ROUND_RE)
  if (roundMatch && method === "GET") {
    const code = roundMatch[1]
    const game = games[code]
    if (!game) return jsonResponse({ error: `game ${code} not found` }, 404)
    withRoundFields(game)
    return jsonResponse({ round: game.round, prompt: game.prompt })
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
