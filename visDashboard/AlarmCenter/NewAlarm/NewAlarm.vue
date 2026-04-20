<template>
  <div
    class="new-alarm"
    :style="_style"
  >
    <div class="title">{{ $t('NewAlarm.index.100009-0') }}</div>
    <div
      v-if="alarmList.length"
      class="new-alarm-items"
    >
      <ul>
        <li
          v-for="item in alarmList.slice(0, _data.maxCount)"
          :key="item.id"
        >
          <div class="new-alarm-item">
            <div class="new-alarm-item-time">
              <img
                :src="fireIcon"
                alt=""
                draggable="false"
              />
              {{
                item.lastAlarmTime
                  ? dayjs(item.lastAlarmTime).format('YYYY-MM-DD HH:mm:ss')
                  : dayjs(item.alarmTime).format('YYYY-MM-DD HH:mm:ss')
              }}
            </div>
            <div class="new-alarm-item-content">
              <a-tooltip
                :title="item.alarmName"
                placement="topLeft"
              >
                <a>{{ item.alarmName }}</a>
              </a-tooltip>
            </div>
            <div class="new-alarm-item-state">
              <j-badge-status :status="item.state?.value === 'warning' ? 'error' : 'default'"></j-badge-status>
              <span :class="item.state?.value === 'warning' ? 'error' : 'default'">
                {{ item.state?.text }}
              </span>
            </div>

            <div :class="['new-alarm-item-level', `level-${item.level}`]">
              <j-ellipsis style="width: calc(100%)">
                {{ item.levelName }}
              </j-ellipsis>
            </div>
          </div>
        </li>
      </ul>
    </div>
    <div
      v-else
      class="empty-body"
    >
      <j-empty :image="Empty.PRESENTED_IMAGE_SIMPLE"></j-empty>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Empty } from 'ant-design-vue'
import fireIcon from '@visualization-dashboard-ui/assets/dashboard/fire-icon.png'
import dayjs from 'dayjs'
import { getAlarm as getLatestAlarm, getAlarmLevel as queryAlarmLevel } from '@rule-engine-manager-ui/api/dashboard'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

interface AlarmItem {
  id: string
  alarmName: string
  alarmTime: number
  lastAlarmTime?: number
  state?: {
    value: string
    text: string
  }
  level: number
  levelName: string
}

const props = defineProps({
  info: {
    type: Object,
    default: () => ({})
  },
  style: {
    type: Object,
    default: () => ({})
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

let timer: any = null

const _style = computed(() => {
  return props.style
})

const _data = ref<any>({
  alarmList: [] as AlarmItem[]
})

const alarmList = computed(() => {
  if (alarmLevel.value.length > 0) {
    const levels = alarmLevel.value
    return _data.value.alarmList
      .filter((i: any) => i?.state?.value === 'warning')
      .map((item: { level: any }) => ({
        ...item,
        levelName: levels.find((l: any) => l.level === item.level)?.title
      }))
  } else {
    return _data.value.alarmList.filter((item: any) => item?.state?.value === 'warning')
  }
})

const terms = reactive({
  pageIndex: 0,
  pageSize: 12,
  sorts: [{ name: 'lastAlarmTime', order: 'desc' }],
  terms: [{ terms: [{ value: 'warning', termType: 'eq', column: 'state' }] }]
})

const alarmLevel = ref<any[]>([])

const getAlarmLevel = async () => {
  const res: any = await queryAlarmLevel()
  if (res.status === 200) {
    alarmLevel.value = res.result.levels
  } else {
    alarmLevel.value = []
  }
}

const getData = async () => {
  const res: any = await getLatestAlarm(terms)
  if (res.status === 200) {
    _data.value.alarmList = res.result.data || []
  }
}

watch(
  () => props.info.componentProps?.newAlarm,
  (newVal) => {
    if (props.isEdit || !newVal) return

    const interval = newVal.isAutoRefresh ? newVal.interval : 0
    terms.pageSize = newVal.maxCount

    // handleDataUpdate(interval)
    getData()
    if (interval) {
      clearInterval(timer)
      timer = setInterval(() => {
        getData()
      }, interval * 1000)
    }
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  getAlarmLevel()
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>
<style scoped lang="less">
.new-alarm {
  padding: 24px;
  padding-right: 12px;
  background-color: #fff;
  height: 100%;
  width: 100%;
  .title {
    color: rgba(0, 0, 0, 0.64);
    font-size: 14px;
    margin-bottom: 8px;
  }
}
.new-alarm-items {
  height: calc(100% - 24px);
  overflow-y: auto;
  padding-right: 12px;
  ul {
    list-style: none;
    padding: 0;
  }
  .new-alarm-item {
    display: flex;
    gap: 12px;
    margin: 18px 0;
    font-size: 12px;
    .new-alarm-item-time {
      width: 180px;
      font-size: 14px;

      > img {
        margin-right: 8px;
      }
    }
  }
  .new-alarm-item-content {
    width: ~'calc(100% - 360px)';
  }
  .new-alarm-item-state {
    width: 90px;
    text-align: center;
    font-size: 14px;
    .error {
      color: @error-color;
    }

    .default {
      color: @text-color;
    }
  }
  .new-alarm-item-level {
    width: 70px;
    padding: 2px 8px;
    color: #fff;
    text-align: center;
    border-radius: 2px;

    &.level-1 {
      background-color: #e50012;
    }

    &.level-2 {
      background-color: #ff9457;
    }

    &.level-3 {
      background-color: #fabd47;
    }

    &.level-4 {
      background-color: #999;
    }

    &.level-5 {
      background-color: #bbb;
    }
  }
}
.empty-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-content: center;
  justify-content: center;
}
</style>
