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

  it('emits flip on click; face-up state is owned by the flipped prop', async () => {
    const wrapper = mount(NoteSlate, { props: { tokens: TILES } })

    // Clicking the face-down slate asks the parent (and so the server) to flip.
    await wrapper.trigger('click')
    expect(wrapper.emitted('flip')).toHaveLength(1)
    expect(wrapper.find('.slate--flipped').exists()).toBe(false) // not yet

    // The flip lands (note_flipped / a successful POST) via the prop.
    await wrapper.setProps({ flipped: true })
    expect(wrapper.find('.slate--flipped').exists()).toBe(true)
    expect(wrapper.attributes('aria-pressed')).toBe('true')

    // Flips are one-way: clicking a face-up slate emits nothing more.
    await wrapper.trigger('click')
    expect(wrapper.emitted('flip')).toHaveLength(1)
  })

  it('does not emit flip while unflippable (judging closed)', async () => {
    const wrapper = mount(NoteSlate, {
      props: { tokens: TILES, flippable: false },
    })
    expect(wrapper.find('.slate__hint').text()).toBe('Waiting for the judge…')
    await wrapper.trigger('click')
    expect(wrapper.emitted('flip')).toBeUndefined()
  })

  it('badges the picked favorite', () => {
    const wrapper = mount(NoteSlate, {
      props: { tokens: TILES, flipped: true, winner: true },
    })
    expect(wrapper.find('.slate--winner').exists()).toBe(true)
    expect(wrapper.find('.slate__winner-badge').text()).toBe('Favorite!')
  })
})
