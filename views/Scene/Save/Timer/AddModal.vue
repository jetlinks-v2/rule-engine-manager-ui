<template>
  <a-modal
    :title="$t('Timer.AddModal.663671-0')"
    visible
    :width="820"
    :maskClosable="false"
    :keyboard="false"
    @ok="save"
    @cancel="cancel"
  >
    <Timer ref="timerRef" v-model:value="addModel.timer" type="timer" />
  </a-modal>
</template>

<script setup lang="ts" name="timerAddModel">
import Timer from "../components/Timer";
import type { OperationTimer } from "../../typings";
import { PropType } from "vue";
import { handleTimerOptions } from "../components/Timer/util";
import { cloneDeep } from "lodash-es";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
type Emit = {
  (e: "cancel"): void;
  (e: "save", data: OperationTimer, options: Record<string, any>): void;
};

const props = defineProps({
  value: {
    type: Object as PropType<OperationTimer>,
    default: () => ({}),
  },
});
const emit = defineEmits<Emit>();

const timerRef = ref();

interface AddModelType {
  timer: OperationTimer;
}

const addModel = reactive<AddModelType>({
  timer: cloneDeep(props.value),
});

const save = async () => {
  const timerData = await timerRef.value?.validateFields();
  if (timerData) {
    const options = handleTimerOptions(addModel.timer);
    emit("save", addModel.timer, options);
  }
};

const cancel = () => {
  emit("cancel");
};

// watchEffect(() => {
//   addModel.timer = props.value
// })
</script>

<style scoped></style>
