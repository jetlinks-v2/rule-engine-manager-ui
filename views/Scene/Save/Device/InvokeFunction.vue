<template>
  <a-form ref='invokeForm' :model='formModel' layout='vertical' :colon='false'>
    <a-row :gutter='24'>
      <a-col :span='10'>
        <a-form-item
          name='functionId'
          :rules="[{ required: true, message: $t('Device.InvokeFunction.372523-0') }]"
        >
          <a-select
            showSearch
            allowClear
            v-model:value='formModel.functionId'
            style='width: 100%'
            :placeholder="$t('Device.InvokeFunction.372523-0')"
            :options='functions'
            :filterOption='filterSelectNode'
            @select='onSelect'
          />
        </a-form-item>
      </a-col>
      <a-col :span='14'>
        <a-form-item>{{ $t('Device.InvokeFunction.372523-1') }}</a-form-item>
      </a-col>
      <a-col :span='24'>
        <a-form-item
          name='functionData'
          :rules="rules"
        >
        <FunctionCall
          v-model:value='formModel.functionData'
          :data='functionData'
          @change='callDataChange'
        />
        </a-form-item>
      </a-col>
    </a-row>
  </a-form>
</template>

<script setup lang='ts' name='InvokeFunction'>
import { filterSelectNode } from '../../../../utils/comm'
import { FunctionCall } from '../components'
import type { PropType } from 'vue'
import { defineExpose } from 'vue'
import { useI18n } from 'vue-i18n'

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
    const properties = functionItem.input?.properties || functionItem.inputs;
    for (const datum of properties) {
      arrCache.push({
        id: datum.id,
        name: datum.name,
        type: datum.valueType?.type || '-',
        type: datum.valueType?.type || '-',
        format: datum.valueType?.format || undefined,
        options: handlePropertiesOptions(datum.valueType),
        value: undefined,
        required: datum.expands?.required
      });
    }
  }

  return arrCache
})

const rules = [{
  validator(_: string, value: any) {
    const requiredFields = functionData.value.filter((i: any) => i?.required)
    if (!requiredFields.length) return Promise.resolve()
    
    if (!value?.length) {
      return Promise.reject($t('Device.InvokeFunction.372523-4'))
    }

    // 检查所有必填字段是否都有值
    const missingField = requiredFields.find(field => {
      const inputValue = value.find((v: any) => v.name === field.id)
      return !inputValue?.value
    })

    if (missingField) {
      return Promise.reject(
        missingField.name 
          ? $t('Device.InvokeFunction.372523-5', [missingField.name]) 
          : $t('Device.InvokeFunction.372523-4')
      )
    }

    return Promise.resolve()
  }
}]

const onSelect = (v: string, item: any) => {
  formModel.functionData = []
  emit('update:action', $t('Device.InvokeFunction.372523-6', [item.name]))
  emit('update:functionId', v)
  emit('update:functionParameters', [])
}

const callDataChange = (v: any[]) => {
  emit('update:functionParameters', v)
}

defineExpose({
  validateFields: () => new Promise(async (resolve)  => {
    const data = await invokeForm.value?.validateFields()
    resolve(data)
  })
})

</script>

<style scoped>

</style>
