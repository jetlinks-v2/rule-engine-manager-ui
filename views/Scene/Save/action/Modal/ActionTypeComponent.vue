<template>
  <div>
      <Device
        v-if="actionType === 'device'"
        v-bind="props"
        :value="data?.device"
        :options="options"
        @cancel="onCancel"
        @save="onPropsOk"
      />
    <DeviceData
        v-else-if="actionType === 'device-data'"
        v-bind="props"
        :value="actionConfiguration"
        :options="options"
        @cancel="onCancel"
        @save="onPropsOk"
      />
    <Notify
      v-else-if="actionType === 'notify'"
      :options="data?.options"
      :value="data?.notify"
      :name="name"
      :thenName="thenName"
      :branchesName="branchesName"
      @cancel="onCancel"
      @save="onPropsOk"
    />
    <SceneNotify
      v-else-if="actionType === 'sceneNotify'"
      :value="actionConfiguration"
      @cancel="onCancel"
      @save="onPropsOk"
    />
    <AlarmRecordQuery
      v-else-if="actionType === 'alarm-record-query'"
      :value="actionConfiguration"
      :options="options"
      @cancel="onCancel"
      @save="onPropsOk"
    />
    <Delay
      v-else-if="actionType === 'delay'"
      :value="data?.delay"
      @cancel="onCancel"
      @save="onPropsOk"
    />
    <Collector
      v-else-if="actionType === 'collector'"
      v-bind="props"
      :options="data?.options"
      :value="data?.collector"
      @cancel="onCancel"
      @save="onPropsOk"
    />
    <LegacyActionSummary
      v-else
      :data="data"
      :options="options"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, PropType } from "vue";
import { ActionsType } from "../../../typings";
import Delay from "../Delay/index.vue";
import Notify from "../Notify/index.vue";
import Device from "../Device/index.vue";
import Collector from "../Collector/index.vue";
import DeviceData from '../DeviceData/index.vue'
import SceneNotify from '../SceneNotify/index.vue'
import AlarmRecordQuery from '../AlarmRecordQuery/index.vue'
import LegacyActionSummary from '../LegacyActionSummary.vue'
import { randomNumber } from "@jetlinks-web/utils";

const props = defineProps({
  branchesName: {
    type: Number,
    default: 0,
  },
  thenName: {
    type: Number,
    default: 0,
  },
  name: {
    type: Number,
    default: 0,
  },
  data: {
    type: Object as PropType<ActionsType>,
  },
  parallel: {
    type: Boolean,
  },
  actionType: {
    type: String,
    default: "",
  },
  options: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["cancel", "save"]);
// 原版 ActionsType 未声明 SaaS Provider 的 configuration；详细模式仅透传该已持久化字段。
const actionConfiguration = computed(() => (props.data as any)?.configuration)

const onCancel = () => {
  emit("cancel");
};

const onPropsOk = (data: any, options: any) => {

  const key = ['device-data', 'sceneNotify', 'alarm-record-query'].includes(props.actionType) ? 'configuration' : props.actionType

  const _data = {
    type: props.actionType,
    executor: props.actionType,
    key: props?.data?.key || `${props.actionType}_${new Date().getTime()}`,
    actionId: props?.data?.actionId || randomNumber(),
    [key]: {
      ...data,
    },
  };
  emit("save", { ..._data }, options);
};
</script>
