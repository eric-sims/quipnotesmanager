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

describe('GET /games/:code/players', () => {
  it('returns the seeded roster as { id } objects for the sample game', async () => {
    const api = await freshApi()
    const res = await api('GET', `/games/${SEED}/players`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(Array.isArray(data.players)).toBe(true)
    expect(data.players.length).toBeGreaterThan(0)
    expect(data.players[0]).toHaveProperty('id')
  })

  it('a freshly started game has an empty roster', async () => {
    const api = await freshApi()
    const { code } = await (await api('POST', '/games')).json()
    const data = await (await api('GET', `/games/${code}/players`)).json()
    expect(data.players).toEqual([])
  })

  it('returns a copy, not the internal array', async () => {
    const api = await freshApi()
    const data = await (await api('GET', `/games/${SEED}/players`)).json()
    data.players.push({ id: 'mutated' })
    const again = await (await api('GET', `/games/${SEED}/players`)).json()
    expect(again.players.map((p) => p.id)).not.toContain('mutated')
  })

  it('404s for an unknown game code', async () => {
    const api = await freshApi()
    const res = await api('GET', '/games/9999/players')
    expect(res.status).toBe(404)
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
  it('starts at round 0 with no prompt, judge, or winner', async () => {
    const api = await freshApi()
    const { code } = await (await api('POST', '/games')).json()
    const data = await (await api('GET', `/games/${code}/round`)).json()
    expect(data).toEqual({
      round: 0,
      prompt: '',
      judgeId: '',
      judgingOpen: false,
      count: 0,
      total: 0,
      favoriteNoteId: 0,
      winnerId: '',
    })
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

describe('judging', () => {
  it('seeded notes are wire-shaped: stable 1-based ids, face-down', async () => {
    const api = await freshApi()
    const data = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    for (const [i, note] of data.notes.entries()) {
      expect(note.id).toBe(i + 1)
      expect(Array.isArray(note.tokens)).toBe(true)
      expect(note.flipped).toBe(false)
    }
  })

  it('flips a note face-up in a judge-less round (one-way)', async () => {
    const api = await freshApi()
    // The seeded game is at round 0 with no judge, so flips are free.
    const res = await api('POST', `/games/${SEED}/notes/1/flip`)
    expect(res.ok).toBe(true)

    const data = await (await api('GET', `/games/${SEED}/submitted-notes`)).json()
    expect(data.notes.find((n) => n.id === 1).flipped).toBe(true)
  })

  it('assigns a rotating judge with 2+ players and locks flips until judging opens', async () => {
    const api = await freshApi()
    // The seeded game has two players (Ada, Grace).
    const first = await (await api('POST', `/games/${SEED}/rounds`)).json()
    expect(['Ada', 'Grace']).toContain(first.judgeId)
    expect(first.judgingOpen).toBe(false)
    expect(first.total).toBe(1) // the judge doesn't answer

    // With a judge and judging closed, flips 409 (mirrors the server).
    const flip = await api('POST', `/games/${SEED}/notes/1/flip`)
    expect(flip.status).toBe(409)

    // The judge rotates on the next round.
    const second = await (await api('POST', `/games/${SEED}/rounds`)).json()
    expect(second.judgeId).not.toBe(first.judgeId)
  })

  it('assigns no judge to a round with fewer than 2 players', async () => {
    const api = await freshApi()
    const { code } = await (await api('POST', '/games')).json()
    const drawn = await (await api('POST', `/games/${code}/rounds`)).json()
    expect(drawn.judgeId).toBe('')
  })

  it('400s flipping an unknown note', async () => {
    const api = await freshApi()
    const res = await api('POST', `/games/${SEED}/notes/99/flip`)
    expect(res.status).toBe(400)
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
