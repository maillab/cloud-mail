<template>
  <div v-if="analysisError" class="analysis-empty">
    <HqEmptyState
      icon="fluent:cloud-error-20-regular"
      title="Analytics unavailable"
      description="Mail activity data could not be loaded. Please try again later."
      action-label="Retry"
      @action="loadAnalysis"
    />
  </div>
  <div v-else-if="analysisLoading" class="analysis-loading">
    <loading/>
  </div>
  <div v-else class="analysis-page">
    <el-scrollbar style="height: 100%;">
      <div class="analysis">
        <header class="analysis-header">
          <div>
            <div class="analysis-eyebrow">XPASS HQ / ANALYTICS</div>
            <h1 class="analysis-title">Mail activity</h1>
            <p class="analysis-desc">Received, sent, and mailbox activity over time.</p>
          </div>
        </header>

        <div class="metrics">
          <div class="metric-card">
            <div class="metric-label">{{ $t('totalReceived') }}</div>
            <div class="metric-value">{{ Math.round(receiveTotal) }}</div>
            <div class="metric-sub">
              <span class="metric-normal">{{ $t('active') }}: {{ numberCount.normalReceiveTotal }}</span>
              <span class="metric-deleted">{{ $t('deleted') }}: {{ numberCount.delReceiveTotal }}</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">{{ $t('totalSent') }}</div>
            <div class="metric-value">{{ Math.round(sendTotal) }}</div>
            <div class="metric-sub">
              <span class="metric-normal">{{ $t('active') }}: {{ numberCount.normalSendTotal }}</span>
              <span class="metric-deleted">{{ $t('deleted') }}: {{ numberCount.delSendTotal }}</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">{{ $t('totalMailboxes') }}</div>
            <div class="metric-value">{{ Math.round(accountTotal) }}</div>
            <div class="metric-sub">
              <span class="metric-normal">{{ $t('active') }}: {{ numberCount.normalAccountTotal }}</span>
              <span class="metric-deleted">{{ $t('deleted') }}: {{ numberCount.delAccountTotal }}</span>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-label">{{ $t('totalUsers') }}</div>
            <div class="metric-value">{{ Math.round(userTotal) }}</div>
            <div class="metric-sub">
              <span class="metric-normal">{{ $t('active') }}: {{ numberCount.normalUserTotal }}</span>
              <span class="metric-deleted">{{ $t('deleted') }}: {{ numberCount.delUserTotal }}</span>
            </div>
          </div>
        </div>

        <div class="chart-row">
          <div class="chart-panel">
            <div class="chart-title">{{ $t('userGrowth') }}</div>
            <div class="chart-wrap">
              <div class="increase-line"></div>
            </div>
          </div>
          <div class="chart-panel">
            <div class="chart-title">{{ $t('emailGrowth') }}</div>
            <div class="chart-wrap">
              <div class="email-column"></div>
            </div>
          </div>
        </div>

        <div class="summary-note">
          <strong>{{ $t('sentToday') }}:</strong>
          <span class="summary-number">{{ daySendTotal }}</span>
          <span class="summary-text">{{ $t('total') }}</span>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {defineOptions, onActivated, onDeactivated, onMounted, reactive, ref, watch, computed} from "vue";
import echarts from "@/echarts/index.js";
import dayjs from "dayjs";
import {analysisEcharts} from "@/request/analysis.js";
import {useUiStore} from "@/store/ui.js";
import {debounce} from "lodash-es";
import loading from "@/components/loading/index.vue";
import HqEmptyState from "@/components/hq-empty-state/index.vue";
import {useRoute} from "vue-router";
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'analysis'
})

const {t} = useI18n();
const route = useRoute();
const uiStore = useUiStore()
const receiveTotal = ref(0)
const sendTotal = ref(0)
const accountTotal = ref(0)
const userTotal = ref(0)
const analysisLoading = ref(true)
const analysisError = ref(false)

const numberCount = reactive({
  normalReceiveTotal: 0,
  normalSendTotal: 0,
  normalAccountTotal: 0,
  normalUserTotal: 0,
  delReceiveTotal: 0,
  delSendTotal: 0,
  delAccountTotal: 0,
  delUserTotal: 0
})


