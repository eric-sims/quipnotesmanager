import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClickCard from './ClickCard.vue'

describe('ClickCard', () => {
  it('hides the content behind a prompt until clicked', () => {
    const wrapper = mount(ClickCard, { props: { content: 'the secret note' } })
    expect(wrapper.text()).toBe('Click to reveal')
    expect(wrapper.text()).not.toContain('the secret note')
  })

  it('reveals the content on click and hides it again on a second click', async () => {
    const wrapper = mount(ClickCard, { props: { content: 'the secret note' } })

    await wrapper.trigger('click')
    expect(wrapper.text()).toBe('the secret note')

    await wrapper.trigger('click')
    expect(wrapper.text()).toBe('Click to reveal')
  })
})
