<template>
  <template v-if="removable.length || inherited.length">
    <a-menu-divider />
    <a-menu-item v-for="link in removable" :key="'unlink:'+link.id" danger :disabled="busy" @click="confirmRemove(link)"><AIcon type="DisconnectOutlined" /> {{ removable.length>1 ? t('removeNamed',{name:outputName(link)}) : t('remove') }}</a-menu-item>
    <a-menu-item v-for="link in inherited" :key="'location:'+link.id" @click="openLocation(link)"><AIcon type="LinkOutlined" /> {{ t('openLocation') }}</a-menu-item>
  </template>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {Modal} from 'ant-design-vue'
import {useI18n} from 'vue-i18n'
import {bindingLocation} from './useMetricBindingResults'
import {bindingMessages} from './messages'
import {metricOutputName} from '../presentation'
import type {MetricContext,MetricObjectBindingView,MetricTemplate,MetricWorkspaceSelection} from '../types'
const props=defineProps<{links:MetricObjectBindingView[];context:MetricContext;template?:MetricTemplate;busy?:boolean}>()
const emit=defineEmits<{(event:'remove',id:string):void;(event:'manageLocation',value:MetricWorkspaceSelection):void}>()
const {t}=useI18n({useScope:'local',messages:bindingMessages})
const local=(link:MetricObjectBindingView)=>{const location=bindingLocation(link);return location?.type===props.context.ownerType && location.id===props.context.ownerId}
const removable=computed(()=>props.context.editable ? props.links.filter(local) : [])
const inherited=computed(()=>props.links.filter(link=>bindingLocation(link) && !local(link)))
function outputName(link:MetricObjectBindingView){const output=props.template?.outputs.find(output=>output.metricId===link.reference?.outputId);return output ? metricOutputName(output,props.template) : link.configName || t('title')}
function confirmRemove(link:MetricObjectBindingView){Modal.confirm({title:t('removeConfirm'),okText:t('remove'),cancelText:t('cancel'),onOk:()=>emit('remove',link.id)})}
function openLocation(link:MetricObjectBindingView){const location=bindingLocation(link);if(location)emit('manageLocation',{ownerType:location.type,ownerId:location.id})}
</script>
