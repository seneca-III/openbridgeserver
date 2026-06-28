import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BindingFormMessage from '@/components/datapoints/binding-form/BindingFormMessage.vue'

function mk({ cfg = {}, selectedInstance = null } = {}) {
  return mount(BindingFormMessage, {
    props: {
      cfg: {
        operator: '==',
        compare_value: 'true',
        title: '',
        cooldown_seconds: 0,
        message: '###DPN###: ###DP###',
        providers: [],
        send_on_change: true,
        ...cfg,
      },
      selectedInstance: selectedInstance ?? {
        config: {
          providers: {
            pushover: { enabled: true, targets: { phone: {} } },
            telegram: { enabled: true, targets: { family: {} } },
            disabled: { enabled: false, targets: { hidden: {} } },
          },
        },
      },
    },
  })
}

describe('BindingFormMessage', () => {
  it('hides compare value when operator is any', async () => {
    const wrapper = mk()
    expect(wrapper.findAll('input').some(input => input.element.value === 'true')).toBe(true)

    await wrapper.find('select').setValue('any')

    expect(wrapper.findAll('input').some(input => input.element.value === 'true')).toBe(false)
  })

  it('adds and removes provider targets from enabled providers', async () => {
    const cfg = { providers: [] }
    const wrapper = mk({ cfg })

    await wrapper.findAll('button').find(button => button.text() === 'Ziel hinzufügen').trigger('click')

    expect(cfg.providers).toEqual([{ provider: 'pushover', target: 'phone' }])
    expect(wrapper.text()).not.toContain('hidden')

    await wrapper.findAll('button').find(button => button.text() === 'Löschen').trigger('click')
    expect(cfg.providers).toEqual([])
  })

  it('changes target when provider selection changes', async () => {
    const cfg = { providers: [{ provider: 'pushover', target: 'phone' }] }
    const wrapper = mk({ cfg })

    await wrapper.findAll('select')[1].setValue('telegram')

    expect(cfg.providers[0]).toEqual({ provider: 'telegram', target: 'family' })
  })

  it('disables add target when no configured provider targets exist', () => {
    const wrapper = mk({ selectedInstance: { config: { providers: {} } } })

    expect(wrapper.findAll('button').find(button => button.text() === 'Ziel hinzufügen').attributes('disabled')).toBeDefined()
  })
})
