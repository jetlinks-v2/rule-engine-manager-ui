<template>
  <a-form ref='invokeForm' :model='formModel' layout='vertical' :colon='false'>
    <a-row :gutter='24'>
      <a-col :span='24'>
        <a-form-item
          name='functionId'
          :rules="[{ required: true, message: $t('Device.InvokeFunction.372523-0') }]"
        >
          <template #label>{{ $t('actions.index.9667837-2') }} <a-tooltip :title="$t('Device.InvokeFunction.372523-1')"><AIcon type="QuestionCircleOutlined" /></a-tooltip></template>
          <ThingModelSelect v-model="formModel.functionId" allow-clear :placeholder="$t('Device.InvokeFunction.372523-0')" :options="functionOptions" @change="onSelect" />
        </a-form-item>
      </a-col>

      <a-col :span='24'>
        <FunctionCall compact
          ref="functionRef"
          :data='functionData'
          @change='callDataChange'
        />
      </a-col>
    </a-row>
  </a-form>
</template>

<script setup lang='ts'>
import ThingModelSelect from '../../../SceneLinkage/editor/components/ThingModelSelect.vue'
import { toThingModelOptions } from '../../../SceneLinkage/editor/thingModel'
import { FunctionCall } from '../components'
import type { PropType } from 'vue'
import { defineExpose } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'InvokeFunction' })

const { t: $t } = useI18n()
type Emit = {
  (e: 'update:functionParameters', data: Array<Record<string, any>>): void
  (e: 'update:functionId', data: string): void
  (e: 'update:action', data: string): void
}

const props = defineProps({
  functionId: {
    type: String,
    default: undefined
  },
  functionParameters: {
    type: Array as PropType<Record<string, any>[]>,
    default: () => []
  },
  action: {
    type: String,
    default: ''
  },
  functions: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits<Emit>()
const invokeForm = ref()
const formModel = reactive({
  functionId: props.functionId,
  functionData: props.functionParameters
})
const functionRef = ref()
const functionOptions = computed(() => toThingModelOptions(props.functions, 'function'))

const handlePropertiesOptions = (propertiesValueType: any) => {
  const _type = propertiesValueType?.type
  if (_type === 'boolean') {
    return [
      { label: propertiesValueType?.falseText || $t('Device.InvokeFunction.372523-2'), value: propertiesValueType?.falseValue || false },
      { label: propertiesValueType?.trueText || $t('Device.InvokeFunction.372523-3'), value: propertiesValueType?.trueValue || true },
    ]
  } else if (_type === 'enum') {
    return propertiesValueType?.elements?.map((a: any) => ({ ...a, label: a.text }))
  }

  return propertiesValueType?.elements
}

/**
 * 获取当前选择功能属性
 */
const functionData = computed(() => {
  const functionItem: any = props.functions.find((f: any) => f.id === formModel.functionId)
  const arrCache = []

  if (functionItem) {
    const properties = functionItem.input?.properties || functionItem.inputs || [];
    for (const datum of properties) {
      const oldItem = props.functionParameters.find(item => item.name === datum.id)
      arrCache.push({
        id: datum.id,
        name: datum.name,
        type: datum.valueType?.type || '-',
        format: datum.valueType?.format || undefined,
        options: handlePropertiesOptions(datum.valueType),
        value: oldItem?.value,
        required: datum.expands?.required
      });
    }
  }

  return arrCache
})

const onSelect = (v: string) => {
  const item = props.functions.find((entry: any) => entry.id === v) as any
  formModel.functionData = []
  emit('update:action', $t('Device.InvokeFunction.372523-6', [item?.name || v]))
  emit('update:functionId', v)
  emit('update:functionParameters', [])
}

const callDataChange = (v: any[]) => {
  emit('update:functionParameters', v)
}

const isEmpty = (v) => {
  return v.value !== null && v.value !== undefined && v.value !== ''
}

defineExpose({
  validateFields: async () => {
    const data = await invokeForm.value?.validateFields()
    const data2 = await functionRef.value?.validate()
    return {
      ...data,
      functionData: (data2 || []).filter(isEmpty).map(item => ({ name: item.id, value: item.value}))
    }
  }
})

</script>

<style scoped>

</style>
