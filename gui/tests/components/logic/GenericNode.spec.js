import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GenericNode from '@/components/logic/nodes/GenericNode.vue'

vi.mock('@vue-flow/core', () => ({
  Handle: {
    props: ['id', 'type', 'position'],
    template: '<span class="handle" :data-id="id" :data-type="type" :data-position="position" />',
  },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useVueFlow: () => ({
    updateNodeData: vi.fn(),
    removeNodes: vi.fn(),
  }),
}))

describe('GenericNode memory rendering', () => {
  it('renders memory input, reset, and output ports', () => {
    const wrapper = mount(GenericNode, {
      props: {
        id: 'mem',
        type: 'memory',
        data: { initial_value: 'false', data_type: 'bool' },
      },
    })

    expect(wrapper.text()).toContain('Speicher')
    expect(wrapper.text()).toContain('Eingang')
    expect(wrapper.text()).toContain('Reset')
    expect(wrapper.text()).toContain('Ausgang')
    expect(wrapper.find('[data-id="reset"][data-type="target"]').exists()).toBe(true)
    expect(wrapper.find('[data-id="out"][data-type="source"]').exists()).toBe(true)
  })
})
