<template>
  <div class='device'>
    <a-form-item
        ref="triggerField"
        :rules='rules'
        :name='["trigger", "collector"]'
        v-if="formData.triggerType==='collector'"
        :label="showTitle ? $t('Device.index.372524-0') : undefined"
    >
      <DetailedTriggerNode v-if="cardLayout" :rule="formData" @edit="visible = true" @remove="emit('remove')" />
      <AddButton v-else
          :style="{ width: '100%' }"
          @click='visible = true'
      >
        <Title :options='formData.options.trigger'/>
      </AddButton>
    </a-form-item>
    <AddModel v-if='visible && formData.triggerType==="collector"' @cancel='cancelConfig' @save='save'
                :value='formData.trigger.collector' :options='formData.options.trigger'/>
    <Terms v-if="showTerms" ref="termsRef"/>
  </div>
</template>

<script setup lang='ts' name='SceneSaveDevice'>
import AddModel from './AddModal.vue'
import AddButton from '../components/AddButton.vue'
import Title from './Title.vue'
import type {TriggerCollector} from '../../typings';
import {EventEmitter, DeviceEmitterKey} from '../util';
import Terms from "../components/Terms";
import {useSceneStore} from "@rule-engine-manager-ui/store/scene";
import {storeToRefs} from "pinia";
import { useI18n } from 'vue-i18n'
import DetailedTriggerNode from '@rule-engine-manager-ui/views/SceneLinkage/editor/detail/DetailedTriggerNode.vue'
import type { Ref } from 'vue'

const sceneStore = useSceneStore()
// 采集器是后续扩展的触发器，原版 Store 类型未包含它；本组件仍沿用原有规则树字段。
const { data: storeData } = storeToRefs(sceneStore)
const formData = storeData as unknown as Ref<Record<string, any>>
const { t: $t } = useI18n()
const visible = ref(false)
const triggerField = ref()
const termsRef = ref()
const emit = defineEmits<{
  (event: 'cancel-config'): void
  (event: 'save-config'): void
  (event: 'remove'): void
}>()

defineProps({
  cardLayout: { type: Boolean, default: false },
  /** 详细模式使用同一棵 Terms 树，但由页面的执行动作区统一承载。 */
  showTerms: {
    type: Boolean,
    default: true,
  },
  /** 详细模式已经提供页面级触发规则标题，不重复展示原版采集器标题。 */
  showTitle: {
    type: Boolean,
    default: true,
  },
})

const rules = [{
  validator(_: any, v: any) {
    if (!v) {
      return Promise.reject(new Error($t('Collector.actions.index-6100078-12')));
    } else if (!v.pointSelectInfo.pointIds.length) {
      return Promise.reject(new Error($t('Collector.actions.index-6100078-13')));
    }
    return Promise.resolve();
  },
}]
const rulesAI = [{
  validator(_: any, v: any) {
    if (!v) {
      return Promise.reject(new Error($t('Collector.actions.index-6100078-12')));
    }
    return Promise.resolve();
  },
}]

const save = (collector: TriggerCollector, options: Record<string, any>) => {
  formData.value.trigger!.collector = collector
  formData.value.options!.trigger = options
  visible.value = false
  EventEmitter.emit(DeviceEmitterKey, collector)
  triggerField.value?.onFieldChange()
  emit('save-config')
}

function cancelConfig() {
  visible.value = false
  emit('cancel-config')
}

defineExpose({
  changePaneIndex: (index: number) => termsRef.value?.changePaneIndex(index),
  /** 详细模式选择采集器触发后直接打开原有配置弹窗。 */
  openConfig: () => { visible.value = true },
})

</script>

<style scoped lang='less'>

</style>