const userLineData = reactive({
  xdata: [],
  sdata: []
})

const emailColumnData = {
  receiveData: [],
  sendData: [],
  daysData: []
}

const topic = computed(() => ({
  color: uiStore.dark ? 'var(--hq-text)' : 'var(--hq-text)',
  background: uiStore.dark ? 'var(--hq-surface)' : 'var(--hq-surface)',
  borderColor: uiStore.dark ? 'var(--hq-border)' : 'var(--hq-border)',
  scaleLineColor: uiStore.dark ? 'var(--hq-border)' : 'var(--hq-border)',
  crossColor: uiStore.dark ? 'var(--hq-muted)' : 'var(--hq-muted)',
  axisColor: uiStore.dark ? 'var(--hq-text-secondary)' : 'var(--hq-text-secondary)',
  splitLineColor: uiStore.dark ? 'var(--hq-border)' : 'var(--hq-border)',
  gaugeSplitLine: uiStore.dark ? 'var(--hq-text-secondary)' : 'var(--hq-text-secondary)',
  containerBackground: uiStore.dark ? 'var(--hq-hover)' : 'var(--hq-hover)'
}))
let daySendTotal = 0
let leaveWidth = 0
let increaseLine = null
let emailColumn = null
let first = true

async function loadAnalysis() {
  analysisLoading.value = true
  analysisError.value = false
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    const data = await analysisEcharts(timeZone)
    receiveTotal.value = data.numberCount.receiveTotal
    sendTotal.value = data.numberCount.sendTotal
    accountTotal.value = data.numberCount.accountTotal
    userTotal.value = data.numberCount.userTotal
    numberCount.normalReceiveTotal = data.numberCount.normalReceiveTotal
    numberCount.normalSendTotal = data.numberCount.normalSendTotal
    numberCount.normalAccountTotal = data.numberCount.normalAccountTotal
    numberCount.normalUserTotal = data.numberCount.normalUserTotal
    numberCount.delReceiveTotal = data.numberCount.delReceiveTotal
    numberCount.delSendTotal = data.numberCount.delSendTotal
    numberCount.delAccountTotal = data.numberCount.delAccountTotal
    numberCount.delUserTotal = data.numberCount.delUserTotal

    userLineData.xdata = data.userDayCount.map(item => dayjs(item.date).format("M.D"))
    userLineData.sdata = data.userDayCount.map(item => item.total)

    emailColumnData.daysData = data.emailDayCount.receiveDayCount.map(item => dayjs(item.date).format("M.D"))
    emailColumnData.receiveData = data.emailDayCount.receiveDayCount.map(item => item.total)
    emailColumnData.sendData = data.emailDayCount.sendDayCount.map(item => item.total)
    daySendTotal = data.daySendTotal
    initPicture()
  } catch (error) {
    console.error('Could not load analytics data:', error)
    analysisError.value = true
  } finally {
    analysisLoading.value = false
  }
}

onMounted(() => {
  loadAnalysis()
})

const widthChange = debounce(initPicture, 500, {
  leading: false,
  trailing: true
})


watch(() => uiStore.asideShow, () => {
  if (window.innerWidth > 1024) {
    widthChange()
  }
})

onActivated(() => {
  if (first) return
  if (window.innerWidth !== leaveWidth && leaveWidth !== 0) {
    widthChange()
  } else if (!increaseLine) {
    widthChange()
  }
})

onDeactivated(() => {
  leaveWidth = window.innerWidth
})

window.onresize = () => {
  setStyle()
  widthChange()
}

watch(() => uiStore.dark, () => {
  if (route.name !== 'analysis') return
  initPicture()
})

function initPicture() {
  if (route.name !== 'analysis') return
  setTimeout(() => {
    createIncreaseLine()
    createEmailColumnChart()
  })
}

function setStyle() {
  emailColumnData.barWidth = window.innerWidth > 767 ? '40%' : '60%'
}

const measureCtx = document.createElement('canvas').getContext('2d');
measureCtx.font = '12px sans-serif';

