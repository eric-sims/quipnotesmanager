import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NoteSlate from './NoteSlate.vue'

describe('NoteSlate', () => {
  it('starts unflipped showing the reveal hint', () => {
    const wrapper = mount(NoteSlate, { props: { content: 'the secret note' } })
    expect(wrapper.find('.slate--flipped').exists()).toBe(false)
    expect(wrapper.find('.slate__hint').text()).toBe('Click to reveal')
    expect(wrapper.attributes('aria-pressed')).toBe('false')
  })

  it('renders each word of the note as its own magnet tile', () => {
    const wrapper = mount(NoteSlate, { props: { content: 'the secret note' } })
    const magnets = wrapper.findAll('.magnet')
    expect(magnets).toHaveLength(3)
    expect(magnets.map((m) => m.text())).toEqual(['the', 'secret', 'note'])
  })

  it('flips to reveal on click and flips back on a second click', async () => {
    const wrapper = mount(NoteSlate, { props: { content: 'the secret note' } })

    await wrapper.trigger('click')
    expect(wrapper.find('.slate--flipped').exists()).toBe(true)
    expect(wrapper.attributes('aria-pressed')).toBe('true')

    await wrapper.trigger('click')
    expect(wrapper.find('.slate--flipped').exists()).toBe(false)
    expect(wrapper.attributes('aria-pressed')).toBe('false')
  })
})
