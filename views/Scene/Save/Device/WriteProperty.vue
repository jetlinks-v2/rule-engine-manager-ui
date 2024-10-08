<template>
  <a-form ref='writeForm' :model='formModel' layout='vertical' :colon='false'>
    <a-row :futter='[24, 24]'>
      <a-col :span='10'>
        <a-form-item
          name='reportKey'
          :rules="[{ required: true, message: '请输入修改值' }]"
        >
          <a-select
            showSearch
            style='width: 100%'
            placeholder='请选择属性'
            v-model:value='formModel.reportKey'
            :options='properties'
            :filter-option='filterSelectNode'
            @change='change'
          />
        </a-form-item>
      </a-col>
      <a-col :span='14'>
        <span style='line-height: 32px;padding-left: 24px'>
          定时调用所选属性
        </span>
      </a-col>
      <a-col :span='24' v-if='showTable'>
        <a-form-item
          name='data'
          :rules="rules"
        >
          <FunctionCall
            v-model:value='formModel.data'
            :data='callDataOptions'
            @change='callDataChange'
          />
        </a-form-item>
      </a-col>
    </a-row>
  </a-form>
</template>

<script setup lang='ts' name='WriteProperties'>
import { filterSelectNode } from '../../../../utils/comm'
import { FunctionCall } from '../components'
import type { PropType } from 'vue'
import { defineExpose } from 'vue'

type Emit = {
  (e: 'update:value', data: Record<string, any>): void
  (e: 'update:action', data: string): void
}

const props = defineProps({
  value: {
    type: Object as PropType<Record<string, any>>,
    default: () => []
  },
  action: {
    type: String,
    default: ''
  },
  properties: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits<Emit>()

const formModel = reactive<{ reportKey: string | undefined, data: any[] }>({
  reportKey: undefined,
  data: Object.keys(props.value).map(key => ({ name: key, value: props.value[key] })) || []
})

const callData = ref<Array<{ id: string, value: string | undefined }>>()
const writeForm = ref()
const _value = ref([])

const handleOptions = (item: any, type: string) => {
  if (type === 'enum') {
    return item.valueType.elements?.map((a: any) => ({ ...a, label: a.text }))
  } else if (type === 'boolean') {
    return [
      { label: item.valueType.trueText, value: item.valueType.trueValue },
      { label: item.valueType.falseText, value: item.valueType.falseValue },
    ]
  }
  return undefined
}

const callDataOptions = computed(() => {
  const _valueKeys = Object.keys(props.value)
  if (_valueKeys.length) {
    return _valueKeys.map(key => {
      const item: any = props.properties.find((p: any) => p.id === key)
      if (item) {
        const _options = handleOptions(item, item.valueType?.type)
        return {
          id: item.id,
          name: item.name,
          type: item.valueType ? item.valueType.type : '-',
          format: item.valueType ? item.valueType.format : undefined,
          options: _options,
          value: props.value[key]
        }
      }
      return {
        id: key,
        name: key,
        type: '',
        format: undefined,
        options: undefined,
        value: undefined
      }
    })
  }
  return []
})

nextTick(() => {
  formModel.reportKey = Object.keys(props.value)[0]
})

const showTable = computed(() => {
  return !!formModel.reportKey
})

const change = (v: string, option: any) => {
  const _data = {
    [v]: undefined
  }
  callData.value = [{ id: v, value: undefined }]
  emit('update:value', _data)
  emit('update:action', `修改${option.name}`)
}

const callDataChange = (v: any[]) => {
  emit('update:value', {
    [formModel.reportKey!]: v[0]?.value
  })
}

const rules = [{
  validator(_: string, value: any) {
    if (!value?.length && callDataOptions.value.length) {
      return Promise.reject('请选择属性值')
    } else {
      let hasValue = value.find((item: { name: string, value: any}) => !item.value)
      if (hasValue) {
        const item = callDataOptions.value.find((item: any) => item.id === hasValue.name)
        return Promise.reject(item?.name ? `请输入${item?.name}值` : '请输入属性值')
      }
    }
    return Promise.resolve();
  }
}]

const initRowKey = () => {
  if (props.value.length) {
    const keys = Object.keys(props.value)
    formModel.reportKey = keys[0]
  }
}

defineExpose({
  validateFields: () => new Promise(async (resolve)  => {
    const data = await writeForm.value?.validateFields()
    resolve(data)
  })
})

</script>

<style scoped>

</style>