function truncateTextByWidth(text, maxWidth = 140) {

  let width = measureCtx.measureText(text).width;
  if (width <= maxWidth) return text;

  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += text[i];
    if (measureCtx.measureText(result + '…').width > maxWidth) {
      return result.slice(0, -1) + '…';
    }
  }
  return text;
}

function createIncreaseLine() {

  if (increaseLine) {
    increaseLine.dispose()
  }

  increaseLine = echarts.init(document.querySelector(".increase-line"))

  let option = {
    tooltip: {
      trigger: 'axis', // 设置触发方式为 'axis'，在坐标轴上显示信息
      axisPointer: {
        type: 'cross', // 指示器的类型为交叉型，适用于折线图等
        crossStyle: {
          color: topic.value.crossColor// 设置指示器线的颜色
        },
        lineStyle: {
          color: topic.value.crossColor         // ← 竖线颜色
        },
        axis: 'x',
      },
      formatter: function (params) {
        let result = ''
        params.forEach(item => {
          result = `${item.marker} ${t('growthTotalUsers')} ${item.value}`;
        });
        return result;
      },
      backgroundColor: topic.value.background,  // 设置背景颜色
      borderColor: topic.value.splitLineColor,      // 设置边框颜色
      borderWidth: 1,           // 设置边框宽度
      padding: 10,              // 设置内边距
      textStyle: {
        color: topic.value.color,          // 设置文字颜色
      }
    },
    grid: {
      top: '8%',
      right: '20',
      left: '35',
      bottom: '35'
    },
    xAxis: {
      type: 'category',
      data: userLineData.xdata,
      axisTick: {
        show: false,
        alignWithLabel: false,  // 刻度线与标签对齐,
        lineStyle: {
          color: topic.value.axisColor,
        }
      },
      axisPointer: {
        label: {
          show: false
        }
      },
      axisLine: {
        lineStyle: {
          color: topic.value.axisColor,
          width: 1,
          type: 'solid'
        }
      },
      axisLabel: {
        formatter: function (value, index) {
          if (index === 0) {
            return '      ' + value;
          }
          if (index === userLineData.xdata.length - 1) {
            return value + '   '
          }
          return value;
        },

      },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        margin: 5, // 增加y轴刻度数字与网格线之间的间距
      },
      boundaryGap: [0, 0.1],
      max: (params) => {
        if (params.max < 8) {
          return 10
        }
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.axisColor,
          width: 1,
        }
      },
      axisPointer: {
        label: {
          show: true,
          formatter: (e) => {
            return Math.round(e.value)
          }
        }
      },
      splitLine: {
        show: true, // 显示网格线
        lineStyle: {
          type: 'dashed', // 设置网格线为虚线
          color: topic.value.scaleLineColor   // 设置虚线的颜色
        }
      }
    },
    series: [
      {

        data: userLineData.sdata,
        type: 'line',
        smooth: 0.1,
        symbol: 'none',
        lineStyle: {
          color: 'var(--hq-accent)',
          width: 2.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: 'rgba(255, 85, 0, 0.3)'
            },
            {
              offset: 1,
              color: 'rgba(255, 85, 0, 0.03)'
            }
          ])
        },
        color: ['var(--hq-accent)'],
      }
    ]
  };
  increaseLine.setOption(option);

  let max = increaseLine.getModel().getComponent('yAxis', 0).axis.scale.getExtent()[1];

  let left = 35

  if (max > 99) left = 42
  if (max > 999) left = 51
  if (max > 9999) left = 58
  if (max > 99999) left = 66

  increaseLine.setOption({
    grid: {
      left: left
    }
  });
}

