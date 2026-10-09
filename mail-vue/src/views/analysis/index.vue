<template>
  <div v-if="analysisLoading" class="analysis-loading">
    <loading/>
  </div>
  <el-scrollbar v-else style="height: 100%;">
    <div class="analysis" :key="boxKey">
      <div class="number">
        <div class="number-item">
          <div class="top">
            <div class="left">
              <div>{{ $t('totalReceived') }}</div>
              <div>
                <el-statistic :formatter="value => Math.round(value)" :value="receiveData"/>
              </div>
            </div>
            <div class="right">
              <div class="count-icon">
                <Icon icon="hugeicons:mailbox-01" width="25" height="25"></Icon>
              </div>
            </div>
          </div>
          <div class="delete-ratio">
            <div>{{ $t('active') }} <span class="normal">{{ numberCount.normalReceiveTotal }}</span></div>
            <div>{{ $t('deleted') }} <span class="deleted">{{ numberCount.delReceiveTotal }}</span></div>
          </div>
        </div>
        <div class="number-item">
          <div class="top">
            <div class="left">
              <div>{{ $t('totalSent') }}</div>
              <div>
                <el-statistic :formatter="value => Math.round(value)" :value="sendData"/>
              </div>
            </div>
            <div class="right">
              <div class="count-icon">
                <Icon icon="cil:send" width="25" height="25"></Icon>
              </div>
            </div>
          </div>
          <div class="delete-ratio">
            <div>{{ $t('active') }} <span class="normal">{{ numberCount.normalSendTotal }}</span></div>
            <div>{{ $t('deleted') }} <span class="deleted">{{ numberCount.delSendTotal }}</span></div>
          </div>
        </div>
        <div class="number-item">
          <div class="top">
            <div class="left">
              <div>{{ $t('totalMailboxes') }}</div>
              <div>
                <el-statistic :formatter="value => Math.round(value)" :value="accountData"/>
              </div>
            </div>
            <div class="right">
              <div class="count-icon">
                <Icon icon="lets-icons:e-mail" width="23" height="23"></Icon>
              </div>
            </div>
          </div>
          <div class="delete-ratio">
            <div>{{ $t('active') }} <span class="normal">{{ numberCount.normalAccountTotal }}</span></div>
            <div>{{ $t('deleted') }} <span class="deleted">{{ numberCount.delAccountTotal }}</span></div>
          </div>
        </div>
        <div class="number-item">
          <div class="top">
            <div class="left">
              <div>{{ $t('totalUsers') }}</div>
              <div>
                <el-statistic :formatter="value => Math.round(value)" :value="userData"/>
              </div>
            </div>
            <div class="right">
              <div class="count-icon">
                <Icon icon="iconoir:user" width="25" height="25"></Icon>
              </div>
            </div>
          </div>
          <div class="delete-ratio">
            <div>{{ $t('active') }} <span class="normal">{{ numberCount.normalUserTotal }}</span></div>
            <div>{{ $t('deleted') }} <span class="deleted">{{ numberCount.delUserTotal }}</span></div>
          </div>
        </div>
      </div>
      <div class="picture">
        <div class="picture-item">
          <div class="title" style="display: flex;justify-content: space-between;">
            <span>{{ $t('emailSource') }}</span>
            <span class="source-button" v-if="false">
              <el-radio-group v-model="checkedSourceType">
                <el-radio-button :label="$t('sender')" value="sender"/>
                <el-radio-button :label="$t('emailAccount')" value="email"/>
              </el-radio-group>
            </span>
          </div>
          <div class="sender-pie">

          </div>
        </div>
        <div class="picture-item">
          <div class="title">{{ $t('userGrowth') }}</div>
          <div class="increase-line">

          </div>
        </div>
      </div>
      <div class="picture-cs">
        <div class="picture-cs-item">
          <div class="title">{{ $t('emailGrowth') }}</div>
          <div class="email-column"></div>
        </div>
        <div class="picture-cs-item">
          <div class="title">{{ $t('sentToday') }}</div>
          <div class="send-count"></div>
        </div>
      </div>
    </div>
  </el-scrollbar>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {useTransition} from "@vueuse/core";
import {defineOptions, onActivated, onDeactivated, onMounted, reactive, ref, watch, computed} from "vue";
import echarts from "@/echarts/index.js";
import dayjs from "dayjs";
import {analysisEcharts} from "@/request/analysis.js";
import {useUiStore} from "@/store/ui.js";
import {debounce} from "lodash-es";
import loading from "@/components/loading/index.vue";
import {useRoute} from "vue-router";
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'analysis'
})

