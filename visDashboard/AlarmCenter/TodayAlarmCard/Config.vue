<template>
  <div class="card-container">
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

<script lang="ts" name="TodayAlarmCard" setup>
import { cloneDeep } from 'lodash-es'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()

const { ConfigItem, InputNumber } = moduleRegistry.getResource('visualization-designer-ui', 'components')
const props = defineProps({
  configData: {
    type: Object,
    default: () => ({})
  },
  type: {
    type: String,
    default: 'todayAlarmCard'
  }
})

const emits = defineEmits(['change'])
const config = ref<any>({})

const onChange = () => {
  emits('change', config.value, props.type)
}

watch(
  () => props.configData?.componentProps?.[props.type],
  (newVal) => {
    if (newVal) {
      config.value = cloneDeep(newVal)
    }
  },
  { deep: true, immediate: true }
)
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