function createEmailColumnChart() {

  if (emailColumn) {
    emailColumn.dispose()
  }

  emailColumn = echarts.init(document.querySelector(".email-column"));

  const option = {
    tooltip: {
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background,
      formatter: function (params) {
        params.marker
        return `${params.marker} ${params.seriesName}: ${params.value}`
      }
    },
    legend: {
      data: [t('emailReceived'), t('emailSent')],
      top: '0',
      textStyle: {
        color: topic.value.color,  // 图例文字颜色
      }
    },
    grid: {
      left: '18',
      right: '18',
      bottom: '15',
      top: '50',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: emailColumnData.daysData,
      axisTick: {
        show: false,
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.axisColor,
          width: 1,
        }
      },
    },
    yAxis: {
      max: (params) => {
        if (params.max < 8) {
          return 10
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: topic.value.splitLineColor,  // ← 横线颜色
          type: 'solid',    // dashed=虚线，solid=实线
          width: 1
        }
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: topic.value.axisColor,
          width: 0,
        }
      },
      type: 'value',
      boundaryGap: [0, 0.1],
    },
    series: [
      {
        name: t('emailReceived'),
        type: 'bar',
        stack: 'total', // 堆叠组标识（必须相同）
        barWidth: '60%',
        barMaxWidth: 30,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)',
          }
        },
        data: emailColumnData.receiveData,
        itemStyle: {
          color: 'var(--hq-accent)',
        }
      },
      {
        name: t('emailSent'),
        type: 'bar',
        stack: 'total', // 堆叠组标识（必须相同）
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        },
        data: emailColumnData.sendData,
        itemStyle: {
          color: 'var(--hq-accent-hover)',
        }
      }
    ]
  };

  emailColumn.setOption(option);
}

</script>
<style>
.percentage-value {
  display: block;
  margin-top: 10px;
  font-size: 28px;
}

.percentage-label {
  display: block;
  margin-top: 10px;
  font-size: 12px;
}
</style>
<style scoped lang="scss">
.analysis-loading,
.analysis-scroll {
  height: 100%;
  background: var(--settings-page-background);
}

.analysis-loading {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analysis-empty {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.analysis {
  height: 100%;
  padding: 28px 24px 40px;
  gap: 24px;
  background: var(--hq-page);
  display: grid;
  grid-auto-rows: min-content;

  @media (max-width: 1024px) {
    padding: 20px 16px 32px;
    gap: 18px;
  }

  .analysis-header {
    margin-bottom: 6px;

    .analysis-eyebrow {
      color: var(--hq-muted);
      font-size: 11px;
      font-weight: 650;
      letter-spacing: .04em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .analysis-title {
      font-family: var(--hq-font-heading);
      font-size: clamp(20px, 2vw, 24px);
      font-weight: 650;
      letter-spacing: -.02em;
      color: var(--hq-text);
      margin: 0 0 4px;
      line-height: 1.25;
    }

    .analysis-desc {
      color: var(--hq-text-secondary);
      font-size: 13px;
      margin: 0;
    }
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 2px;

    @media (max-width: 1366px) {
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }

    @media (max-width: 767px) {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  .metric-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 16px;
    border-radius: var(--hq-radius-md);
    border: 1px solid var(--hq-border);
    background: var(--hq-surface);
  }

  .metric-label {
    color: var(--hq-text-secondary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: .02em;
    text-transform: uppercase;
  }

  .metric-value {
    color: var(--hq-text);
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    font-family: var(--hq-font-heading);
  }

  .metric-sub {
    display: flex;
    gap: 14px;
    font-size: 12px;

    .metric-normal {
      color: var(--hq-text-secondary);
      font-weight: 600;
    }

    .metric-deleted {
      color: var(--hq-muted);
    }
  }

  .chart-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 4px;

    @media (max-width: 1024px) {
      grid-template-columns: 1fr;
      gap: 14px;
    }
  }

  .chart-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px 16px;
    border-radius: var(--hq-radius-md);
    border: 1px solid var(--hq-border);
    background: var(--hq-surface);
    min-height: 300px;
  }

  .chart-title {
    color: var(--hq-text-secondary);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .02em;
    text-transform: uppercase;
    margin: 0;
  }

  .chart-wrap {
    flex: 1;
    min-height: 220px;
    position: relative;
    width: 100%;
  }

  .summary-note {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-radius: var(--hq-radius-md);
    border: 1px solid var(--hq-border);
    background: var(--hq-surface);
    color: var(--hq-text-secondary);
    font-size: 13px;

    .summary-number {
      color: var(--hq-text);
      font-size: 20px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .summary-text {
      color: var(--hq-muted);
      font-size: 12px;
    }
  }
}
</style>



















