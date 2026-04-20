<template>
  <div class="card-container">
    <config-item :label="$t('AlertStats.Config.100003-0')">
      <a-select
        v-model:value="config.targetType"
        :max-tag-count="1"
        :options="typeList"
        mode="multiple"
        :placeholder="$t('AlertStats.Config.100003-1')"
        popupClassName="is-dark"
        style="width: 100%"
        @change="onTypeChange"
      />
    </config-item>

    <config-item :label="$t('AlertStats.Config.100003-2')">
      <a-switch
        v-model:checked="config.quickBtn"
        @change="onChange"
      />
    </config-item>

    <config-item
      v-if="config.quickBtn"
      :label="$t('AlertStats.Config.100003-3')"
    >
      <a-select
        v-model:value="config.defaultType"
        :options="quickBtnList"
        :placeholder="$t('AlertStats.Config.100003-4')"
        popup-class-name="is-dark"
        style="width: 100%"
        @change="onChange"
      />
    </config-item>

    <config-item :label="$t('AlertStats.Config.100003-5')">
      <ColorPicker
        v-model:value="config.color"
        theme="white"
        @change="onChange"
      />
    </config-item>

    <config-item :label="$t('AlertStats.Config.100003-6')">
      <a-switch
        v-model:checked="config.hoverTip"
        @change="onChange"
      />
    </config-item>

    <template v-if="config.hoverTip">
      <config-item :label="$t('AlertStats.Config.100003-7')">
        <a-input
          v-model:value="config.hoverTitle"
          :maxlength="64"
          :placeholder="$t('AlertStats.Config.100003-8')"
          @change="onChange"
        />
      </config-item>
    </template>

    <config-item :label="$t('AlertStats.Config.100003-9')">
      <a-switch
        v-model:checked="config.isAutoRefresh"
        @change="onChange"
      />
    </config-item>

    <template v-if="config.isAutoRefresh">
      <config-item :label="$t('AlertStats.Config.100003-10')">
        <a-space>
          <input-number
            v-model:value="config.interval"
            :max="999999"
            :min="1"
            :valueOnClear="1"
            style="width: 100%"
            @change="onChange"
          />
          <span>{{ $t('AlertStats.Config.100003-11') }}</span>
        </a-space>
      </config-item>
    </template>
  </div>
</template>

<script lang="ts" name="AlertStats" setup>
import { cloneDeep } from 'lodash-es'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { useI18n } from 'vue-i18n'
import { isNoCommunity } from '@visualization-dashboard-ui/utils/commonUtils'

const { t: $t } = useI18n()

const props = defineProps({
  configData: {
    type: Object,
    default: () => ({})
  }
})

const emits = defineEmits(['change'])
const config = ref<any>({
  topTitle: '',
  targetType: ['device'],
  selectOpt: []
})

const { request } = moduleRegistry.getResource('visualization-manager-ui', 'utils')
const { ConfigItem, ColorPicker, InputNumber } = moduleRegistry.getResource('visualization-designer-ui', 'components')
const typeList = ref<any[]>([])

const quickBtnList = computed(() => [
  { label: $t('TimeSelect.index.100001-0'), value: 'hour' },
  { label: $t('TimeSelect.index.100001-1'), value: 'day' },
  { label: $t('TimeSelect.index.100001-2'), value: 'week' }
])

const useAlarmConfigType = () => {
  request.get('/alarm/config/target-type/supports').then((res: any) => {
    typeList.value = res.result
      .map((item: any) => {
        if (!isNoCommunity && item.id === 'organization') {
          return
        }
        return {
          label: `${item.name}${$t('AlertStats.Config.100003-12')}`,
          name: item.name,
          value: item.id
        }
      })
      .filter(Boolean)
    typeList.value.unshift({ label: $t('AlertStats.Config.100003-13'), value: 'all' })
  })
}

const updateTopTitle = () => {
  if (!config.value.targetType || config.value.targetType.length === 0) {
    config.value.topTitle = $t('AlertStats.Config.100003-12')
  } else if (config.value.targetType.length === 1 && config.value.targetType[0] !== 'all') {
    const selectedType = typeList.value.find((item) => item.value === config.value.targetType[0])
    if (selectedType && selectedType.name) {
      config.value.topTitle = `${selectedType.name}${$t('AlertStats.Config.100003-12')}`
    } else {
      config.value.topTitle = $t('AlertStats.Config.100003-12')
    }
  } else {
    config.value.topTitle = $t('AlertStats.Config.100003-12')
  }
}

const updateSelectOpt = () => {
  config.value.selectOpt = config.value.targetType
    .filter((value: string) => value !== 'all')
    .map((value: string) => {
      const type = typeList.value.find((item) => item.value === value)
      return { label: type?.name || type?.label || '', value }
    })
}

const onTypeChange = (value: any) => {
  if (value.includes('all')) {
    // 如果选择了「全部」，自动选择所有其他选项
    const allOtherOptions = typeList.value.filter((item) => item.value !== 'all').map((item) => item.value)
    config.value.targetType = [...allOtherOptions]
  } else {
    config.value.targetType = value
  }

  updateTopTitle()
  updateSelectOpt()
  onChange()
}

const onChange = () => {
  console.log(config.value, 'config')
  emits('change', config.value, 'alertStats')
}

watch(
  () => props.configData?.componentProps?.alertStats,
  (newVal) => {
    if (newVal) {
      config.value = cloneDeep(newVal)
    }
  },
  { deep: true, immediate: true }
)

onMounted(() => {
  useAlarmConfigType()
})
</script>

<style lang="less" scoped>
.card-container {
  color: #fff;
  gap: 12px;
  display: flex;
  flex-direction: column;
   margin-left: 20px;

  .card-container-row {
    display: flex;
  }
}
</style>
