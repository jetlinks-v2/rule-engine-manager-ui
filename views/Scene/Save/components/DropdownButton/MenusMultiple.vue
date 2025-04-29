<template>
  <a-menu multiple class='scene-dropdown-menus' @select='select' @deselect="unselect" v-model:selectedKeys='myValue'>
    <a-menu-item v-for='item in myOptions' :key='item[valueName]' :value='item.value' :title='item.label'>
      <div>
        <j-ellipsis>
          {{ item.label }}
        </j-ellipsis>
      </div>
    </a-menu-item>
  </a-menu>
</template>

<script lang='ts' setup name='DropdownMenus'>
import { cloneDeep, isArray, isBoolean, isUndefined } from 'lodash-es'

type ValueType = string| number | boolean
type Emits = {
  (e: 'update:value', value: ValueType): void
  (e: 'change', data: any): void
}

const props = defineProps({
  value: {
    type: Array,
    default: () => []
  },
  options: {
    type: Array,
    default: () => []
  },
  valueName: {
    type: String,
    default: 'value'
  },
  fieldNames: {
    type: Object,
    default: () => ({
      label: 'label',
      value: 'value'
    })
  }
})

const emit = defineEmits<Emits>()

const myOptions = computed(() => {
  return props.options.map((item: any) => {
    let _label = item.label || item.name
    let _value = isUndefined(item.value) ? item.id : item.value
    if (isArray(_value)) {
      _value = JSON.stringify(_value)
    }
    return {
      ...item,
      label: _label,
      value: _value
    }
  })
})

const myValue = ref<any[]>(props.value)

const select = (value: any, option: any) => {
  emit('change', props.options?.filter(item => myValue.value.includes(item[props.fieldNames.value])))
}

const unselect = (value: any, option: any) => {
  emit('change', props.options?.filter(item => myValue.value.includes(item[props.fieldNames.value])))
}

watch(() => props.value, () => {
  myValue.value = cloneDeep(Array.isArray(props.value)? props.value : [props.value]);
}, { immediate: true})
</script>

<style scoped lang='less'>
.scene-dropdown-menus {
  border: 0px;

  :deep(.ant-menu-item){
    height: 32px;
    line-height: 32px;
    padding: 0 4px;
    margin: 0;

    &:hover {
      background-color: @item-hover-bg;
      color: @text-color;
    }

    &.ant-menu-item-selected {
      background-color: @primary-1;
      color: @text-color;
    }
  }
}
</style>
