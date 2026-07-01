import { describe, it, expect, beforeEach, vi } from 'vitest'

// mockApi.js holds module-level state (the games map) and loads from
// localStorage at import time. Reset the module registry and storage before
// each test so cases don't leak into one another.
beforeEach(() => {
  window.localStorage.clear()
  vi.resetModules()
})

async function freshApi() {
  const mod = await import('./mockApi.js')
  return mod.mockApiRequest
}

const SEED = '1234'

describe('POST /games', () => {
  it('starts a game and returns a 4-digit code', async () => {
    const api = await freshApi()
    const res = await api('POST', '/games')
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.code).toMatch(/^\d{4}$/)
  })

  it('a freshly started game has no notes', async () => {
    const api = await freshApi()
    const { code } = await (await api('POST', '/games')).json()
    const data = await (await api('GET', `/games/${code}/submitted-notes`)).json()
    expect(data.notes).toEqual([])
  })
})

describe('GET /games/:code/submitted-notes', () => {
  it('returns the seeded notes for the sample game', async () => {
    const api = await freshApi()
    const res = await api('GET', `/games/${SEED}/submitted-notes`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.notes)).toBe(true)
    expect(data.notes.length).toBeGreaterThan(0)
  })

  it('returns a copy, not the internal array', async () => {
    const api = await freshApi()
    const data = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    data.notes.push('mutated')
    const again = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    expect(again.notes).not.toContain('mutated')
  })

  it('404s for an unknown game code', async () => {
    const api = await freshApi()
    const res = await api('GET', '/games/9999/submitted-notes')
    expect(res.status).toBe(404)
  })
})

describe('DELETE /games/:code/submitted-notes', () => {
  it('clears the notes and persists the empty list', async () => {
    const api = await freshApi()
    const del = await api('DELETE', `/games/${SEED}/submitted-notes`)
    expect(del.ok).toBe(true)
    await expect(del.json()).resolves.toEqual({ notes: [] })

    const after = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    expect(after.notes).toEqual([])
  })

  it('survives a reload via localStorage', async () => {
    const api = await freshApi()
    await api('DELETE', `/games/${SEED}/submitted-notes`)

    // Re-import the module (fresh state) — it should load the cleared list.
    vi.resetModules()
    const reloaded = await freshApi()
    const after = await (await reloaded('GET', `/games/${SEED}/submitted-notes`)).json()
    expect(after.notes).toEqual([])
  })
})

describe('DELETE /games/:code', () => {
  it('ends a game so its notes are no longer reachable', async () => {
    const api = await freshApi()
    const del = await api('DELETE', `/games/${SEED}`)
    expect(del.ok).toBe(true)

    const after = await api('GET', `/games/${SEED}/submitted-notes`)
    expect(after.status).toBe(404)
  })
})

describe('rounds', () => {
  it('starts at round 0 with no prompt', async () => {
    const api = await freshApi()
    const { code } = await (await api('POST', '/games')).json()
    const data = await (await api('GET', `/games/${code}/round`)).json()
    expect(data).toEqual({ round: 0, prompt: '' })
  })

  it('draws a prompt and advances the round', async () => {
    const api = await freshApi()
    const { code } = await (await api('POST', '/games')).json()

    const res = await api('POST', `/games/${code}/rounds`)
    expect(res.status).toBe(201)
    const drawn = await res.json()
    expect(drawn.round).toBe(1)
    expect(typeof drawn.prompt).toBe('string')
    expect(drawn.prompt.length).toBeGreaterThan(0)

    // GET reflects the drawn round.
    const current = await (await api('GET', `/games/${code}/round`)).json()
    expect(current).toEqual(drawn)

    // A second draw advances to round 2.
    const second = await (await api('POST', `/games/${code}/rounds`)).json()
    expect(second.round).toBe(2)
  })

  it('clears submitted notes when a new round starts', async () => {
    const api = await freshApi()
    // The seeded game starts with notes; drawing a prompt clears them.
    const before = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    expect(before.notes.length).toBeGreaterThan(0)

    await api('POST', `/games/${SEED}/rounds`)
    const after = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    expect(after.notes).toEqual([])
  })

  it('404s drawing a prompt for an unknown game', async () => {
    const api = await freshApi()
    const res = await api('POST', '/games/9999/rounds')
    expect(res.status).toBe(404)
  })
})

describe('unknown routes', () => {
  it('returns a 404 response', async () => {
    const api = await freshApi()
    const res = await api('POST', '/nope')
    expect(res.status).toBe(404)
    expect(res.ok).toBe(false)
  })
})
