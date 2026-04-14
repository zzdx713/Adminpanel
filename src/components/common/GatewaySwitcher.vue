<script setup lang="ts">
import { computed } from 'vue'
import { NSelect, NSpace, NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useHermesConnectionStore } from '@/stores/hermes/connection'

const { t } = useI18n()
const connStore = useHermesConnectionStore()

const options = computed(() => [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'Hermes', value: 'hermes' },
])

function handleChange(val: string) {
  connStore.switchGateway(val as 'openclaw' | 'hermes')
}
</script>

<template>
  <NSpace align="center" :size="8">
    <NSelect
      :value="connStore.currentGateway"
      :options="options"
      size="small"
      style="width: 140px"
      @update:value="handleChange"
    />
    <NTag
      v-if="connStore.currentGateway === 'hermes'"
      :type="connStore.hermesConnected ? 'success' : 'error'"
      size="small"
      round
    >
      {{ connStore.hermesConnected ? t('common.online') : t('common.offline') }}
    </NTag>
  </NSpace>
</template>
