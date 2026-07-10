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
  get IS_OFFLINE() {
    return isOffline
  },
}))

// Stub the socket wrapper so App never opens a real WebSocket in tests, but
// capture the onEvent callback so tests can simulate pushed events.
let socketOnEvent = null
vi.mock('@/socket', () => ({
  createGameSocket: vi.fn((code, onEvent) => {
    socketOnEvent = onEvent
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
      okJson({ notes: [['0|note', '1|a'], ['0|note', '1|b']] }),
    )
    socketOnEvent({ type: 'submission', count: 2 })
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

  it('shuffles the note board by a stable per-round order', async () => {
    const wrapper = await mountHosting('4821')
    socketOnEvent({ type: 'round_started', round: 1, prompt: 'p' })
    socketOnEvent({ type: 'players', players: [{ id: 'a' }] })

    // Deterministic keys so the shuffle is assertable. Installed after mount so
    // startup work (e.g. QR rendering) doesn't consume the sequence.
    const randoms = [0.5, 0.1, 0.9, 0.3]
    const randSpy = vi
      .spyOn(Math, 'random')
      .mockImplementation(() => randoms.shift())

    apiRequest.mockResolvedValueOnce(
      okJson({ notes: [['0|apple'], ['1|banana'], ['2|cherry']] }),
    )
    socketOnEvent({ type: 'submission', count: 3 })
    await flushPromises()

    // Keys apple=0.5, banana=0.1, cherry=0.9 → not submission order.
    const order1 = wrapper
      .findAllComponents({ name: 'NoteSlate' })
      .map((c) => c.props('tokens')[0])
    expect(order1).toEqual(['1|banana', '0|apple', '2|cherry'])

    // A fourth note arrives mid-round: the existing three keep their relative
    // order (stable per round) and the newcomer (key 0.3) slots in by its key.
    apiRequest.mockResolvedValueOnce(
      okJson({
        notes: [['0|apple'], ['1|banana'], ['2|cherry'], ['3|date']],
      }),
    )
    socketOnEvent({ type: 'submission', count: 4 })
    await flushPromises()

    const order2 = wrapper
      .findAllComponents({ name: 'NoteSlate' })
      .map((c) => c.props('tokens')[0])
    expect(order2).toEqual(['1|banana', '3|date', '0|apple', '2|cherry'])

    randSpy.mockRestore()
  })

  it('re-fetches the round, note board, and roster when restoring a running game', async () => {
    window.localStorage.setItem('quipnotes.manager.code', '4821')
    apiRequest
      .mockResolvedValueOnce(okJson({ round: 1, prompt: 'A boat' })) // syncRound
      .mockResolvedValueOnce(okJson({ notes: [['0|note', '1|a']] })) // getNotes
      .mockResolvedValueOnce(okJson({ players: [{ id: 'Ada' }] })) // fetchPlayers
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
