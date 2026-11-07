<template>
  <div class="actions">
    <div class="actions-title">
      <span>{{ $t('action.index.966779-0') }}</span>
      <ShakeLimit
        v-if="props.openShakeLimit"
        v-model:value="FormModel.branches[name].shakeLimit"
      />
    </div>
    <div class="actions-warp">
      <a-collapse v-model:activeKey="activeKeys">
        <a-collapse-panel key="1">
          <template #header>
            <span>
              {{ $t('action.index.966779-1') }}
              <span class="panel-tip">
                {{ $t('action.index.966779-2') }}
              </span>
            </span>
          </template>
          <div class="actions-list">
            <List
              type="serial"
              :branchesName="name"
              :parallel="false"
              :show-action-controls="showActionControls"
              :actions="serialArray.length ? serialArray[0].actions : []"
              @add="(_item) => onAdd(_item, false)"
              @delete="(_key) => onDelete(_key, false)"
            />
          </div>
        </a-collapse-panel>
        <a-collapse-panel key="2">
          <template #header>
            <span>
              {{ $t('action.index.966779-3') }}
              <span class="panel-tip">
                {{ $t('action.index.966779-4') }}
              </span>
            </span>
          </template>
          <div class="actions-list">
            <List
              type="parallel"
              :branchesName="name"
              :parallel="true"
              :show-action-controls="showActionControls"
              :actions="parallelArray.length ? parallelArray[0].actions : []"
              @add="(_item) => onAdd(_item, true)"
              @delete="(_key) => onDelete(_key, true)"
            />
          </div>
        </a-collapse-panel>
      </a-collapse>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { BranchesThen } from "../../typings";
import ShakeLimit from "../components/ShakeLimit/index.vue";
import { List } from "./ListItem";
import { PropType } from "vue";
import { randomString } from "@jetlinks-web/utils";
import { storeToRefs } from "pinia";
import { useSceneStore } from "@rule-engine-manager-ui/store/scene";
import { Form, Modal } from "ant-design-vue";
import { queryAlarmPage } from "@rule-engine-manager-ui/api/scene";
import { unBindAlarmMultiple } from "@rule-engine-manager-ui/api/configuration";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data: FormModel } = storeToRefs(sceneStore);

