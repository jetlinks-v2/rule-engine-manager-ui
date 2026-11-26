<template>
  <div class="actions-item-warp">
    <a-form-item
      :name="['branches', branchesName, 'then', thenName, 'actions', name]"
      :rules="rules"
    >
      <div :class="['actions-item', { 'actions-item--show-controls': showActionControls }]">
        <CheckItem v-bind="props" ref="checkItemRef">
          <DetailedActionNode v-if="showActionControls" :action="data || {}" :options="options" :index="name" :read-only="isReadOnly" @edit="data?.executor ? onType(data.executor) : onAdd()" @remove="onDelete" @visible-change="changeTriggerVisible" />
          <template v-else>
          <div class="item-options-warp">
            <span class="item-number">{{ name + 1 }}</span>
            <div class="item-options-type" @click="onAdd">
              <AIcon
                :type="
                  iconMap.get(
                    data?.executor === 'alarm' ? data.alarm.mode : data.executor
                  )
                "
              />
            </div>
          <div class="item-options-content" v-if="data?.executor" @click="onType(data?.executor)">
              <template v-if="data.executor === 'delay'">
                {{ options?.name }}
              </template>
              <template v-else>
              <component :is="ComponentsMap[data.executor]" :data="data" :options="options" :read-only="isReadOnly" @visibleChange="changeTriggerVisible"  />
              </template>
            </div>
            <a-button v-else @click="onAdd">{{ $t('ListItem.Item.637563-17') }}</a-button>
          </div>
          <ConfirmModal
            v-if="!isReadOnly"
            :title="$t('ListItem.Item.637563-18')"
            :onConfirm="onDelete"
            :className="showActionControls ? 'actions-item-delete actions-item-delete--show' : 'actions-item-delete'"
          >
            <AIcon type="DeleteOutlined" />
          </ConfirmModal>
          <a-tooltip v-if="showActionControls && !isReadOnly" :title="$t('IotSceneLinkage.action.edit')">
            <a-button class="actions-item__edit" type="text" @click.stop="onType(data?.executor || '')"><AIcon type="EditOutlined" /></a-button>
          </a-tooltip>
          </template>
        </CheckItem>
      </div>
    </a-form-item>
    <template v-if="!isReadOnly && !isLast && type === 'serial'">
      <div
        :class="[
          'actions-item-filter-warp',
          termsOptions.length ? 'filter-border' : '',
        ]"
      >
        <template v-if="termsOptions.length">
          <div class="actions-item-filter-warp-tip">
            {{ $t('ListItem.Item.637563-19') }}
          </div>
          <div class="actions-item-filter-overflow">
            <FilterGroup
              v-for="(item, index) in termsOptions"
              :key="item.key"
              :branchName="branchesName"
              :thenName="thenName"
              :actionName="name"
              :name="index"
              :isLast="index === termsOptions.length - 1"
              :isFirst="index === 0"
            />
          </div>
        </template>
        <SceneFilterAddButton v-else-if="showActionControls" @add="addFilterParams" />
        <div v-else class="filter-add-button" @click="addFilterParams">
          <AIcon type="PlusOutlined" style="padding-right: 4px" />
          <span>{{ $t('ListItem.Item.637563-20') }}</span>
        </div>
      </div>
    </template>

    <template v-if="visible">
      <EditModal
        :name="name"
        :branchGroup="thenName"
        :thenName="thenName"
        :branchesName="branchesName"
        :data="data"
        :options="
          _data.branches[branchesName].then[thenName].actions[name].options
        "
        @cancel="onClose"
        @save="onSave"
      />
    </template>
    <!-- 编辑 -->
    <ActionTypeComponent
      v-bind="props"
      v-if="!!actionType"
      :name="name"
      :branchGroup="thenName"
      :branchesName="branchesName"
      :thenName="thenName"
      :actionType="actionType"
      :options="
          _data.branches[branchesName].then[thenName].actions[name].options
        "
      @save="onPropsOk"
      @cancel="onPropsCancel"
    />
    <TriggerAlarm
      :id="_data.id"
      :branchId="_data.branches[branchesName].branchId"
      :actionId="
        _data.branches[branchesName].then[thenName].actions[name].actionId
      "
      :targetType="_data.triggerType"
      v-if="triggerVisible"
      @close="triggerVisible = false"
    />
  </div>
</template>

<script lang="ts" setup>
import { type Ref, PropType } from "vue";
import { ActionsType, ParallelType } from "../../../typings";
import EditModal from "../Modal/index.vue";
import ActionTypeComponent from "../Modal/ActionTypeComponent.vue";
import TriggerAlarm from "../TriggerAlarm/index.vue";
import { useSceneStore } from "@rule-engine-manager-ui/store/scene";
import { storeToRefs } from "pinia";
import { iconMap} from "./util";
import FilterGroup from "./FilterGroup.vue";
import SceneFilterAddButton from "../../components/SceneFilterAddButton.vue";
import { randomString } from "@jetlinks-web/utils";
import { EventEmitter, EventEmitterKeys, EventSubscribeKeys } from "../../util";
import CheckItem from "./CheckItem.vue";
import DetailedActionNode from "./DetailedActionNode.vue";
import { useI18n } from 'vue-i18n'
import ComponentsMap from './detail'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'

