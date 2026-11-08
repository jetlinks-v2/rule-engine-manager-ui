<template>
  <div class="type">
    <div class="alert">
      <AIcon type="InfoCircleOutlined" />
      <span style="padding-left: 10px">{{ $t('Device.Type.372529-0') }}</span>
    </div>
    <a-form ref="typeForm" :model="formModel" layout="vertical" :colon="false">
      <a-form-item required :label="$t('Device.Type.372529-1')">
        <a-select v-model:value="formModel.operator" :options="topOptions" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="false">
          <template #option="option">
            <div class="scene-editor__device-trigger-option">
              <span><AIcon :type="optionValue(option).icon" /></span>
              <div><b>{{ optionValue(option).label }}</b><small>{{ optionValue(option).description }}</small></div>
            </div>
          </template>
        </a-select>
      </a-form-item>
      <template v-if="showTimer">
        <Timer ref="timerRef" v-model:value="formModel.timer" />
      </template>
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
    type: Object as PropType<TriggerDeviceOptions>,
    default: () => ({}),
  },
  options: {
    type: Object,
    default: () => ({})
  }
});
const formModel = reactive({
  operator: "online",
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
const readProperties = ref<any[]>([]);
const writeProperties = ref<any[]>([]);
const eventOptions = ref<any[]>([]);
const functionOptions = ref<any[]>([]);
const typeForm = ref();
const timerRef = ref();
const writeRef = ref();
const invokeRef = ref();

const topOptions = computed(() => {
  const cloneTypeEnum = cloneDeep(TypeEnum);
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
    { ...cloneTypeEnum.reportEvent, icon: 'NotificationOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.reportEvent') },
    { ...cloneTypeEnum.readProperty, icon: 'ReadOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.readProperty') },
    { ...cloneTypeEnum.writeProperty, icon: 'EditOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.writeProperty') },
    { ...cloneTypeEnum.reportProperty, icon: 'RiseOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.reportProperty') },
    { ...cloneTypeEnum.invokeFunction, icon: 'ControlOutlined', description: $t('IotSceneLinkage.detail.deviceTriggerDesc.invokeFunction') },
  ];

  if (!props.metadata) return baseOptions;

  if (props.metadata.events?.length) {
    // baseOptions.push(TypeEnum.reportEvent)
    cloneTypeEnum.reportEvent.disabled = false;
    eventOptions.value = toThingModelOptions(props.metadata.events, 'event');
  }

  if (props.metadata.properties?.length) {
    const _properties = props.metadata.properties;
    readProperties.value = toThingModelOptions(
      _properties.filter((item: any) => item.expands?.type?.includes("read")),
    );
    writeProperties.value = toThingModelOptions(
      _properties.filter((item: any) => item.expands?.type?.includes("write")),
    );
    // 兼容上传的设备物模型没有type时，type值默认为上报
    const reportProperties = _properties
      .filter(
        (item: any) =>
          item.expands?.type?.includes("report") || !item.expands?.type
      )
      .map((item) => ({
        ...item,
        label: item.name,
        value: item.id,
      }));

    if (readProperties.value.length) {
      // baseOptions.push(TypeEnum.readProperty)
      cloneTypeEnum.readProperty.disabled = false;
    }

    if (writeProperties.value.length) {
      // baseOptions.push(TypeEnum.writeProperty)
      cloneTypeEnum.writeProperty.disabled = false;
    }

    if (reportProperties.length) {
      // baseOptions.push(TypeEnum.reportProperty)
      cloneTypeEnum.reportProperty.disabled = false;
    }
  }

  if (props.metadata.functions?.length) {
    cloneTypeEnum.invokeFunction.disabled = false;
    // baseOptions.push(TypeEnum.invokeFunction)
    // 功能调用需要保留 inputs 等原始结构供参数编辑器使用，不能只投影为下拉展示项。
    functionOptions.value = props.metadata.functions.map((item) => ({
      ...item,
      label: item.name,
      value: item.id,
    }));
  }

  return baseOptions;
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
  return [
    TypeEnum.readProperty.value,
    TypeEnum.writeProperty.value,
    TypeEnum.invokeFunction.value,
  ].includes(formModel.operator);
});

const eventSelect = (eventId: string) => {
  const eventItem = eventOptions.value.find(item => item.value === eventId)
  optionCache.action = $t('Device.Type.372529-5', [eventItem?.label || eventId]);
};

const optionValue = (option: any) => option?.data?.value ? option.data : option

defineExpose({
  vail: () => {
    return new Promise(async (resolve, reject) => {
      const cloneModel = cloneDeep(formModel);

      const filterKey: string[] = [];
      const typeData = await typeForm.value?.validateFields();

      if (!typeData) return resolve(false);

      if (!showReadProperty.value) {
        filterKey.push("readProperties");
      }

      if (showInvokeFunction.value) {
        const invokeData = await invokeRef.value?.validateFields();
        if (!invokeData) {
          return resolve(false);
        } else {
          cloneModel.functionParameters = invokeData.functionData
        }
      } else {
        filterKey.push("functionId");
        filterKey.push("functionParameters");
      }

      if (showTimer.value) {
        const timerData = await timerRef.value?.validateFields();
        if (!timerData) return resolve(false);
      } else {
        filterKey.push("timer");
      }

      if (!showReportEvent.value) {
        filterKey.push("eventId");
      }
      if (showWriteProperty.value) {
        const writeData = await writeRef.value?.validateFields();
        if (!writeData) {
          return resolve(false);
        } else {
          cloneModel.writeProperties = writeData.data
        }
      } else {
        filterKey.push("writeProperties");
      }

      resolve({
        data: omit(cloneModel, filterKey),
        action: optionCache.action,
      });
    });
  },
});
watch(() => formModel.operator, (newVal, oldVal) => {
  typeForm.value?.resetFields();
  if(newVal === 'readProperty') {
    formModel.writeProperties = {}
  } else if(newVal === 'writeProperty') {
    formModel.readProperties = []
  }
})
</script>

<style scoped lang="less">
.type {
  margin-top: 24px;
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
