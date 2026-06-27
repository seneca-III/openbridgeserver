<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

const props = defineProps<{
  modelValue: Record<string, unknown> | null | undefined
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: Record<string, unknown>): void
}>()

type AuthType = 'none' | 'basic' | 'apikey'

function normalizeAuthType(raw: unknown): AuthType {
  if (typeof raw !== 'string') return 'none'
  const v = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (v === 'basic' || v.startsWith('basicauth')) return 'basic'
  if (v === 'apikey' || v.startsWith('apikey')) return 'apikey'
  return 'none'
}

function safeRecord(): Record<string, unknown> {
  const mv = props.modelValue
  return mv && typeof mv === 'object' && !Array.isArray(mv) ? mv : {}
}

function makeCfg(raw: Record<string, unknown>) {
  return {
    label:           (raw.label           as string)  ?? '',
    url:             (raw.url             as string)  ?? '',
    streamType:      (raw.streamType      as string)  ?? 'mjpeg',
    authType:        normalizeAuthType(raw.authType),
    username:        (raw.username        as string)  ?? '',
    password:        (raw.password        as string)  ?? '',
    apiKeyParam:     (raw.apiKeyParam     as string)  ?? 'token',
    apiKeyValue:     (raw.apiKeyValue     as string)  ?? '',
    refreshInterval: (raw.refreshInterval as number)  ?? 5,
    aspectRatio:     (raw.aspectRatio     as string)  ?? '16/9',
    objectFit:       (raw.objectFit       as string)  ?? 'contain',
    useProxy:        (raw.useProxy        as boolean) ?? false,
  }
}

const cfg = reactive(makeCfg(safeRecord()))

watch(cfg, () => emit('update:modelValue', { ...cfg }), { deep: true })

watch(
  () => props.modelValue,
  (newVal) => {
    const raw = newVal && typeof newVal === 'object' && !Array.isArray(newVal) ? newVal : {}
    const next = makeCfg(raw as Record<string, unknown>)
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (cfg[key] !== next[key]) (cfg as Record<string, unknown>)[key] = next[key]
    }
  },
)

const showBasicAuth  = computed(() => cfg.authType === 'basic')
const showApiKeyAuth = computed(() => cfg.authType === 'apikey')
const showRefresh    = computed(() => cfg.streamType === 'snapshot')
</script>

<template>
  <div class="space-y-3">

    <!-- Label -->
    <div>
      <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.common.label') }}</label>
      <input
        v-model="cfg.label"
        type="text"
        :placeholder="$t('widgets.kamera.labelPlaceholder')"
        class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      />
    </div>

    <!-- Stream-Typ -->
    <div>
      <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.streamType') }}</label>
      <select
        v-model="cfg.streamType"
        class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="mjpeg">{{ $t('widgets.kamera.streamMjpeg') }}</option>
        <option value="snapshot">{{ $t('widgets.kamera.streamSnapshot') }}</option>
        <option value="hls">{{ $t('widgets.kamera.streamHls') }}</option>
      </select>
    </div>

    <!-- URL -->
    <div>
      <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.streamUrl') }}</label>
      <input
        v-model="cfg.url"
        type="text"
        placeholder="http://192.168.1.100/video.cgi"
        class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500"
      />
    </div>

    <!-- Snapshot Refresh-Intervall -->
    <div v-if="showRefresh">
      <label class="block text-xs text-gray-400 mb-1">
        {{ $t('widgets.kamera.refreshInterval') }}
      </label>
      <input
        v-model.number="cfg.refreshInterval"
        type="number"
        min="1"
        max="3600"
        class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      />
    </div>

    <!-- Authentifizierung -->
    <div>
      <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.auth') }}</label>
      <select
        v-model="cfg.authType"
        class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="none">{{ $t('widgets.kamera.authNone') }}</option>
        <option value="basic">{{ $t('widgets.kamera.authBasic') }}</option>
        <option value="apikey">{{ $t('widgets.kamera.authApiKey') }}</option>
      </select>
    </div>

    <!-- Basic Auth -->
    <template v-if="showBasicAuth">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.username') }}</label>
          <input
            v-model="cfg.username"
            type="text"
            autocomplete="off"
            class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.password') }}</label>
          <input
            v-model="cfg.password"
            type="password"
            autocomplete="new-password"
            class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <p class="text-xs text-yellow-600">
        {{ $t('widgets.kamera.credentialWarning') }}
      </p>
    </template>

    <!-- API Key -->
    <template v-if="showApiKeyAuth">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.apiKeyParam') }}</label>
          <input
            v-model="cfg.apiKeyParam"
            type="text"
            placeholder="token"
            class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.apiKey') }}</label>
          <input
            v-model="cfg.apiKeyValue"
            type="password"
            autocomplete="new-password"
            class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </template>

    <!-- Proxy -->
    <div class="flex items-center gap-2">
      <input
        id="cam-proxy"
        v-model="cfg.useProxy"
        type="checkbox"
        class="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
      />
      <label for="cam-proxy" class="text-xs text-gray-300 cursor-pointer">
        {{ $t('widgets.kamera.useProxy') }}
        <span class="text-gray-500 font-normal ml-1">{{ $t('widgets.kamera.proxyMixedContentHint') }}</span>
      </label>
    </div>

    <!-- Darstellung -->
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.aspectRatio') }}</label>
        <select
          v-model="cfg.aspectRatio"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="16/9">16:9</option>
          <option value="4/3">4:3</option>
          <option value="1/1">{{ $t('widgets.kamera.aspectSquare') }}</option>
          <option value="free">{{ $t('widgets.kamera.aspectFree') }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">{{ $t('widgets.kamera.objectFit') }}</label>
        <select
          v-model="cfg.objectFit"
          class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
        >
          <option value="contain">{{ $t('widgets.kamera.fitContain') }}</option>
          <option value="cover">{{ $t('widgets.kamera.fitCover') }}</option>
          <option value="fill">{{ $t('widgets.kamera.fitFill') }}</option>
        </select>
      </div>
    </div>

  </div>
</template>