defineOptions({ name: 'ActionItem' })

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data: _data } = storeToRefs(sceneStore);

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
  branchesGroup: {
    type: Number,
    default: 0
  },
  data: {
    type: Object as PropType<ActionsType>,
  },
  type: {
    type: String,
  },
  parallel: {
    type: Boolean,
  },
  options: {
    type: Object,
  },
  isLast: {
    type: Boolean,
  },
  showActionControls: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["delete", "update"]);
const readOnlyActionProviders = inject<Ref<string[]>>('readonly-action-providers', ref([]));
const isReadOnly = computed(() => readOnlyActionProviders.value.includes(props.data?.executor || ''));
const checkItemRef = ref();
const visible = ref<boolean>(false);
const triggerVisible = ref<boolean>(false);
const actionType = ref("");
const eventEmitterKey = ref(
  EventEmitterKeys({
    branch: props.branchesName,
    branchGroup: props.thenName,
    action: props.name,
  })
);

const triggerData = reactive({
  visible: false,
  actionId: undefined,
});

const termsOptions = computed(() => {
  if (!props.parallel) {
    // 串行
    return (
      _data.value.branches![props.branchesName].then?.[props.thenName]
        .actions?.[props.name].terms || []
    );
  }
  return [];
});

const onDelete = () => {
  const key =
    _data.value.branches![props.branchesName].then[props.thenName].actions[
      props.name
    ].key;
  EventEmitter.emit(key!, { isDelete: true }); // 发布消息
  if (props.name !== 0 && !props.parallel) {
    // 原生规则可能没有展示元数据，不能因清理 options 而中断动作删除。
    const previous = _data.value.branches![props.branchesName].then[props.thenName].actions[props.name - 1];
    if (previous.options) {
      previous.options.termsColumns = [];
      previous.options.terms = [];
    }
    previous.terms = [];
  }

  emit("delete");
};

const onClose = () => {
  visible.value = false;
};

/**
 * 添加过滤条件
 */
const addFilterParams = () => {
  const item: any = {
    type: "and",
    key: randomString(),
    terms: [
      {
        column: undefined,
        value: {
          type: "fixed",
          value: undefined,
        },
        termType: undefined,
        type: "and",
        key: randomString(),
      },
    ],
  };
  if (
    _data.value.branches![props.branchesName].then[props.thenName].actions[
      props.name
    ].terms
  ) {
    _data.value.branches![props.branchesName].then[props.thenName].actions[
      props.name
    ].terms!.push(item);
  } else {
    _data.value.branches![props.branchesName].then[props.thenName].actions[
      props.name
    ].terms = [item];
  }
  _data.value.branches![props.branchesName].then[props.thenName].actions[
    props.name
  ].options!.terms = [
    {
      terms: [["", "eq", "", "and"]],
      termType: $t('ListItem.Item.637563-21'),
    },
  ];
};

const onAdd = () => {
  if (isReadOnly.value) {
    onlyMessage($t('IotSceneLinkage.message.legacyConfigurationUnsupported'), 'warning');
    return;
  }
  visible.value = true;
};

const onType = (_type: string) => {
  if (isReadOnly.value) {
    onlyMessage($t('IotSceneLinkage.message.legacyConfigurationUnsupported'), 'warning');
    return;
  }
  if (_type === 'notify') {
    onlyMessage($t('IotSceneLinkage.message.legacyNotifyReadonly'), 'warning')
    return
  }
  actionType.value = _type;
};

/** 历史告警动作可查看摘要，但不能打开原版的告警绑定维护弹窗。 */
const changeTriggerVisible = (visible: boolean) => {
  if (isReadOnly.value) {
    onlyMessage($t('IotSceneLinkage.message.legacyConfigurationUnsupported'), 'warning');
    return;
  }
  triggerVisible.value = visible;
};

/**
 * 添加执行动作
 * @param data
 * @param options
 */
const onSave = (data: ActionsType, options: any) => {
  const { key, actionId, terms } =
    _data.value.branches![props.branchesName].then?.[props.thenName].actions?.[
      props.name
    ];

  const columns = new Set([
    ...(props.options?.termsColumns || []),
    ...(options?.otherColumns?.filter?.((item?: string) => item) || []),
  ]);

  const actionItem: ActionsType = {
    ...data,
    options: {
      ...props.options,
      ...options,
      columns: [...columns.values()],
    },
    key,
    actionId,
    terms,
  };

  _data.value.branches![props.branchesName].then[props.thenName].actions.splice(
    props.name,
    1,
    actionItem
  );
  checkItemRef.value?.formTouchOff?.();
  visible.value = false;
  EventEmitter.emit(key!, data); // 发布消息
  const onKeys =  EventSubscribeKeys({
    branch: props.branchesName,
    branchGroup: props.thenName,
    action: props.name,
  })
  EventEmitter.emit(onKeys, data);
};

/**
 * 直接编辑执行栋数据
 * @param data
 * @param options
 */
