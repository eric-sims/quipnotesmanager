import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('when VITE_OFFLINE is set', () => {
  it('flags IS_OFFLINE and routes requests to the mock backend', async () => {
    vi.stubEnv('VITE_OFFLINE', 'true')
    window.localStorage.clear()
    const { apiRequest, IS_OFFLINE } = await import('./api.js')

    expect(IS_OFFLINE).toBe(true)

    // Dispatches to the real mock (no fetch involved): the seeded game's
    // submitted-notes comes back with a notes payload, proving it never
    // touched the network.
    const res = await apiRequest('GET', '/games/1234/submitted-notes')
    const data = await res.json()
    expect(res.ok).toBe(true)
    expect(Array.isArray(data.notes)).toBe(true)
  })
})

describe('when VITE_OFFLINE is not set', () => {
  it('calls fetch against VITE_API_URL with a JSON body', async () => {
    vi.stubEnv('VITE_OFFLINE', 'false')
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const { apiRequest, IS_OFFLINE } = await import('./api.js')
    expect(IS_OFFLINE).toBe(false)

    await apiRequest('DELETE', '/game/submitted-notes', { reason: 'reset' }, { 'Content-Type': 'application/json' })

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/game/submitted-notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'reset' }),
    })
  })

  it('omits the body when none is given', async () => {
    vi.stubEnv('VITE_OFFLINE', 'false')
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const { apiRequest } = await import('./api.js')
    await apiRequest('GET', '/game/submitted-notes', null, { 'Content-Type': 'application/json' })

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/game/submitted-notes', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
  })
})
