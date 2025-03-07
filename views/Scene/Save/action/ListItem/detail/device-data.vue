<script setup name="DeviceData">
import {typeIconMap} from "@ruleEngine/views/Scene/Save/action/ListItem/util";
import {useI18n} from "vue-i18n";

const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
})
const {t: $t} = useI18n();

const info = computed(() => {
  return props.data.configuration || {}
})
const icon = computed(() => typeIconMap[props.data?.device?.message?.messageType || 'INVOKE_FUNCTION'])
</script>

<template>
  <div v-if="['fixed', 'context'].includes(info.selector.selector)" style="display: flex; align-items: center">
    <AIcon type="icon-mubiao" style="padding: 0 4px" />
    <span>获取</span>
    <j-ellipsis style="max-width: 200px; margin-right: 12px">
      {{ Array.isArray(data.options?.name) ? data.options?.name?.join(',') : data.options?.name }}
    </j-ellipsis>
    <span>的</span>
  </div>
  <div v-else-if="info.selector.selector === 'tag'">
    <AIcon :type="icon" />
    <span>获取</span>
    {{ data.options?.type }}
    <span>{{ data.options?.tagName }}</span>
    {{ $t('ListItem.Item.637563-13') }}{{ data.options?.productName }}
    {{ data.options?.propertiesName }}
    <span>的</span>
  </div>
  <div v-else-if="info.selector.selector === 'relation'">
    <AIcon :type="icon" />
    <span>获取</span>
    {{ data.options?.type }}{{ $t('ListItem.Item.637563-14') }}<span>{{
      data.options?.triggerName
    }}</span
  >{{ $t('ListItem.Item.637563-15') }} {{ data.options?.relationName }}{{ $t('ListItem.Item.637563-13') }}{{
      data.options?.productName
    }}{{ $t('ListItem.Item.637563-16') }}
    {{ data.options?.propertiesName }}
  </div>
  <span>设备信息</span>
</template>

<style scoped lang="less">

</style>
