<template>
  <a-form :model="formValues" layout="horizontal" label-align="left" :label-col="{flex:'112px'}" :wrapper-col="{flex:1}" label-wrap :colon="false" :required-mark="false">
    <a-form-item name="productId" :label="t('RuleTemplates.product')" required>
      <ResourceSelect :resources="state.products" :value="state.productId.value" :label="t('RuleTemplates.product')" :placeholder="t('RuleTemplates.productPlaceholder')" @change="state.productId.value=String($event)" />
    </a-form-item>
    <template v-if="state.productId.value">
    <a-form-item v-if="id!=='scheduled-read'" name="scope" :label="t('RuleTemplates.scope')" required>
      <a-radio-group v-model:value="state.scope.value" option-type="button" :options="scopeOptions" :aria-label="t('RuleTemplates.scope')" />
    </a-form-item>
    <a-form-item v-if="state.scope.value==='devices'" name="deviceIds" :label="t(id==='scheduled-read' ? 'RuleTemplates.singleDevice' : 'RuleTemplates.devices')" required>
      <ResourceSelect :resources="state.devices" :value="id==='scheduled-read' ? state.deviceIds.value[0] : state.deviceIds.value" :multiple="id!=='scheduled-read'"
        :label="t('RuleTemplates.devices')" :placeholder="t('RuleTemplates.devicePlaceholder')" :disabled="!state.productId.value" @change="state.deviceIds.value=Array.isArray($event) ? $event : [$event]" />
    </a-form-item>
    <a-form-item v-if="id==='device-forward'" name="message" :label="t('RuleTemplates.message')" required>
      <a-radio-group v-model:value="state.message.value" option-type="button" :options="messageOptions" :aria-label="t('RuleTemplates.message')" />
    </a-form-item>
    <a-form-item v-if="id==='device-forward'" name="format" :label="t('RuleTemplates.format')" required>
      <a-select v-model:value="state.format.value" :aria-label="t('RuleTemplates.format')" :options="formats" />
    </a-form-item>
    <a-alert v-if="state.error.value" type="warning" show-icon :message="t('RuleTemplates.resourceFailed')">
      <template #action><a-button type="link" @click="state.loadModel()">{{t('RuleTemplates.retry')}}</a-button></template>
    </a-alert>
    <a-spin :spinning="state.loading.value">
      <a-form-item v-if="showProperties" name="propertyIds" :label="t('RuleTemplates.properties')" required>
        <ThingModelSelect :model-value="id==='threshold-notify' ? state.propertyIds.value[0] : state.propertyIds.value" :multiple="id!=='threshold-notify'" :options="propertyOptions"
          :placeholder="t('RuleTemplates.propertyPlaceholder')" :disabled="!state.productId.value || state.loading.value || state.error.value" @update:modelValue="state.propertyIds.value=Array.isArray($event) ? $event : $event ? [$event] : []" />
      </a-form-item>
      <template v-if="state.message.value==='event'">
        <a-form-item name="eventId" :label="t('RuleTemplates.event')" required><ThingModelSelect v-model="state.eventId.value" :options="eventOptions" :placeholder="t('RuleTemplates.eventPlaceholder')" :disabled="state.loading.value || state.error.value" /></a-form-item>
        <a-form-item v-if="state.format.value!=='message' && state.eventId.value" name="eventFieldIds" :label="t('RuleTemplates.eventFields')"><ThingModelSelect v-model="state.eventFieldIds.value" multiple :options="eventFieldOptions" /></a-form-item>
      </template>
    </a-spin>
    <a-form-item v-if="showProperties && state.format.value==='records'"><a-checkbox v-model:checked="state.includeMetadata.value">{{t('RuleTemplates.includeMetadata')}}</a-checkbox></a-form-item>
    </template>
  </a-form>
</template>
<script setup lang="ts">
import {computed,reactive} from 'vue'
import {useI18n} from 'vue-i18n'
import ThingModelSelect from '../../SceneLinkage/editor/components/ThingModelSelect.vue'
import {toThingModelOptions} from '../../SceneLinkage/editor/thingModel'
import ResourceSelect from './ResourceSelect.vue'
import type {useTemplateSource} from './useTemplateSource'
import type {TemplateId} from './types'
const props=defineProps<{state:ReturnType<typeof useTemplateSource>;id:TemplateId}>()
const {t}=useI18n()
const formValues=reactive(props.state)
const scopeOptions=computed(()=>[{value:'product',label:t('RuleTemplates.allDevices')},{value:'devices',label:t('RuleTemplates.selectedDevices')}])
const messageOptions=computed(()=>[{value:'property',label:t('RuleTemplates.propertyMessage')},{value:'event',label:t('RuleTemplates.eventMessage')}])
const showProperties=computed(()=>props.state.message.value==='property' && (props.id!=='device-forward' || props.state.format.value!=='message'))
const propertyOptions=computed(()=>toThingModelOptions(props.state.properties.value,'property',true))
const eventOptions=computed(()=>toThingModelOptions(props.state.events.value,'event',true))
const eventFieldOptions=computed(()=>toThingModelOptions(props.state.eventFields.value,'property',true))
const formats=computed(()=>['message','fields',...(props.state.message.value==='property' ? ['records'] : [])].map(value=>({value,label:t(`RuleTemplates.${value}Format`)})))
</script>
