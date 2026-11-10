<template>
    <ActionPickerModal
      v-if="!actionType"
      open
      :supported-actions="[]"
      :actions="pickerActions"
      @cancel="onCancel"
      @select="selectAction"
    />
    <ActionTypeComponent
      v-else
      v-bind="props"
      :actionType="actionType"
      :options='actionOptions'
      @save="onPropsOk"
      @cancel="onPropsCancel"
    />
</template>

<script lang="ts" setup name='UpdateActionItemModal'>
import { type PropType, type Ref } from 'vue';
import { ActionsType } from '../../../typings';
import ActionTypeComponent from './ActionTypeComponent.vue';
import { randomNumber, randomString } from '@jetlinks-web/utils';
import ActionPickerModal, { type ActionPickerItem } from '../../../../SceneLinkage/editor/components/ActionPickerModal.vue'

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
        default: () => ({
            key: randomString(),
            actionId: randomNumber(),
        }),
    },
    parallel: {
        type: Boolean,
    },
    actionOptions: {
      type: Object,
      default: () => ({})
    }
});

const emit = defineEmits(['cancel', 'save']);

type ActionOption = {
  value: string
  label?: string
  icon?: string
  subLabel?: string
  description?: string
}

const options = inject<Ref<ActionOption[]>>('action-options', ref([]))

const actionList = computed(() => {
  return options.value.filter(item => !(item.value === 'delay' && props.parallel)).map(item => {
    return {
      ...item,
      disabled: (!['trigger', 'relieve'].includes(item.value) && props.data.executor === 'alarm') || (['trigger', 'relieve'].includes(item.value) && props.data.executor && props.data.executor !== 'alarm')
    }
  })
})
const actionType = ref<string>('');
const actionIcons: Record<string, string> = {
  device: 'ControlOutlined',
  'device-data': 'DatabaseOutlined',
  sceneNotify: 'NotificationOutlined',
  delay: 'ClockCircleOutlined',
  collector: 'DatabaseOutlined',
  'alarm-record-query': 'AlertOutlined',
}
const pickerActions = computed<ActionPickerItem[]>(() => actionList.value.map(item => ({
  value: item.value,
  provider: item.value,
  icon: item.icon || actionIcons[item.value] || 'PlayCircleOutlined',
  label: item.label || item.value,
  description: item.subLabel || item.description,
  disabled: item.disabled,
})))

/** 选择动作类型后立即关闭选择器，由动作本身的配置弹窗接管后续编辑。 */
const selectAction = (type: string) => {
  actionType.value = type
}

const onCancel = () => {
    emit('cancel');
};

const onPropsOk = (data: any, options?: any) => {
    emit('save', { ...data, executor: data.type }, options);
    actionType.value = '';
};

const onPropsCancel = () => {
    emit('cancel');
};

</script>
<style scoped>
</style>
