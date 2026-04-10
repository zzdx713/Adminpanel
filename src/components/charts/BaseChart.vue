<template>
  <div class="chart-container" ref="chartRef">
    <VChart :option="chartOption" :autoresize="true" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import * as echarts from 'echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
])

interface ChartData {
  name: string
  value: number
}

interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'scatter'
  title: string
  data: ChartData[]
  xAxis?: string[]
  yAxis?: string[]
  tooltip?: boolean
  legend?: boolean
}

const props = defineProps<{
  config: ChartConfig
  theme?: 'light' | 'dark'
}>()

const chartRef = ref<HTMLElement>()

const chartOption = computed(() => {
  const baseOption: any = {
    title: {
      text: props.config.title,
      left: 'center',
    },
    tooltip: props.config.tooltip ? {
      trigger: props.config.type === 'pie' ? 'item' : 'axis',
      ...props.config.tooltip,
    } : {
      trigger: props.config.type === 'pie' ? 'item' : 'axis',
    },
    legend: props.config.legend ? {
      data: props.config.data.map(d => d.name),
      ...props.config.legend,
    } : {
      data: props.config.data.map(d => d.name),
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
  }

  if (props.config.type === 'pie') {
    baseOption.series = [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        data: props.config.data,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ]
  } else if (props.config.type === 'line' || props.config.type === 'bar') {
    baseOption.xAxis = {
      type: 'category',
      data: props.config.xAxis || props.config.data.map((_, i) => i.toString()),
    }
    baseOption.yAxis = {
      type: 'value',
    }
    baseOption.series = [
      {
        type: props.config.type,
        data: props.config.data.map(d => d.value),
        smooth: props.config.type === 'line',
      },
    ]
  } else if (props.config.type === 'scatter') {
    baseOption.xAxis = { type: 'value' }
    baseOption.yAxis = { type: 'value' }
    baseOption.series = [
      {
        type: 'scatter',
        data: props.config.data.map((d, i) => [i, d.value]),
      },
    ]
  }

  // 应用主题
  if (props.theme === 'dark') {
    baseOption.backgroundColor = '#1a1a1a'
    baseOption.textStyle = { color: '#fff' }
  }

  return baseOption
})

onMounted(() => {
  // 图表初始化完成后的回调
})

// 监听配置变化
watch(() => props.config, () => {
  // echarts 会自动响应 option 变化
}, { deep: true })
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 400px;
}
</style>
