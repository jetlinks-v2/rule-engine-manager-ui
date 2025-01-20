<template>
  <div class='device'>
    <a-form-item
        :rules='rules'
        :name='["trigger", "collector"]'
        v-if="formData.triggerType==='collector'"
        label="触发规则"
    >
      <AddButton
          style='width: 100%'
          @click='visible = true'
      >
        <Title :options='formData.options.trigger'/>
      </AddButton>
      <AddModel v-if='visible && formData.triggerType==="collector"' @cancel='visible = false' @save='save'
                :value='formData.trigger.collector' :options='formData.options.trigger'/>
      <CheckItem/>
    </a-form-item>
    <Terms ref="termsRef"/>
  </div>
</template>

<script setup lang='ts' name='SceneSaveDevice'>
import AddModel from './AddModal.vue'
import AddButton from '../components/AddButton.vue'
import Title from './Title.vue'
import type {TriggerCollector} from '../../typings';
import {EventEmitter, DeviceEmitterKey} from '../util';
import CheckItem from '../Device/CheckItem.vue'
import Terms from "../components/Terms";
import {useSceneStore} from "@ruleEngine/store/scene";
import {storeToRefs} from "pinia";

const sceneStore = useSceneStore()
const { data: formData } = storeToRefs(sceneStore)

const visible = ref(false)
const termsRef = ref()

const rules = [{
  validator(_: any, v: any) {
    if (!v) {
      return Promise.reject(new Error('请配置采集器触发规则'));
    } else {
      if (
          !v.pointSelectInfo.collectorId ||
          (v.operation?.operator === 'readProperty' && !v.operation!.readProperties.length) ||
          (v.operation?.operator === 'writeProperty' && !Object.keys(v.operation!.writeProperties).length) ||
          (v.operation?.operator === 'invokeFunction' && !v.operation.functionId) ||
          (v.operation?.operator === 'reportEvent' && !v.operation.eventId)
      ) {
        return Promise.reject(new Error('该数据已发生变更，请重新配置'));
      }
      //  判断产品
      //  判断设备或者组织
      //  判断属性、事件、功能
    }
    return Promise.resolve();
  },
}]
const rulesAI = [{
  validator(_: any, v: any) {
    if (!v) {
      return Promise.reject(new Error('请配置采集器触发规则'));
    }
    return Promise.resolve();
  },
}]

const save = (collector: TriggerCollector, options: Record<string, any>) => {
  formData.value.trigger!.collector = collector
  formData.value.options!.trigger = options
  visible.value = false
  EventEmitter.emit(DeviceEmitterKey, collector)
}

defineExpose({
  changePaneIndex: (index: number) => termsRef.value?.changePaneIndex(index)
})

</script>

<style scoped lang='less'>

</style>
