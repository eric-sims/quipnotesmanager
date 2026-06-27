import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// Mock the api module so App is tested against the contract, not the network.
const apiRequest = vi.fn()
let isOffline = false
vi.mock('@/api', () => ({
  apiRequest: (...args) => apiRequest(...args),
  get IS_OFFLINE() {
    return isOffline
  },
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
  it('fetches submitted notes for the current game and renders one card each', async () => {
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(okJson({ notes: ['note a', 'note b'] }))
    await wrapper.find('.actions button').trigger('click') // Get Notes
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith(
      'GET',
      '/games/4821/submitted-notes',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(wrapper.findAllComponents({ name: 'ClickCard' })).toHaveLength(2)
    expect(wrapper.text()).toContain('Number of Notes: 2')
  })

  it('clears the notes on Clear Notes', async () => {
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(okJson({ notes: ['note a'] }))
    await wrapper.findAll('.actions button')[0].trigger('click') // Get Notes
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'ClickCard' })).toHaveLength(1)

    apiRequest.mockResolvedValueOnce(okJson({ notes: [] }))
    await wrapper.findAll('.actions button')[1].trigger('click') // Clear Notes
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith(
      'DELETE',
      '/games/4821/submitted-notes',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(wrapper.findAllComponents({ name: 'ClickCard' })).toHaveLength(0)
  })

  it('ends the game and returns to the lobby', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(okJson({}, 200))
    await wrapper.findAll('.actions button')[2].trigger('click') // End Game
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith('DELETE', '/games/4821', null, {
      'Content-Type': 'application/json',
    })
    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    vi.unstubAllGlobals()
  })

  it('returns to the lobby when Get Notes finds the game gone (404)', async () => {
    vi.stubGlobal('alert', vi.fn())
    const wrapper = await mountHosting('4821')

    apiRequest.mockResolvedValueOnce(okJson({ error: 'game 4821 not found' }, 404))
    await wrapper.findAll('.actions button')[0].trigger('click') // Get Notes
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
    await wrapper.findAll('.actions button')[2].trigger('click') // End Game
    await flushPromises()

    expect(wrapper.find('.code-value').exists()).toBe(false)
    expect(wrapper.text()).toContain('Start Game')
    expect(window.localStorage.getItem('quipnotes.manager.code')).toBeNull()
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
