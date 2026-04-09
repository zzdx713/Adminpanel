<script setup lang="ts">
import { computed, ref } from 'vue'
import { NCard, NDataTable, NEmpty, NModal, NPagination, NSpace, NText, NButton, NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { SessionsUsageSession } from '@/api/types'

interface DrilldownSegment {
  key: string
  label: string
  value: number
  color: string
  records: SessionsUsageSession[]
}

interface Props {
  show: boolean
  title: string
  subtitle?: string
  segments: DrilldownSegment[]
  usageMode: 'tokens' | 'cost'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
}>()

const { t } = useI18n()
const activeSegment = ref<string | null>(props.segments[0]?.key ?? null)
const page = ref(1)
const pageSize = 10

const activeRecords = computed(() => {
  const seg = props.segments.find((s) => s.key === activeSegment.value)
  return seg?.records ?? []
})

const paginatedRecords = computed(() => {
  const start = (page.value - 1) * pageSize
  return activeRecords.value.slice(start, start + pageSize)
})

const totalValue = computed(() =>
  activeRecords.value.reduce(
    (sum, r) => sum + (props.usageMode === 'tokens' ? r.usage?.totalTokens ?? 0 : r.usage?.totalCost ?? 0),
    0,
  ),
)

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatValue(v: number) {
  return props.usageMode === 'tokens' ? formatCompactNumber(v) : formatUsd(v)
}

function formatDate(ts?: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

function getMessageCount(session: SessionsUsageSession): number {
  return session.usage?.messageCounts?.total ?? 0
}

const columns = computed(() => [
  {
    title: t('pages.dashboard.drilldown.cols.label'),
    key: 'label',
    ellipsis: { tooltip: true } as const,
  },
  {
    title: t('pages.dashboard.drilldown.cols.input'),
    key: 'input',
    align: 'right' as const,
    render: (row: SessionsUsageSession) => formatValue(row.usage?.input ?? 0),
  },
  {
    title: t('pages.dashboard.drilldown.cols.output'),
    key: 'output',
    align: 'right' as const,
    render: (row: SessionsUsageSession) => formatValue(row.usage?.output ?? 0),
  },
  {
    title: t('pages.dashboard.drilldown.cols.cacheRead'),
    key: 'cacheRead',
    align: 'right' as const,
    render: (row: SessionsUsageSession) => formatValue(row.usage?.cacheRead ?? 0),
  },
  {
    title: t('pages.dashboard.drilldown.cols.cacheWrite'),
    key: 'cacheWrite',
    align: 'right' as const,
    render: (row: SessionsUsageSession) => formatValue(row.usage?.cacheWrite ?? 0),
  },
  {
    title: t('pages.dashboard.drilldown.cols.total'),
    key: 'total',
    align: 'right' as const,
    render: (row: SessionsUsageSession) =>
      formatValue(props.usageMode === 'tokens' ? (row.usage?.totalTokens ?? 0) : (row.usage?.totalCost ?? 0)),
  },
  {
    title: t('pages.dashboard.drilldown.cols.messages'),
    key: 'messageCount',
    align: 'right' as const,
    render: (row: SessionsUsageSession) => getMessageCount(row),
  },
  {
    title: t('pages.dashboard.drilldown.cols.channel'),
    key: 'channel',
    ellipsis: { tooltip: true } as const,
    render: (row: SessionsUsageSession) => row.channel ?? '-',
  },
])

function close() {
  emit('update:show', false)
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="title"
    :style="{ width: '900px', maxHeight: '80vh' }"
    :bordered="false"
    class="drilldown-modal"
    @update:show="(v) => emit('update:show', v)"
  >
    <div v-if="subtitle" class="drilldown-subtitle">
      <NText depth="3">{{ subtitle }}</NText>
    </div>

    <!-- Segment tabs -->
    <div class="drilldown-segments" v-if="segments.length > 1">
      <NTag
        v-for="seg in segments"
        :key="seg.key"
        :type="activeSegment === seg.key ? 'primary' : 'default'"
        round
        style="cursor: pointer;"
        @click="activeSegment = seg.key; page = 1"
      >
        <span :style="{ color: seg.color, fontWeight: activeSegment === seg.key ? 700 : 400 }">
          {{ seg.label }}
        </span>
        <span style="margin-left: 6px; opacity: 0.7;">
          {{ formatValue(seg.value) }}
        </span>
      </NTag>
    </div>

    <!-- Total stat -->
    <div class="drilldown-total">
      <NSpace align="center">
        <NText depth="3">{{ t('pages.dashboard.drilldown.total') }}:</NText>
        <NText strong style="font-size: 18px;">{{ formatValue(totalValue) }}</NText>
        <NText depth="3">{{ t('pages.dashboard.drilldown.records', { count: activeRecords.length }) }}</NText>
      </NSpace>
    </div>

    <!-- Table -->
    <div class="drilldown-table">
      <NDataTable
        v-if="paginatedRecords.length"
        :columns="columns"
        :data="paginatedRecords"
        :bordered="false"
        size="small"
        :row-key="(row: SessionsUsageSession) => row.key"
      />
      <NEmpty v-else :description="t('common.empty')" />
    </div>

    <!-- Pagination -->
    <div class="drilldown-pagination" v-if="activeRecords.length > pageSize">
      <NPagination
        v-model:page="page"
        :page-size="pageSize"
        :item-count="activeRecords.length"
        simple
      />
    </div>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="close">{{ t('common.close') }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.drilldown-subtitle {
  margin-bottom: 12px;
}
.drilldown-segments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.drilldown-total {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--n-color-hover, rgba(0,0,0,0.03));
  border-radius: 6px;
}
.drilldown-table {
  overflow-x: auto;
}
.drilldown-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
