import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// Mock the api module so App is tested against the contract, not the network.
const apiRequest = vi.fn()
const JSON_HEADERS = { 'Content-Type': 'application/json' }
let isOffline = false
vi.mock('@/api', () => ({
  apiRequest: (...args) => apiRequest(...args),
  startRound: (code) =>
    apiRequest('POST', `/games/${code}/rounds`, null, JSON_HEADERS),
  getRound: (code) =>
    apiRequest('GET', `/games/${code}/round`, null, JSON_HEADERS),
  getPlayers: (code) =>
    apiRequest('GET', `/games/${code}/players`, null, JSON_HEADERS),
  flipNote: (code, noteId) =>
    apiRequest('POST', `/games/${code}/notes/${noteId}/flip`, null, JSON_HEADERS),
  get IS_OFFLINE() {
    return isOffline
  },
}))

// Stub the socket wrapper so App never opens a real WebSocket in tests, but
// capture the onEvent callback (to simulate pushed events) and the options
// (to simulate the socket reporting the server unreachable).
let socketOnEvent = null
let socketOpts = null
vi.mock('@/socket', () => ({
  createGameSocket: vi.fn((code, onEvent, opts = {}) => {
    socketOnEvent = onEvent
    socketOpts = opts
    return { close: vi.fn() }
  }),
}))

// Stub the clipboard helper so Copy invite doesn't touch the real clipboard.
vi.mock('@/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(true),
  shareMessage: (code) => `Join my QuipNotes game! Code: ${code}`,
}))

import App from './App.vue'

function okJson(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data }
}

beforeEach(() => {
  apiRequest.mockReset()
  isOffline = false
  socketOnEvent = null
  socketOpts = null
  window.localStorage.clear()
})

// Mount App and start a game so we land in the hosting view with a known code.
async function mountHosting(code = '4821') {
  apiRequest.mockResolvedValueOnce(okJson({ code }, 201))
  const wrapper = mount(App)
  await wrapper.find('button').trigger('click') // Start Game
  await flushPromises()
  return wrapper
}

describe('App lobby', () => {
  it('shows Start Game and no game code initially', async () => {
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.text()).toContain('Start Game')
    expect(wrapper.find('.code-value').exists()).toBe(false)
  })

  it('starts a game and shows the returned code', async () => {
    const wrapper = await mountHosting('4821')
    expect(apiRequest).toHaveBeenCalledWith('POST', '/games', null, {
      'Content-Type': 'application/json',
    })
    expect(wrapper.find('.code-value').text()).toBe('4821')
  })
})

