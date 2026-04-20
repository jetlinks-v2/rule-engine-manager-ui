<template>
  <div
    class="count-summary-card"
    :style="style"
  >
    <a-spin :spinning="loading">
      <div
        v-if="error"
        class="count-summary-card__state count-summary-card__state--error"
      >
        {{ error }}
      </div>
      <div
        v-else-if="empty"
        class="count-summary-card__state count-summary-card__state--empty"
      >
        <a-empty
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="metric.emptyText"
        />
      </div>
      <div
        v-else
        class="count-summary-card__metric"
      >
        <div
          class="count-summary-card__icon"
          :style="{ backgroundColor: metric.iconColor }"
        >
          <AIcon :type="metric.iconType" />
        </div>
        <div class="count-summary-card__metric-content">
          <div class="count-summary-card__title">
            {{ metric.topTitle || metric.label }}
          </div>
          <div
            v-if="showLabel && metric.label && metric.label !== metric.topTitle"
            class="count-summary-card__label"
          >
            {{ metric.label }}
          </div>
          <div
            class="count-summary-card__value"
            :style="{ color: metric.valueColor }"
          >
            {{ metric.value }}
          </div>
        </div>
      </div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { Empty } from 'ant-design-vue'
import type { PropType } from 'vue'
import type { CountSummaryCardStyle, CountSummaryMetricViewModel } from '../shared'

defineOptions({
  name: 'AlarmCenterCountSummaryCard'
})

defineProps({
  metric: {
    type: Object as PropType<CountSummaryMetricViewModel>,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  empty: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: ''
  },
  style: {
    type: [Object, String] as PropType<CountSummaryCardStyle>,
    default: () => ({})
  },
  showLabel: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped lang="less">
.count-summary-card {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 12px 10px;
  box-sizing: border-box;
  background: #fff;
}

.count-summary-card :deep(.ant-spin-nested-loading),
.count-summary-card :deep(.ant-spin-container) {
  width: 100%;
  height: 100%;
}

.count-summary-card__metric,
.count-summary-card__state {
  width: 100%;
  height: 100%;
}

.count-summary-card__metric {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.count-summary-card__metric-content {
  min-width: 0;
  flex: 1;
}

.count-summary-card__icon {
  width: 96px;
  height: 96px;
  margin-right: 32px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 42px;
  border-radius: 8px;
}

.count-summary-card__title {
  min-width: 0;
  color: #777;
  font-size: 30px;
  font-weight: 400;
  line-height: 36px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count-summary-card__value {
  color: #1f1f1f;
  margin-top: 4px;
  font-size: 48px;
  font-weight: 500;
  line-height: 58px;
}

.count-summary-card__label {
  margin-top: 6px;
  color: #999;
  font-size: 18px;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count-summary-card__state {
  display: flex;
  align-items: center;
  justify-content: center;
}

.count-summary-card__state--error {
  color: #ff4d4f;
  font-size: 13px;
  text-align: center;
}

.count-summary-card__state--empty :deep(.ant-empty) {
  margin: 0;
}
</style>
