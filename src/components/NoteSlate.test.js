import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NoteSlate from './NoteSlate.vue'

// A note is the ordered token list the server returns: "<id>|<word>" tiles plus
// "\n" line breaks between clusters.
const TILES = ['0|the', '1|secret', '2|note']

describe('NoteSlate', () => {
  it('starts unflipped showing the reveal hint', () => {
    const wrapper = mount(NoteSlate, { props: { tokens: TILES } })
    expect(wrapper.find('.slate--flipped').exists()).toBe(false)
    expect(wrapper.find('.slate__hint').text()).toBe('Click to reveal')
    expect(wrapper.attributes('aria-pressed')).toBe('false')
  })

  it('renders each tile as its own magnet, parsing off the id prefix', () => {
    const wrapper = mount(NoteSlate, { props: { tokens: TILES } })
    const magnets = wrapper.findAll('.magnet')
    expect(magnets).toHaveLength(3)
    expect(magnets.map((m) => m.text())).toEqual(['the', 'secret', 'note'])
  })

  it('splits the note into one line per cluster on line breaks', () => {
    const wrapper = mount(NoteSlate, {
      props: { tokens: ['0|the', '1|wizard', '\n', '2|before', '3|midnight'] },
    })
    const lines = wrapper.findAll('.slate__line')
    expect(lines).toHaveLength(2)
    expect(lines[0].findAll('.magnet').map((m) => m.text())).toEqual(['the', 'wizard'])
    expect(lines[1].findAll('.magnet').map((m) => m.text())).toEqual(['before', 'midnight'])
  })

  it('flips to reveal on click and flips back on a second click', async () => {
    const wrapper = mount(NoteSlate, { props: { tokens: TILES } })

    await wrapper.trigger('click')
    expect(wrapper.find('.slate--flipped').exists()).toBe(true)
    expect(wrapper.attributes('aria-pressed')).toBe('true')

    await wrapper.trigger('click')
    expect(wrapper.find('.slate--flipped').exists()).toBe(false)
    expect(wrapper.attributes('aria-pressed')).toBe('false')
  })
})
