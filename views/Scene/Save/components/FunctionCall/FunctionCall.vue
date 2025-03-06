<template>
  <a-table
    mode='TABLE'
    :pagination='false'
    :data-source='dataSource.value'
    :columns='columns'
    :bodyStyle='{ padding: 0}'
  >
    <template #bodyCell="{ column, record, index }">
      <template v-if='column.dataIndex === "name"'>
        <j-ellipsis>
         {{ record.name }}
        </j-ellipsis>
      </template>
      <template v-if='column.dataIndex === "type"'>
        {{ record.type }}
        <a-tooltip
          v-if="record.type === 'object'"
        >
          <template slot="title">
            {{ $t('FunctionCall.FunctionCall.9093413-0') }}
          </template>

          <AIcon
            type="QuestionCircleOutlined"
            :style="{
               marginLeft: '5px',
               cursor: 'help',
            }"
          />
        </a-tooltip>
      </template>
      <template v-if='column.dataIndex === "value"'>
        <div style='max-width: 260px'>
          <j-value-item
            v-model:modelValue='record.value'
            :itemType="record.type === 'date'? 'time' : record.type"
            :options="record.options"
            :extraProps="{
              style: { width: '100%'}
            }"
            @change='valueChange'
          />
        </div>
      </template>
    </template>
  </a-table>
</template>

<script setup lang='ts' name='FunctionCall'>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
type Emit = {
  (e: 'change', data: Array<{ name: string, value: any}>): void
  (e: 'update:value', data: Array<{ name: string, value: any}>): void
}

const emit = defineEmits<Emit>()

const props = defineProps({
  value: {
    type: Array as PropType<Array<{ label: string, value: any}>>,
    default: () => []
  },
  data: {
    type: Array,
    default: () => []
  }
})

const dataSource = reactive<{value: any[]}>({
  value: []
})

const columns = [
  {
    title: $t('FunctionCall.FunctionCall.9093413-1'),
    dataIndex: 'name',
    width: 300
  },
  {
    title: $t('FunctionCall.FunctionCall.9093413-2'),
    dataIndex: 'type'
  },
  {
    title: $t('FunctionCall.FunctionCall.9093413-3'),
    dataIndex: 'value',
    align: 'center',
    width: 260
  },
]

const valueChange = () => {
  const _value = dataSource.value.map(item => {
    return {
      name: item.id, value: item.value
    }
  })
  emit('update:value', _value)
  emit('change', _value)
}

watch(() => props.data, () => {
  dataSource.value = props.data.map((item: any) => {
    const oldValue = props.value.find((oldItem: any) => oldItem.name === item.id)
    return oldValue ? { ...item, value: oldValue.value } : item
  })
}, { immediate: true, deep: true })

</script>

<style scoped>

</style>