const formItemContext = Form.useInjectFormItemContext();
const props = defineProps({
  name: {
    type: Number,
    default: 0,
  },
  thenOptions: {
    type: Array as PropType<BranchesThen[]>,
    default: () => [],
  },
  openShakeLimit: {
    type: Boolean,
    default: false,
  },
  groupIndex: {
    type: Number,
    default: 0,
  },
  /** 新建详细模式分支时默认展开串行动作，不改变串并行数据。 */
  autoExpandSerial: {
    type: Boolean,
    default: false,
  },
  /** 详细模式显示与快速配置一致的显式编辑、删除操作。 */
  showActionControls: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update", "add"]);

const activeKeys = ref<string[]>(["1"]);
const parallelArray = ref<BranchesThen[]>([]);
const serialArray = ref<BranchesThen[]>([]);
const lock = ref<boolean>(false);

watch(() => props.autoExpandSerial, (shouldExpand) => {
  if (shouldExpand && !activeKeys.value.includes('1')) {
    activeKeys.value = [...activeKeys.value, '1'];
  }
}, { immediate: true });

watch(
  () => props.thenOptions,
  (newVal) => {
    parallelArray.value = newVal.filter((item) => item.parallel);
    serialArray.value = newVal.filter((item) => !item.parallel);

    const isSerialActions = serialArray.value.some((item) => {
      return !!item.actions.length;
    });

    const isParallelActions = parallelArray.value.some(
      (item) => !!item.actions?.length
    );

    if (!lock.value && isParallelActions) {
      activeKeys.value =
        !serialArray.value.length || !isSerialActions ? ["2"] : ["1", "2"];
    }
  },
  {
    deep: true,
    immediate: true,
  }
);

const onDelete = async (_key: string, _parallel: boolean) => {
  const thenName = props.thenOptions.findIndex(
    (item) => item.parallel === _parallel
  );
  const actionIndex = FormModel.value.branches?.[props.name].then?.[
    thenName
  ].actions.findIndex((item) => item.key === _key);

  if (actionIndex !== -1) {
    const actionItem =
      FormModel.value.branches?.[props.name].then?.[thenName].actions[
        actionIndex
      ];

    if (actionItem.executor === "alarm") {
      const _branchId = FormModel.value.branches?.[props.name].branchId;
      const resp = await queryAlarmPage({
        terms: [
          {
            terms: [
              {
                column: "id$rule-bind-alarm",
                value: `${FormModel.value.id}:${
                  actionItem.actionId || _branchId
                }`,
              },
              {
                column: "id$rule-bind-alarm",
                value: `${FormModel.value.id}:${-1}`,
                type: "or",
              },
            ],
          },
        ],
      });
      if (resp.success && resp.result.total) {
        Modal.confirm({
          title: $t('action.index.966779-5', [resp.result.total]),
          onOk() {
            const _data = resp.result.data.map((item) => {
              return {
                alarmId: item.id,
                ruleId: FormModel.value.id,
                branchIndex: actionItem.actionId,
              };
            });
            unBindAlarmMultiple(_data);
            FormModel.value.branches?.[props.name].then?.[
              thenName
            ].actions.splice(actionIndex!, 1);
            formItemContext.onFieldChange();
          },
        });
      } else {
        FormModel.value.branches?.[props.name].then?.[thenName].actions.splice(
          actionIndex!,
          1
        );
        formItemContext.onFieldChange();
      }
    } else {
      FormModel.value.branches?.[props.name].then?.[thenName].actions.splice(
        actionIndex!,
        1
      );
      formItemContext.onFieldChange();
    }
  }
};

const onAdd = (actionItem: any, _parallel: boolean) => {
  const thenName = props.thenOptions.findIndex(
    (item) => item.parallel === _parallel
  );
  if (thenName !== -1) {
    // 编辑
    // const cacheAction =  props.thenOptions[thenName].actions
    // const indexOf = cacheAction?.findIndex(item => item.key === actionItem.key) || -1
    // if (indexOf !== -1) {
    //   FormModel.value.branches?.[props.name].then?.[thenName].actions.splice(indexOf, 1, actionItem)
    // } else {
    //   FormModel.value.branches?.[props.name].then?.[thenName].actions.push(actionItem)
    // }
    FormModel.value.branches?.[props.name].then?.[thenName].actions.push(
      actionItem
    );
  } else {
    // 新增
    const newThenItem = {
      parallel: _parallel,
      key: randomString(),
      actions: [actionItem],
    };
    FormModel.value.branches?.[props.name].then.push(newThenItem);
  }
  formItemContext.onFieldChange();
};
</script>

<style lang="less" scoped>
.actions {
  .actions-title {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
    color: var(--ant-color-text);
    font-weight: 600;
    font-size: 14px;
    line-height: 32px;
  }

  .actions-warp {
    .actions-list {
      width: 100%;
    }

    :deep(.ant-collapse) {
      background: transparent;
      border-color: var(--ant-color-border-secondary);
      border-radius: var(--radius-jet-sm, 8px);
    }

    :deep(.ant-collapse-header) {
      align-items: center;
      min-height: 48px;
      color: var(--ant-color-text);
      font-weight: 600;
      background: var(--ant-color-fill-quaternary);
    }

    :deep(.ant-collapse-content) {
      border-color: var(--ant-color-border-secondary);
    }

    :deep(.ant-collapse-content-box) {
      padding: var(--space-4, 16px);
    }
  }

  .panel-tip {
    padding-left: 8px;
    color: var(--ant-color-text-tertiary);
    font-weight: 400;
  }
}
</style>
