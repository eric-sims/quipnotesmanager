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

import App from './App.vue'

function okJson(data) {
  return { ok: true, status: 200, json: async () => data }
}

beforeEach(() => {
  apiRequest.mockReset()
  isOffline = false
})

describe('App', () => {
  it('fetches submitted notes and renders one card each', async () => {
    apiRequest.mockResolvedValue(okJson({ notes: ['note a', 'note b'] }))
    const wrapper = mount(App)

    await wrapper.findAll('button')[0].trigger('click') // Get Notes
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith(
      'GET',
      '/game/submitted-notes',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(wrapper.findAllComponents({ name: 'ClickCard' })).toHaveLength(2)
    expect(wrapper.text()).toContain('Number of Notes: 2')
  })

  it('clears the notes on Clear Notes', async () => {
    apiRequest.mockResolvedValue(okJson({ notes: ['note a'] }))
    const wrapper = mount(App)

    await wrapper.findAll('button')[0].trigger('click') // Get Notes
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'ClickCard' })).toHaveLength(1)

    apiRequest.mockResolvedValue(okJson({ notes: [] }))
    await wrapper.findAll('button')[1].trigger('click') // Clear Notes
    await flushPromises()

    expect(apiRequest).toHaveBeenLastCalledWith(
      'DELETE',
      '/game/submitted-notes',
      null,
      { 'Content-Type': 'application/json' },
    )
    expect(wrapper.findAllComponents({ name: 'ClickCard' })).toHaveLength(0)
  })

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
