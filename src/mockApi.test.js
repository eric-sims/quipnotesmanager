import { describe, it, expect, beforeEach, vi } from 'vitest'

// mockApi.js holds module-level state (the notes array) and loads from
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

describe('GET /game/submitted-notes', () => {
  it('returns the seeded notes', async () => {
    const api = await freshApi()
    const res = await api('GET', '/game/submitted-notes')
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.notes)).toBe(true)
    expect(data.notes.length).toBeGreaterThan(0)
  })

  it('returns a copy, not the internal array', async () => {
    const api = await freshApi()
    const data = await (await api('GET', '/game/submitted-notes')).json()
    data.notes.push('mutated')
    const again = await (await api('GET', '/game/submitted-notes')).json()
    expect(again.notes).not.toContain('mutated')
  })
})

describe('DELETE /game/submitted-notes', () => {
  it('clears the notes and persists the empty list', async () => {
    const api = await freshApi()
    const del = await api('DELETE', '/game/submitted-notes')
    expect(del.ok).toBe(true)
    await expect(del.json()).resolves.toEqual({ notes: [] })

    const after = await (await api('GET', '/game/submitted-notes')).json()
    expect(after.notes).toEqual([])
  })

  it('survives a reload via localStorage', async () => {
    const api = await freshApi()
    await api('DELETE', '/game/submitted-notes')

    // Re-import the module (fresh state) — it should load the cleared list.
    vi.resetModules()
    const reloaded = await freshApi()
    const after = await (await reloaded('GET', '/game/submitted-notes')).json()
    expect(after.notes).toEqual([])
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
