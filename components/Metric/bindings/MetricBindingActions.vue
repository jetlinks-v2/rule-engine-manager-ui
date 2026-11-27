<template>
  <a-sub-menu v-if="links.length" key="bindings">
    <template #title><AIcon type="LinkOutlined" /> {{ t('linkedSources') }}</template>
    <a-menu-item v-for="link in links" :key="link.id" :disabled="busy || local(link) && !context.editable" @click="act(link)">
      <AIcon :type="local(link) ? 'DisconnectOutlined' : 'ExportOutlined'" />
      {{ local(link) ? t('removeNamed',{name:outputName(link)}) : t('openLocation') }}
    </a-menu-item>
  </a-sub-menu>
</template>
<script setup lang="ts">
import {Modal} from 'ant-design-vue'
import {useI18n} from 'vue-i18n'
import {bindingMessages} from './messages'
import {bindingLocation} from './useMetricBindingResults'
import {metricOutputName} from '../presentation'
import type {MetricContext,MetricObjectBindingView,MetricTemplate,MetricWorkspaceSelection} from '../types'
const props=defineProps<{links:MetricObjectBindingView[];context:MetricContext;template?:MetricTemplate;busy?:boolean}>()
const emit=defineEmits<{(event:'remove',id:string):void;(event:'manageLocation',value:MetricWorkspaceSelection):void}>()
const {t}=useI18n({useScope:'local',messages:bindingMessages})
const local=(link:MetricObjectBindingView)=>{const at=bindingLocation(link);return at?.type===props.context.ownerType && at.id===props.context.ownerId}
function outputName(link:MetricObjectBindingView){const output=props.template?.outputs.find(item=>item.metricId===link.reference?.outputId);return output && metricOutputName(output,props.template) || link.configName || t('title')}
function act(link:MetricObjectBindingView){
  if(local(link)){
    if(props.context.editable)Modal.confirm({title:t('removeConfirm'),onOk:()=>emit('remove',link.id)})
  }else{
    const at=bindingLocation(link)
    if(at)emit('manageLocation',{ownerType:at.type,ownerId:at.id})
  }
}
</script>
