<script setup lang="ts">
import { computed } from 'vue'
import { useDatapointsStore } from '@/stores/datapoints'
import type { DataPointValue } from '@/types'

interface BarConfig {
  label: string
  dp_id: string
  min: number
  max: number
  decimals: number
  prefix: string
  postfix: string
}

const props = defineProps<{
  config: Record<string, unknown>
  datapointId: string | null
  value: DataPointValue | null
  editorMode: boolean
  w?: number
  h?: number
}>()

const dpStore = useDatapointsStore()

const widgetLabel = computed(() => (props.config.label as string | undefined) ?? '')
const bars        = computed<BarConfig[]>(() => (props.config.bars as BarConfig[] | undefined) ?? [])
const colors      = computed<string[]>(() => (props.config.colors as string[] | undefined) ?? ['#22c55e', '#f59e0b', '#ef4444'])
const showValue   = computed(() => (props.config.show_value as boolean | undefined) ?? true)

const gradientCss = computed(() => {
  const c = colors.value
  if (c.length === 0) return '#374151'
  if (c.length === 1) return c[0]
  const stops = c.map((color, i) => `${color} ${(i / (c.length - 1)) * 100}%`).join(', ')
  return `linear-gradient(to right, ${stops})`
})

function getPercent(bar: BarConfig, idx: number): number {
  if (props.editorMode) {
    const n = bars.value.length || 1
    return Math.round(((idx + 1) / (n + 1)) * 100)
  }
  const dp = dpStore.getValue(bar.dp_id)
  if (!dp) return 0
  const v = typeof dp.v === 'number' ? dp.v : parseFloat(String(dp.v))
  if (isNaN(v)) return 0
  const min = bar.min ?? 0
  const max = bar.max ?? 100
  if (max <= min) return 0
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
}

function getDisplayValue(bar: BarConfig): string {
  if (props.editorMode) return '—'
  const dp = dpStore.getValue(bar.dp_id)
  if (!dp) return '…'
  const v = typeof dp.v === 'number' ? dp.v : parseFloat(String(dp.v))
  if (isNaN(v)) return String(dp.v ?? '—')
  const formatted = v.toFixed(bar.decimals ?? 1)
  const unit = bar.postfix || dp.u || ''
  return [bar.prefix, formatted, unit].filter(Boolean).join(' ')
}

// Background-size trick: expand the gradient to span the full track width
// so the color at position X in the fill matches position X in the full track.
function fillStyle(pct: number): Record<string, string> {
  return {
    width: `${pct}%`,
    background: gradientCss.value,
    backgroundSize: pct > 0 ? `${10000 / pct}% 100%` : '100% 100%',
    backgroundPosition: '0 0',
  }
}
</script>

<template>
  <div class="flex flex-col h-full p-2 gap-y-1 select-none overflow-hidden">
    <span
      v-if="widgetLabel"
      class="text-xs text-gray-500 dark:text-gray-400 truncate w-full text-center shrink-0"
    >{{ widgetLabel }}</span>

    <div class="flex-1 flex flex-col justify-around min-h-0">
      <template v-if="bars.length > 0">
        <div
          v-for="(bar, i) in bars"
          :key="i"
          class="flex items-center gap-2"
        >
          <!-- Label: nur rendern wenn Text vorhanden, Breite passt sich der Textlänge an -->
          <span
            v-if="bar.label"
            class="text-xs text-gray-400 dark:text-gray-400 truncate shrink-0 text-right"
            style="max-width: 35%"
          >{{ bar.label }}</span>

          <!-- Bar track -->
          <div
            class="relative flex-1 overflow-hidden rounded-sm bg-gray-700 dark:bg-gray-700 min-w-0"
            style="height: 0.875rem"
          >
            <div
              class="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300"
              :style="fillStyle(getPercent(bar, i))"
              data-testid="bar-fill"
            />
          </div>

          <!-- Value -->
          <span
            v-if="showValue"
            class="text-xs tabular-nums text-gray-200 dark:text-gray-200 shrink-0 text-right"
            style="width: 20%; min-width: 2.5rem"
            data-testid="widget-value"
          >{{ getDisplayValue(bar) }}</span>
        </div>
      </template>

      <div
        v-else
        class="flex items-center justify-center h-full text-gray-600 dark:text-gray-600 text-xs"
      >
        Keine Balken konfiguriert
      </div>
    </div>
  </div>
</template>
