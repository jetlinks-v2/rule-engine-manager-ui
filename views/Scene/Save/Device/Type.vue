<template>
  <div class="type">
    <a-form ref="typeForm" :model="formModel" layout="vertical" :colon="false">
      <a-form-item name="operator" :rules="[{ required: true, message: $t('IotSceneLinkage.placeholder.deviceTriggerType') }]" :label="$t('Device.Type.372529-1')">
        <a-select v-model:value="formModel.operator" :options="topOptions" :placeholder="$t('IotSceneLinkage.placeholder.deviceTriggerType')" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="true">
          <template #option="option">
            <div class="scene-editor__device-trigger-option">
              <span><AIcon :type="optionValue(option).icon" /></span>
              <div><b>{{ optionValue(option).label }}</b><a-tooltip :title="optionValue(option).description"><small>{{ optionValue(option).description }}</small></a-tooltip></div>
            </div>
          </template>
        </a-select>
      </a-form-item>

      <ReadProperties
        v-if="showReadProperty"
        v-model:value="formModel.readProperties"
        v-model:action="optionCache.action"
        :properties="readProperties"
      />
      <WriteProperty
        ref="writeRef"
        v-if="showWriteProperty"
        v-model:value="formModel.writeProperties"
        v-model:action="optionCache.action"
        :properties="writeProperties"
      />
      <a-form-item
        v-if="showReportEvent"
        name="eventId"
        :rules="[{ required: true, message: $t('Device.Type.372529-2') }]"
      >
        <ThingModelSelect
          v-model="formModel.eventId"
          :options="eventOptions"
          :placeholder="$t('Device.Type.372529-2')"
          @change="eventSelect"
        />
      </a-form-item>
      <template v-if="showInvokeFunction">
        <InvokeFunction
          ref="invokeRef"
          v-model:functionId="formModel.functionId"
          v-model:functionParameters="formModel.functionParameters"
          v-model:action="optionCache.action"
          :functions="functionOptions"
        />
      </template>
      <template v-if="showTimer">
        <Timer ref="timerRef" v-model:value="formModel.timer" />
      </template>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { Timer } from "../components";
import type { metadataType, TriggerDeviceOptions } from "../../typings";
import type { PropType } from "vue";
import { TypeEnum } from "./util";
import ReadProperties from "./ReadProperties.vue";
import WriteProperty from "./WriteProperty.vue";
import InvokeFunction from "./InvokeFunction.vue";
import { defineExpose } from "vue";
import { cloneDeep, omit } from "lodash-es";
import ThingModelSelect from '../../../SceneLinkage/editor/components/ThingModelSelect.vue'
import { toThingModelOptions } from '../../../SceneLinkage/editor/thingModel'
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
  metadata: {
    type: Object as PropType<metadataType>,
    default: () => ({}),
  },
  operator: {
    type: Object as PropType<Partial<TriggerDeviceOptions>>,
    default: () => ({}),
  },
  options: {
    type: Object,
    default: () => ({})
  }
});
const formModel = reactive({
  operator: undefined as TriggerDeviceOptions['operator'] | undefined,
  timer: {},
  readProperties: [],
  writeProperties: {},
  eventId: undefined,
  functionId: undefined,
  functionParameters: [],
});
Object.assign(formModel, props.operator);
const optionCache = reactive({
  action: props.options?.action || "",
});
// 每次物模型变化都重建选项，避免切换到空物模型后沿用上一台设备的字段。
const readProperties = computed(() => toThingModelOptions(
  (props.metadata?.properties || []).filter(item => item.expands?.type?.includes('read')),
));
const writeProperties = computed(() => toThingModelOptions(
  (props.metadata?.properties || []).filter(item => item.expands?.type?.includes('write')),
));
const eventOptions = computed(() => toThingModelOptions(props.metadata?.events || [], 'event'));
// 功能参数编辑器需要原始 inputs，不能只保留下拉展示字段。
const functionOptions = computed(() => (props.metadata?.functions || []).map(item => ({ ...item, label: item.name, value: item.id })));
const typeForm = ref();
const timerRef = ref();
const writeRef = ref();
const invokeRef = ref();

