<template>
  <div class="card-container">
    <config-item label="标题">
      <a-input
        v-model:value="config.topTitle"
        placeholder="请输入标题"
        @change="onChange"
      />
    </config-item>

    <config-item
      v-if="showLabelConfig"
      label="标签"
    >
      <a-input
        v-model:value="config.customLabel"
        placeholder="请输入标签"
        @change="onChange"
      />
    </config-item>

    <config-item label="图标">
      <a-select
        v-model:value="config.iconType"
        :options="iconOptions"
        popupClassName="is-dark"
        style="width: 100%"
        @change="onChange"
      />
    </config-item>

    <config-item label="图标颜色">
      <ColorPicker
        v-model:value="config.iconColor"
        :isInput="false"
        style="margin-right: 6px"
        theme="white"
        @change="onChange"
      />
    </config-item>

    <config-item label="数值颜色">
      <ColorPicker
        v-model:value="config.valueColor"
        :isInput="false"
        style="margin-right: 6px"
        theme="white"
        @change="onChange"
      />
    </config-item>

    <config-item label="预览值">
      <input-number
        v-model:value="config.mockValue"
        :min="0"
        :precision="0"
        style="width: 100%"
        @change="onChange"
      />
    </config-item>
  </div>
</template>

<script setup lang="ts">
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { cloneDeep } from 'lodash-es'
import type { PropType } from 'vue'
import type { CountSummaryCardInfo, CountSummaryComponentConfig } from '../shared'

defineOptions({
  name: 'AlarmCenterCountSummaryConfig'
})

const { ConfigItem, InputNumber, ColorPicker } = moduleRegistry.getResource('visualization-designer-ui', 'components')

const props = defineProps({
  configData: {
    type: Object as PropType<CountSummaryCardInfo>,
    default: () => ({})
  },
  type: {
    type: String,
    required: true
  },
  showLabelConfig: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['change'])

const defaultConfig: CountSummaryComponentConfig = {
  topTitle: '',
  customLabel: '',
  badgeText: '',
  tooltip: '',
  fallbackName: '',
  iconType: 'WarningFilled',
  iconColor: '#df474f',
  valueColor: '#1f1f1f',
  mockValue: 0,
  emptyText: ''
}

const iconOptions = [
  { label: '告警', value: 'WarningFilled' },
  { label: '设备', value: 'DeploymentUnitOutlined' },
  { label: '网络', value: 'GatewayOutlined' },
  { label: '结构', value: 'ApartmentOutlined' }
]

const config = ref<CountSummaryComponentConfig>({
  ...defaultConfig
})

const onChange = () => {
  emit('change', config.value, props.type)
}

watch(
  () => props.configData?.componentProps?.[props.type],
  (value) => {
    config.value = {
      ...defaultConfig,
      ...cloneDeep((value as Partial<CountSummaryComponentConfig>) || {})
    }
  },
  { immediate: true, deep: true }
)
</script>

<style scoped lang="less">
.card-container {
  color: #fff;
  gap: 12px;
  display: flex;
  flex-direction: column;
  margin-left: 20px;
}
</style>
