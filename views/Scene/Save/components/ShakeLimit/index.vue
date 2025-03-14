<template>
    <div class="shakeLimit">
        <a-switch
            :checkedChildren="$t('ShakeLimit.index.9093426-0')"
            :unCheckedChildren="$t('ShakeLimit.index.9093426-1')"
            v-model:checked="shakeLimit.enabled"
            style="margin-right: 12px"
        />
        <template v-if="shakeLimit.enabled">
            <a-input-number :min="1"  :precision="0" size="small" v-model:value="shakeLimit.time" style="width: 38px" />
            <span>{{ $t('ShakeLimit.index.9093426-2') }}</span>
            <a-input-number :min="1" :max="100" :precision="0" size="small" v-model:value="shakeLimit.threshold" style="width: 38px" />
            <span>{{ $t('ShakeLimit.index.9093426-3') }}</span>
            <a-radio-group :options="alarmFirstOptions" optionType="button" v-model:value="shakeLimit.alarmFirst" size="small" @change="handleChange"/>
        </template>
    </div>
</template>

<script lang="ts" setup>
import { PropType } from "vue";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
type ShakeLimitType = {
    enabled: boolean | undefined,
    time?: number | undefined | null,
    threshold?: number | undefined | null,
    alarmFirst?: boolean | undefined
    outputFirst?: boolean | undefined
}

type Emit = {
  (e: 'update:value', data: ShakeLimitType): void
}

const alarmFirstOptions = [
  { label: $t('ShakeLimit.index.9093426-4'), value: true },
  { label: $t('ShakeLimit.index.9093426-5'), value: false },
];

const props = defineProps({
  value: {
    type: Object as PropType<ShakeLimitType>,
    default: () => ({})
  }
})

const emit = defineEmits<Emit>()

const shakeLimit = reactive<ShakeLimitType>({
    enabled: undefined,
    time: 1,
    threshold: 1,
    alarmFirst: undefined,
    outputFirst: undefined
})

Object.assign(shakeLimit, props.value)

const handleChange = (e: InputEvent) => {
  shakeLimit.outputFirst = e.target?.value
}

watch(() => shakeLimit, () => {
    emit('update:value', {...shakeLimit})
}, {
    deep: true
})

</script>

<style lang="less" scoped>
.shakeLimit {
  display: flex;
  gap: 4px;
  align-items: center;
  font-weight: 400;
  font-size: 14px;
  :deep(.ant-input-number-handler-wrap) {
    display: none;
  }

  :deep(.ant-radio-button-wrapper) {
    padding: 0 16px;
  }

  input {
    padding: 0 4px;
  }
}
</style>