const {t} = useI18n();
const route = useRoute();
const uiStore = useUiStore()
const checkedSourceType = ref('sender')
const receiveTotal = ref(0)
const sendTotal = ref(0)
const accountTotal = ref(0)
const userTotal = ref(0)
const analysisLoading = ref(true)

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


const receiveData = useTransition(receiveTotal, {
  duration: 1500,
})

const sendData = useTransition(sendTotal, {
  duration: 1500,
})

const accountData = useTransition(accountTotal, {
  duration: 1500,
})

const userData = useTransition(userTotal, {
  duration: 1500,
})

const senderData = ref(null)
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
  color: uiStore.dark ? '#E5EAF3' : '#303133',
  background: uiStore.dark ? '#141414' : '#FFFFFF',
  borderColor: uiStore.dark ? '#141414' : '#FFFFFF',
  scaleLineColor: uiStore.dark ? '#636466' : '#CDD0D6',
  crossColor: uiStore.dark ? '#8D9095' : '#A8ABB2',
  axisColor: uiStore.dark ? '#A3A6AD' : '#909399',
  splitLineColor: uiStore.dark ? '#58585B' : '#D4D7DE',
  gaugeSplitLine: uiStore.dark ? '#CFD3DC' : '#606266',
  containerBackground: uiStore.dark ? '#6C6E72' : '#E6EBF8'
}))
let daySendTotal = 0
let leaveWidth = 0
let senderPie = null
let increaseLine = null
let emailColumn = null
let sendGauge = null
let first = true
let boxKey = ref(0)
let senderPieLeft = window.innerWidth < 500 ? `${window.innerWidth - 110}` : '72%'
let analysisDark = uiStore.dark

onMounted(() => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  analysisEcharts(timeZone).then(data => {
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
    senderData.value = data.receiveRatio.nameRatio.map(item => {
      return {
        name: item.name || ' ',
        value: item.total
      }
    })

    userLineData.xdata = data.userDayCount.map(item => dayjs(item.date).format("M.D"));
    userLineData.sdata = data.userDayCount.map(item => item.total)

    emailColumnData.daysData = data.emailDayCount.receiveDayCount.map(item => dayjs(item.date).format("M.D"))
    emailColumnData.receiveData = data.emailDayCount.receiveDayCount.map(item => item.total)
    emailColumnData.sendData = data.emailDayCount.sendDayCount.map(item => item.total)
    daySendTotal = data.daySendTotal
    analysisLoading.value = false
    initPicture();
    first = false
  })

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
  } else if (!senderPie) {
    widthChange()
  } else if (analysisDark !== uiStore.dark) {
    initPicture()
    analysisDark = uiStore.dark
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
  analysisDark = uiStore.dark
  initPicture()
})

function initPicture() {
  if (route.name !== 'analysis') return
  boxKey.value++
  setTimeout(() => {
    createSenderPie()
    createIncreaseLine()
    createEmailColumnChart();
    createSendGauge();
  })
}

function setStyle() {
  senderPieLeft = window.innerWidth < 500 ? `${window.innerWidth - 110}` : '72%'
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

function createSenderPie() {

  if (senderPie) {
    senderPie.dispose()
  }
  senderPie = echarts.init(document.querySelector(".sender-pie"))
  let option = {
    tooltip: {
      trigger: 'item',
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background,
      formatter: params => {
        return `${params.marker} ${params.name}： ${params.value} (${params.percent}%)`;
      }
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      left: '10',
      top: '20',
      textStyle: {
        color: topic.value.color
      },
      formatter: function (name) {
        return truncateTextByWidth(name)
      }
    },
    series: [
      {
        data: senderData.value,
        name: '',
        type: 'pie',
        radius: ['40%', '65%'],
        center: [senderPieLeft, '45%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: topic.value.borderColor,
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'outside', // 标签显示在外部
          formatter: '{d}%',  // 显示名称和占比
          color: '#333',
          fontSize: 14  // 设置字体大小
        },
        emphasis: {
          label: {
            show: false,
            fontSize: 40,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: true
        },
        color: ['#3CB2FF', '#13DEB9', '#FBBF24', '#FF7F50', '#BAE6FD', '#C084FC'] // 添加符合主题的配色
      }
    ]
  }
  senderPie.setOption(option)
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
          color: '#1D84FF',
          width: 2.5
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: 'rgba(29, 132, 255, 0.3)'
            },
            {
              offset: 1,
              color: 'rgba(29, 132, 255, 0.03)'
            }
          ])
        },
        color: ['#1D84FF'],
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
          color: '#3CB2FF',
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
          color: '#13deb9',
        }
      }
    ]
  };

  emailColumn.setOption(option);
}

