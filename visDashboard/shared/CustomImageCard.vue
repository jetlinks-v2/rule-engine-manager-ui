<template>
  <div
    class="top-card"
    :style="_style"
  >
    <div class="top-card-content">
      <div class="content-left">
        <div class="content-left-title">
          <a-space size="small">
            <j-ellipsis>{{ config.topTitle }}</j-ellipsis>
            <a-tooltip
              v-if="config.tooltip"
              placement="top"
            >
              <template #title>
                <span>{{ config.tooltip }}</span>
              </template>
              <AIcon type="QuestionCircleOutlined" />
            </a-tooltip>
          </a-space>
        </div>
        <div
          class="content-left-value"
          :id="info.id + '__param_1'"
        >
          <j-ellipsis>{{ _data?._param_1 ?? '--' }}</j-ellipsis>
        </div>
      </div>
      <div class="content-right">
        <img
          :src="config.img || imgLoadFail"
          alt=""
          draggable="false"
        />
      </div>
    </div>
    <div
      v-if="isShowFooter"
      class="top-card-footer"
    >
      <a-space>
        <j-ellipsis>
          <span>{{ config.bottomLeftTitle }}</span>
        </j-ellipsis>
        <template v-if="config.bottomLeftStatus !== 'disabled'">
          <a-badge :status="config.bottomLeftStatus" />
          <div
            class="footer-item-value"
            :id="info.id + '__param_2'"
          >
            <j-ellipsis>
              <span>{{ _data?._param_2 ?? '--' }}</span>
            </j-ellipsis>
          </div>
        </template>
      </a-space>
      <a-space>
        <j-ellipsis>
          <span>{{ config.bottomRightTitle }}</span>
        </j-ellipsis>
        <template v-if="config.bottomRightStatus !== 'disabled'">
          <a-badge :status="config.bottomRightStatus" />
          <div
            class="footer-item-value"
            :id="info.id + '__param_3'"
          >
            <j-ellipsis>
              <span>{{ _data?._param_3 ?? '--' }}</span>
            </j-ellipsis>
          </div>
        </template>
      </a-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { cloneDeep } from 'lodash-es'
import { getImageByType } from '@visualization-dashboard-ui/utils/commonUtils'
import imgLoadFail from '@visualization-dashboard-ui/assets/svg/imgLoadFail.svg'

const props = defineProps({
  type: {
    type: String,
    default: 'customImageCard'
  },
  systemData: {
    type: Object,
    default: () => ({})
  },
  isShowFooter: {
    type: Boolean,
    default: true
  },
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

let event: (() => void) | undefined

const _data = ref<any>({})

const config = ref<any>({
  topTitle: '',
  bottomLeftTitle: '',
  bottomLeftStatus: '',
  bottomRightTitle: '',
  bottomRightStatus: '',
  tooltip: '',
  img: '',
  imageChannel: 'network'
})

const _style = computed(() => props.style)

watch(
  () => props.info.componentProps?.[props.type],
  (newVal) => {
    if (newVal) {
      config.value = cloneDeep(newVal)
      if (config.value.imageChannel === 'local' && config.value.img) {
        config.value.img = getImageByType('thumbnail', {
          thumbnailUrl: config.value.img
        })
      }
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.systemData,
  (newVal) => {
    _data.value = newVal
  },
  { deep: true }
)

onMounted(() => {
  if (props.info.dataSourceProps) {
    const { sourceId, id } = props.info.dataSourceProps
    event = (window as any).$viewDataEventBus.subscribe(sourceId, (val: any) => {
      _data.value = val[id]
    })
  }
})

onUnmounted(() => {
  event?.()
})
</script>

<style lang="less" scoped>
.top-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  padding: 24px 24px 12px 24px;
  box-sizing: border-box;

  .top-card-content {
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: space-between;
    align-items: stretch;
    min-height: 0;

    .content-left {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
      flex: 1;

      &-title {
        font-size: 14px;
        line-height: 1.4;
        margin-bottom: 8px;
      }

      &-value {
        font-size: 26px;
        flex: 1;
        display: flex;
        align-items: center;
      }
    }

    .content-right {
      width: 50%;
      height: 100%;
      min-height: 80px;
      margin-left: 16px;
      display: flex;
      align-items: center;
      justify-content: center;

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    }
  }

  .top-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 16px;
    margin-top: 16px;
    border-top: 1px solid #f0f0f0;
    flex-shrink: 0;

    .footer-item-value {
      font-weight: 700;
      font-size: 16px;
    }
  }
}
</style>