const onPropsOk = (data: ActionsType, options?: any) => {
  onSave(data, options);
  actionType.value = "";
};

const onPropsCancel = () => {
  actionType.value = "";
};

const rules = [
  {
    validator(_: any, v?: ActionsType) {
      if (v?.executor === "device") {
        const _device = v.device!;
        if (
          (_device?.selector === "fixed" &&
            (!_device?.productId || !_device?.selectorValues?.length)) ||
          (_device?.selector === "context" && !_device?.upperKey) ||
          (_device?.selector === "relation" &&
            !_device?.selectorValues?.length) ||
          _device?.changeData === true
        ) {
          return Promise.reject(new Error($t('ListItem.Item.637563-22')));
        }
      } else if (v?.executor === "notify") {
        const _notify = v.notify;
        if (
          !_notify?.notifierId ||
          !_notify?.templateId ||
          _notify?.changeData === true
        ) {
          return Promise.reject(new Error($t('ListItem.Item.637563-22')));
        }
      }
      return Promise.resolve();
    },
  },
];
</script>

<style lang="less" scoped>
.actions-item {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 60px;
  padding: 12px 16px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--radius-jet-sm, 8px);
  transition: border-color .2s ease, box-shadow .2s ease;

  &:hover {
    border-color: var(--ant-color-primary);
    box-shadow: 0 3px 10px rgba(0, 0, 0, .04);
  }

  .item-options-warp {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    gap: var(--space-3, 12px);
    padding-right: 28px;

    .item-options-type {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 32px;
      height: 32px;
      color: var(--ant-color-primary);
      background-color: var(--ant-color-primary-bg);
      border-radius: 6px;
      cursor: pointer;
    }

    .item-options-content {
      display: flex;
      flex: 1;
      align-items: center;
      min-width: 0;
      padding: 0;
      color: var(--ant-color-text);
      cursor: pointer;

      div {
        min-width: 0;
        padding: 0;
        color: var(--ant-color-text);
        font-size: 14px;
        line-height: 22px;

        .notify-text-highlight {
          margin-left: 5px;
          font-weight: bold;
        }

        .notify-img-highlight {
          margin: 0 10px;
          color: rgba(0, 0, 0, 0.8);
        }

      }
    }
  }

  .item-number {
    flex: none;
    order: -1;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    color: var(--ant-color-primary);
    font-weight: 600;
    font-size: 12px;
    line-height: 1;
    background: var(--ant-color-primary-bg);
    border-radius: 50%;
  }

  &--show-controls {
    .item-options-warp {
      padding-right: 64px;
    }

    .actions-item__edit {
      position: absolute;
      top: 50%;
      right: 40px;
      width: 28px;
      height: 28px;
      padding: 0;
      color: var(--ant-color-text-secondary);
      transform: translateY(-50%);

      &:hover {
        color: var(--ant-color-primary);
        background: var(--ant-color-primary-bg);
      }
    }
  }
}

/* 详细模式由共享节点卡承载，保留原版 CheckItem 的校验与动作编辑生命周期。 */
.actions-item.actions-item--show-controls {
  display: block;
  min-height: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.actions-item-filter-warp {
  position: relative;
  margin-bottom: 24px;
  padding: 2px 0;
  border: 1px dashed var(--ant-color-border);
  border-radius: var(--radius-jet-sm, 8px);

  &.filter-border {
    padding: 2px 16px;
    border-color: var(--ant-color-border-secondary);
    border-radius: var(--radius-jet-sm, 8px);
  }

  .actions-item-filter-warp-tip {
    position: absolute;
    top: 0;
    left: 16px;
    z-index: 2;
    color: var(--ant-color-text-secondary);
    font-weight: 600;
    font-size: 14px;
    line-height: 1;
    background-color: var(--ant-color-bg-container);
    transform: translateY(-50%);
  }

  .actions-item-filter-overflow {
    display: flex;
    padding-top: 4px;
    overflow-x: auto;
    overflow-y: visible;
    row-gap: 16px;
  }

  .filter-add-button {
    width: 100%;
    color: var(--ant-color-text-tertiary);
    text-align: center;
    cursor: pointer;
  }

  .terms-params {
    // display: inline-block;
    display: flex;
    flex-shrink: 0;

    // &:not(:first-child) {
    //   margin-bottom: 16px;
    // }

    .terms-params-warp {
      display: flex;
      align-items: baseline;
    }

    .term-type-warp {
      // display: inline-block;
      width: 50px;
      margin: 0 16px;

      .term-type {
        padding-top: 4px;
        padding-bottom: 4px;
        border-radius: 2px;
      }
    }
  }
}
</style>
<style lang="less">
.actions-item-delete {
  position: absolute;
  top: 50%;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--ant-color-error);
  background-color: transparent;
  border-radius: 6px;
  opacity: 0;
  transform: translateY(-50%);
  cursor: pointer;
  transition: opacity .2s ease, background-color .2s ease;

  .actions-item:hover & {
    opacity: 1;
  }

  &.actions-item-delete--show {
    opacity: 1;
  }

  &:hover {
    background-color: var(--ant-color-error-bg);
  }
}
</style>