function createSendGauge() {
  if (sendGauge) {
    sendGauge.dispose()
  }
  sendGauge = echarts.init(document.querySelector(".send-count"));
  let option = {
    tooltip: {
      textStyle: {
        color: topic.value.color
      },
      backgroundColor: topic.value.background
    },
    series: [{
      name: t('sentToday'),
      type: 'gauge',
      max: 100,
      // 进度条颜色（新增）
      progress: {
        show: true,
        roundCap: true,
        itemStyle: {
          color: '#3CB2FF'
        }
      },
      // 指针颜色（新增）
      pointer: {
        itemStyle: {
          color: '#3CB2FF'
        }
      },
      axisLabel: {
        color: topic.value.gaugeSplitLine,
      },
      // 轴线背景色（新增）
      axisLine: {
        roundCap: true,
        lineStyle: {
          color: [[1, topic.value.containerBackground]]
        }
      },
      splitLine: {
        lineStyle: {
          color: topic.value.gaugeSplitLine, // 大刻度线颜色
        }
      },
      // 刻度颜色（新增）
      axisTick: {
        lineStyle: {
          color: topic.value.axisColor
        }
      },
      // 中心文字颜色（新增）
      detail: {
        valueAnimation: true,
        formatter: '{value}',
        color: topic.value.color // 黑色文字
      },
      data: [{
        value: daySendTotal,
        name: t('total'),
        // 名称标签颜色（新增）
        title: {
          color: topic.value.color  // 灰色标签
        }
      }]
    }],
    color: ['#3CB2FF']
  };
  sendGauge.setOption(option);
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
.analysis-loading {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.analysis {
  height: 100%;
  padding: 20px 20px 30px;
  gap: 20px;
  background: var(--extra-light-fill);
  display: grid;
  grid-auto-rows: min-content;
  @media (max-width: 1024px) {
    padding: 15px 15px 30px;
    gap: 15px
  }

  .title {
    margin-top: 10px;
    margin-left: 15px;
    font-size: 18px;
    font-weight: 500;
  }

  .number {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 20px;
    @media (max-width: 1366px) {
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    @media (max-width: 767px) {
      grid-template-columns: 1fr;
    }

    .number-item {
      background: var(--el-bg-color);
      border-radius: 8px;
      border: 1px solid var(--el-border-color);
      padding: 21px 20px;

      .top {
        display: grid;
        justify-content: space-between;
        align-content: center;
        grid-template-columns: auto auto;

        .left {
          display: grid;
          gap: 5px;
          grid-auto-rows: min-content;

          > div:first-child {
            font-size: 15px;
          }

          > div:last-child {
            font-size: 13px;
          }

          :deep(.el-statistic__number) {
            font-size: 26px;
          }
        }

        .right {
          display: grid;
          align-items: center;

          .count-icon {
            top: 3px;
            position: relative;
            display: grid;
            align-items: center;
            padding: 14px;
            border-radius: 8px;
            background: var(--el-color-primary-light-9);
            color: var(--el-color-primary);
          }
        }

      }

      .delete-ratio {
        width: 100%;
        display: grid;
        grid-template-columns:  auto auto;
        justify-content: start;
        gap: 20px;
        padding-top: 5px;
        font-size: 14px;

        .normal {
          width: fit-content;
          color: var(--el-color-success);
          font-weight: bold;;
          margin-left: 3px;
        }

        .deleted {
          width: fit-content;
          color: var(--el-color-danger);
          font-weight: bold;;
          margin-left: 3px;
        }
      }

    }
  }

  .picture {
    display: grid;
    grid-template-columns: 500px 1fr;
    gap: 20px;
    @media (max-width: 1620px) {
      grid-template-columns: 1fr;
    }
    @media (max-width: 1024px) {
      gap: 15px;
    }

    .picture-item {
      background: var(--el-bg-color);
      border-radius: 8px;
      border: 1px solid var(--el-border-color);

      .source-button {
        padding-right: 15px;
        display: flex;
        align-items: start;

        :deep(.el-radio-button__inner) {
          padding: 6px 10px;
        }
      }

      .sender-pie {
        height: 350px;
        @media (max-width: 767px) {
          height: 200px;
        }
      }

      .increase-line {
        height: 350px;
        @media (max-width: 767px) {
          height: 280px;
        }
      }
    }
  }

  .picture-cs {
    display: grid;
    grid-template-columns: 1fr 500px;
    gap: 20px;
    @media (max-width: 1620px) {
      grid-template-columns: 1fr;
      gap: 15px;
    }

    .picture-cs-item {
      background: var(--el-bg-color);
      border-radius: 8px;
      border: 1px solid var(--el-border-color);

      .send-count {
        height: 350px;
        @media (max-width: 767px) {
          height: 320px;
        }
      }

      .email-column {
        height: 350px;
        @media (max-width: 767px) {
          height: 250px;
        }
      }
    }
  }
}

</style>




