const topOptions = computed(() => {
  const cloneTypeEnum = cloneDeep(TypeEnum);
  // 沿用原版触发类型及说明，只调整物模型能力的可见性。
  const baseOptions = [
    {
      label: $t('Device.Type.372529-3'),
      value: "online",
      icon: 'LoginOutlined',
      description: $t('IotSceneLinkage.triggerDesc.online'),
    },
    {
      label: $t('Device.Type.372529-4'),
      value: "offline",
      icon: 'LogoutOutlined',
      description: $t('IotSceneLinkage.triggerDesc.offline'),
    },
    Object.assign(cloneTypeEnum.reportEvent, { icon: 'NotificationOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.reportEvent') }),
    Object.assign(cloneTypeEnum.readProperty, { icon: 'ReadOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.readProperty') }),
    Object.assign(cloneTypeEnum.writeProperty, { icon: 'EditOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.writeProperty') }),
    Object.assign(cloneTypeEnum.reportProperty, { icon: 'RiseOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.reportProperty') }),
    Object.assign(cloneTypeEnum.invokeFunction, { icon: 'ControlOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.invokeFunction') }),
  ];

  const available: Record<string, boolean> = {
    reportEvent: eventOptions.value.length > 0,
    readProperty: readProperties.value.length > 0,
    writeProperty: writeProperties.value.length > 0,
    reportProperty: toThingModelOptions((props.metadata?.properties || []).filter(
      item => item.expands?.type?.includes('report') || !item.expands?.type,
    )).length > 0,
    invokeFunction: functionOptions.value.length > 0,
  };
  // 类型只在实际存在可选物模型时展示，上下线触发始终可用。
  return baseOptions.filter(item => !(item.value in available) || available[item.value]).map(item => ({ ...item, disabled: false }));
});

const showReadProperty = computed(() => {
  return formModel.operator === TypeEnum.readProperty.value;
});

const showWriteProperty = computed(() => {
  return formModel.operator === TypeEnum.writeProperty.value;
});

const showReportEvent = computed(() => {
  return formModel.operator === TypeEnum.reportEvent.value;
});

const showInvokeFunction = computed(() => {
  return formModel.operator === TypeEnum.invokeFunction.value;
});

const showTimer = computed(() => {
  return Boolean(formModel.operator && [
    TypeEnum.readProperty.value,
    TypeEnum.writeProperty.value,
    TypeEnum.invokeFunction.value,
  ].includes(formModel.operator));
});

const eventSelect = (eventId: string) => {
  const eventItem = eventOptions.value.find(item => item.value === eventId)
  optionCache.action = $t('Device.Type.372529-5', [eventItem?.label || eventId]);
};

const optionValue = (option: any) => option?.data?.value ? option.data : option

defineExpose({
  preview: computed(() => ({ operation: formModel, action: optionCache.action })),
  vail: async () => {
    const cloneModel = cloneDeep(formModel);

    const filterKey: string[] = [];
    const typeData = await typeForm.value?.validateFields();

    if (!typeData) return false;

    if (!showReadProperty.value) {
      filterKey.push("readProperties");
    }

    if (showInvokeFunction.value) {
      const invokeData = await invokeRef.value?.validateFields();
      if (!invokeData) {
        return false;
      } else {
        cloneModel.functionParameters = invokeData.functionData
      }
    } else {
      filterKey.push("functionId");
      filterKey.push("functionParameters");
    }

    if (showTimer.value) {
      const timerData = await timerRef.value?.validateFields();
      if (!timerData) return false;
    } else {
      filterKey.push("timer");
    }

    if (!showReportEvent.value) {
      filterKey.push("eventId");
    }
    if (showWriteProperty.value) {
      const writeData = await writeRef.value?.validateFields();
      if (!writeData) {
        return false;
      } else {
        cloneModel.writeProperties = writeData.data
      }
    } else {
      filterKey.push("writeProperties");
    }

    return {
      data: omit(cloneModel, filterKey),
      action: optionCache.action,
    };
  },
});
// 切换触发类型只清理依赖字段，不能 resetFields 把刚选中的类型恢复为空。
watch(() => formModel.operator, () => {
  typeForm.value?.clearValidate();
  formModel.timer = {}
  formModel.readProperties = []
  formModel.writeProperties = {}
  formModel.eventId = undefined
  formModel.functionId = undefined
  formModel.functionParameters = []
  optionCache.action = ''
})
</script>

<style scoped lang="less">
.type {
  margin-top: 0;
  .alert {
    height: 40px;
    padding-left: 10px;
    color: rgba(0, 0, 0, 0.55);
    line-height: 40px;
    background-color: #f6f6f6;
  }

  :deep(.ant-select) {
    width: 100%;
  }
}
</style>