describe('App hosting', () => {
  it('fetches submitted notes automatically when a submission event arrives', async () => {
    const wrapper = await mountHosting('4821')
    expect(typeof socketOnEvent).toBe('function')

    // A round must be active for the "Answered" count / note board to render.
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'A terrible name for a boat' })
    // The roster (and thus the "Answered" total) comes from a players event.
    socketOnEvent({ type: 'players', players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })

    apiRequest.mockResolvedValueOnce(
      okJson({
        notes: [
          { id: 1, tokens: ['0|note', '1|a'], flipped: false },
          { id: 2, tokens: ['0|note', '1|b'], flipped: false },
        ],
      }),
    )
    socketOnEvent({ type: 'submission', count: 2, total: 3 })
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith(
      'GET',
      '/games/4821/submitted-notes',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(wrapper.findAllComponents({ name: 'NoteSlate' })).toHaveLength(2)
    expect(wrapper.text()).toContain('Number of Notes: 2')
    expect(wrapper.text()).toContain('Answered: 2 / 3')
  })

  it('renders the board in the server order with server-owned flip state', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p' })

    // The server sends the board pre-shuffled; the app must not reorder it.
    apiRequest.mockResolvedValueOnce(
      okJson({
        notes: [
          { id: 2, tokens: ['1|banana'], flipped: false },
          { id: 3, tokens: ['2|cherry'], flipped: true },
          { id: 1, tokens: ['0|apple'], flipped: false },
        ],
      }),
    )
    socketOnEvent({ type: 'submission', count: 3, total: 3 })
    await flushPromises()

    const slates = wrapper.findAllComponents({ name: 'NoteSlate' })
    expect(slates.map((c) => c.props('tokens')[0])).toEqual([
      '1|banana',
      '2|cherry',
      '0|apple',
    ])
    expect(slates.map((c) => c.props('flipped'))).toEqual([false, true, false])
  })

  it('re-fetches the round, note board, and roster when restoring a running game', async () => {
    window.localStorage.setItem('quipnotes.manager.code', '4821')
    apiRequest
      .mockResolvedValueOnce(okJson({ round: 1, prompt: 'A boat' })) // syncRound
      .mockResolvedValueOnce(
        okJson({ notes: [{ id: 1, tokens: ['0|note', '1|a'], flipped: false }] }),
      ) // getNotes
      .mockResolvedValueOnce(okJson({ players: [{ id: 'Ada', score: 0 }] })) // fetchPlayers
    const wrapper = mount(App)
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith(
      'GET',
      '/games/4821/submitted-notes',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(apiRequest).toHaveBeenCalledWith(
      'GET',
      '/games/4821/players',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(wrapper.findAllComponents({ name: 'NoteSlate' })).toHaveLength(1)
    expect(wrapper.findComponent({ name: 'PlayerRoster' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Ada')
  })

  it('shows the live roster before any note, and shrinks the code once a round starts', async () => {
    const wrapper = await mountHosting('4821')

    // Waiting state: giant code hero (no corner modifier), no roster yet.
    expect(wrapper.find('.code-card--corner').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'PlayerRoster' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Waiting for players')

    // A player joins — the roster appears while the code is still the hero.
    socketOnEvent({ type: 'players', players: [{ id: 'Ada' }, { id: 'Grace' }] })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PlayerRoster' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('Ada')
    expect(wrapper.text()).toContain('Grace')
    expect(wrapper.find('.code-card--corner').exists()).toBe(false)

    // Drawing the first prompt shrinks the code to the corner.
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'A boat' })
    await flushPromises()
    expect(wrapper.find('.code-card--corner').exists()).toBe(true)
    // Roster stays visible during the round.
    expect(wrapper.findComponent({ name: 'PlayerRoster' }).exists()).toBe(true)
  })

  it('shows the judge and the scored roster during a round', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p', judgeId: 'Ada' })
    socketOnEvent({
      type: 'players',
      players: [
        { id: 'Ada', score: 2 },
        { id: 'Grace', score: 1 },
      ],
    })
    await flushPromises()

    expect(wrapper.find('.judge-line').text()).toContain('Ada')
    const chips = wrapper.findAll('.player-chip')
    expect(chips[0].text()).toContain('2')
    expect(chips[1].text()).toContain('1')
    expect(chips[0].find('.player-chip__judge').exists()).toBe(true)
    expect(chips[1].find('.player-chip__judge').exists()).toBe(false)
    // Two players, one judging → one expected answer.
    expect(wrapper.text()).toContain('Answered: 0 / 1')
  })

  it('mirrors a note_flipped event onto the matching slate', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p', judgeId: 'Ada' })
    apiRequest.mockResolvedValueOnce(
      okJson({
        notes: [
          { id: 1, tokens: ['0|apple'], flipped: false },
          { id: 2, tokens: ['1|banana'], flipped: false },
        ],
      }),
    )
    socketOnEvent({ type: 'submission', count: 2, total: 2 })
    await flushPromises()

    socketOnEvent({ type: 'note_flipped', round: 1, noteId: 2 })
    await flushPromises()

    const slates = wrapper.findAllComponents({ name: 'NoteSlate' })
    expect(slates.map((c) => c.props('flipped'))).toEqual([false, true])
  })

  it('locks host flips while judging is closed, and flips via the server once open', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p', judgeId: 'Ada' })
    apiRequest.mockResolvedValueOnce(
      okJson({ notes: [{ id: 1, tokens: ['0|apple'], flipped: false }] }),
    )
    socketOnEvent({ type: 'submission', count: 1, total: 2 })
    await flushPromises()

    // Judging not open yet: the slate is disabled and no flip request goes out.
    const before = apiRequest.mock.calls.length
    await wrapper.findComponent({ name: 'NoteSlate' }).find('button').trigger('click')
    expect(apiRequest.mock.calls.length).toBe(before)

    // judging_ready re-fetches the board and unlocks flips.
    apiRequest.mockResolvedValueOnce(
      okJson({ notes: [{ id: 1, tokens: ['0|apple'], flipped: false }] }),
    )
    socketOnEvent({ type: 'judging_ready', round: 1 })
    await flushPromises()

    apiRequest.mockResolvedValueOnce(okJson({}, 200))
    await wrapper.findComponent({ name: 'NoteSlate' }).find('button').trigger('click')
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith(
      'POST',
      '/games/4821/notes/1/flip',
      null,
      JSON_HEADERS,
    )
    expect(
      wrapper.findComponent({ name: 'NoteSlate' }).props('flipped'),
    ).toBe(true)
  })

  it('highlights the favorite and announces the winner on favorite_picked', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p', judgeId: 'Ada' })
    apiRequest.mockResolvedValueOnce(
      okJson({
        notes: [
          { id: 1, tokens: ['0|apple'], flipped: true },
          { id: 2, tokens: ['1|banana'], flipped: true },
        ],
      }),
    )
    socketOnEvent({ type: 'submission', count: 2, total: 2 })
    await flushPromises()

    socketOnEvent({ type: 'favorite_picked', round: 1, noteId: 2, winnerId: 'Grace' })
    await flushPromises()

    expect(wrapper.find('.winner-banner').text()).toContain('Grace')
    const slates = wrapper.findAllComponents({ name: 'NoteSlate' })
    expect(slates.map((c) => c.props('winner'))).toEqual([false, true])
  })

  it('a new round clears the board, judge, and winner', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p', judgeId: 'Ada' })
    apiRequest.mockResolvedValueOnce(
      okJson({ notes: [{ id: 1, tokens: ['0|apple'], flipped: true }] }),
    )
    socketOnEvent({ type: 'submission', count: 1, total: 1 })
    await flushPromises()
    socketOnEvent({ type: 'favorite_picked', round: 1, noteId: 1, winnerId: 'Grace' })
    await flushPromises()

    socketOnEvent({ type: 'round_started', round: 2, prompt: 'q', judgeId: 'Grace' })
    await flushPromises()

    expect(wrapper.findAllComponents({ name: 'NoteSlate' })).toHaveLength(0)
    expect(wrapper.find('.winner-banner').exists()).toBe(false)
    expect(wrapper.find('.judge-line').text()).toContain('Grace')
  })

  it('ends the game and returns to the lobby', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(okJson({}, 200))
    await wrapper.find('.actions button').trigger('click') // End Game
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith('DELETE', '/games/4821', null, {
      'Content-Type': 'application/json',
    })
    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    vi.unstubAllGlobals()
  })

  it('returns to the lobby when the restore note fetch finds the game gone (404)', async () => {
    vi.stubGlobal('alert', vi.fn())
    window.localStorage.setItem('quipnotes.manager.code', '4821')
    apiRequest
      .mockResolvedValueOnce(okJson({ round: 0, prompt: '' })) // syncRound
      .mockResolvedValueOnce(okJson({ error: 'game 4821 not found' }, 404)) // getNotes
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    expect(window.localStorage.getItem('quipnotes.manager.code')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns to the lobby when the socket is unreachable and the game is gone (404)', async () => {
    vi.stubGlobal('alert', vi.fn())
    const wrapper = await mountHosting('4821')
    expect(typeof socketOpts.onUnreachable).toBe('function')

    // The socket reports repeated connection failures; the probe finds a 404.
    apiRequest.mockResolvedValueOnce(okJson({ error: 'game 4821 not found' }, 404))
    socketOpts.onUnreachable()
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith('GET', '/games/4821/round', null, {
      'Content-Type': 'application/json',
    })
    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    expect(window.localStorage.getItem('quipnotes.manager.code')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('keeps hosting when the socket is unreachable but the probe cannot reach the server either', async () => {
    const wrapper = await mountHosting('4821')

    apiRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    socketOpts.onUnreachable()
    await flushPromises()

    // Server just down: stay on the game and let the socket keep retrying.
    expect(wrapper.find('.code-value').text()).toBe('4821')
  })

  it('ends locally and returns to the lobby when the server is unreachable', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    vi.stubGlobal('alert', vi.fn())
    const wrapper = await mountHosting('4821')

    apiRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await wrapper.find('.actions button').trigger('click') // End Game
    await flushPromises()

    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    expect(window.localStorage.getItem('quipnotes.manager.code')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('App rounds', () => {
  it('shows the draw-prompt prompt before any round', async () => {
    const wrapper = await mountHosting('4821')
    expect(wrapper.findComponent({ name: 'PromptCard' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('Draw the first prompt')
  })

  it('draws a prompt and displays it in a PromptCard', async () => {
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(
      okJson({ round: 1, prompt: 'A terrible name for a boat' }, 201),
    )
    await wrapper.find('.game-btn--xl').trigger('click') // Draw prompt
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith(
      'POST',
      '/games/4821/rounds',
      null,
      JSON_HEADERS,
    )
    const card = wrapper.findComponent({ name: 'PromptCard' })
    expect(card.exists()).toBe(true)
    expect(wrapper.text()).toContain('A terrible name for a boat')
    expect(wrapper.text()).toContain('Round 1')
  })

  it('returns to the lobby when drawing a prompt finds the game gone (404)', async () => {
    vi.stubGlobal('alert', vi.fn())
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(okJson({ error: 'not found' }, 404))
    await wrapper.find('.game-btn--xl').trigger('click') // Draw prompt
    await flushPromises()

    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    vi.unstubAllGlobals()
  })
})

describe('App offline badge', () => {
  it('shows the offline badge only when running offline', async () => {
    isOffline = true
    const wrapper = mount(App)
    expect(wrapper.find('.offline-badge').exists()).toBe(true)
  })

  it('hides the offline badge when online', async () => {
    isOffline = false
    const wrapper = mount(App)
    expect(wrapper.find('.offline-badge').exists()).toBe(false)
  })
})
