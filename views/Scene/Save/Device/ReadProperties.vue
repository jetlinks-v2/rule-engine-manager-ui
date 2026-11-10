<template>
  <a-row :gutter='[24]'>
    <a-col :span='10'>
      <a-form-item
        name='readProperties'
        :rules="[{ required: true, message: $t('Device.ReadProperties.372521-0') }]"
      >
        <ThingModelSelect
          multiple
          :placeholder="$t('Device.ReadProperties.372521-0')"
          v-model='readProperties'
          :options='properties'
          @change='change'
        />
      </a-form-item>
    </a-col>
    <a-col :span='14'>
      <a-form-item>{{ $t('Device.ReadProperties.372521-1') }}</a-form-item>
    </a-col>
  </a-row>
</template>

<script setup lang='ts' name='ReadProperties'>
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import ThingModelSelect from '../../../SceneLinkage/editor/components/ThingModelSelect.vue'

const { t: $t } = useI18n()
type Emit = {
  (e: 'update:value', data: Array<string>): void
  (e: 'update:action', data: string): void
}

const props = defineProps({
  value: {
    type: Array as PropType<Array<string>>,
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

const readProperties = ref<string[]>(props.value)

const change = (values: string[]) => {
  const optionItems = props.properties.filter((item: any) => values.includes(item.value))
  const names = optionItems.map((item: any) => item.label || item.name);
  let extraStr = '';
  let isLimit = false;
  let indexOf = 0;
  extraStr = names.reduce((_prev, next, index) => {
    if (_prev.length <= 30) {
      indexOf = index;
      return index === 0 ? next : _prev + '、' + next;
    } else {
      isLimit = true;
    }
    return _prev;
  }, '');

  if (isLimit && names.length - 1 > indexOf) {
    extraStr += $t('Device.ReadProperties.372521-2', [optionItems.length]);
  }
  emit('update:value', values)
  emit('update:action', $t('Device.ReadProperties.372521-3', [extraStr]))
}

</script>

<style scoped>

</style>
