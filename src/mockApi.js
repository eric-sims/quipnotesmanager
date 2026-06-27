// Mock backend that mirrors the quipNotes server's host/reader endpoints.
//
// Lets the manager run with no server: api.js routes here when VITE_OFFLINE
// is set. The manager only touches the submitted-notes contract:
//
//   GET    /game/submitted-notes  -> { notes: [ "...", ... ] }
//   DELETE /game/submitted-notes  -> { notes: [] }   (clears them)
//
// State is persisted to localStorage so submitted notes survive page reloads,
// and the store is seeded with a few sample ransom notes so the manager has
// something to reveal in offline mode.

const SEED_NOTES = [
  "the wizard demands your golden cheese before midnight",
  "i never ate the suspicious espresso",
  "nobody whispers but the haunted robot screams now",
  "return my tiny dragon and we forget the forbidden noodle",
]

const STORAGE_KEY = "quipnotes.manager.mock.v1"

let notes = [...SEED_NOTES]

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
    if (Array.isArray(data.notes)) notes = data.notes
  } catch (e) {
    console.warn("[mockApi] could not load saved state", e)
  }
}

function save() {
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ notes }))
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

const routes = [
  {
    method: "GET",
    match: (url) => url === "/game/submitted-notes",
    handle: () => jsonResponse({ notes: [...notes] }),
  },
  {
    method: "DELETE",
    match: (url) => url === "/game/submitted-notes",
    handle: () => {
      notes = []
      save()
      return jsonResponse({ notes: [] })
    },
  },
]

// Drop-in replacement for api.js#apiRequest's network call.
export async function mockApiRequest(method, url, body = null) {
  const route = routes.find((r) => r.method === method && r.match(url))
  if (!route) {
    console.warn(`[mockApi] unhandled ${method} ${url}`)
    return jsonResponse({ error: "not found" }, 404)
  }
  return route.handle(body, url)
}
