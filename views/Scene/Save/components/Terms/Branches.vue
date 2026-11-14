<template>
  <div :class='WarpClass'>
    <DetailedSceneSectionHeader v-if="detailCardLayout" :kind="isFirst ? 'condition' : 'otherwise'">
      <template v-if="!isFirst" #actions>
        <ConfirmModal :title="$t('Terms.Branches.9093534-2')" :onConfirm="onDelete" className="detailed-scene-branch-delete">
          <a-button type="text" danger size="small" :aria-label="$t('Terms.Branches.9093534-2')">
            <template #icon><AIcon type="DeleteOutlined" /></template>
          </a-button>
        </ConfirmModal>
      </template>
      <template v-if="isFirst" #extra>
        <ShakeLimit v-model:value="FormModel.branches[name].shakeLimit" />
      </template>
    </DetailedSceneSectionHeader>
    <div v-else class='actions-terms-title'>
      {{ isFirst ? $t('Terms.Branches.9093534-0') : $t('Terms.Branches.9093534-1') }}
      <a-switch
        v-if='isFirst && showFilterToggle'
        :checked='filterEnabled'
        :checkedChildren="$t('Terms.Terms.9093429-3')"
        :unCheckedChildren="$t('Terms.Terms.9093429-4')"
        @change="(value) => emit('update-filter', value)"
      />
    </div>
    <div :class='optionsClass'>
      <!-- 否则承载独立的条件与动作；展开后复用首分支的条件标题及防抖配置。 -->
      <DetailedSceneSectionHeader v-if="detailCardLayout && !isFirst" kind="condition">
        <template #extra>
          <ShakeLimit v-model:value="FormModel.branches[name].shakeLimit" />
        </template>
      </DetailedSceneSectionHeader>
        <ConfirmModal :title="$t('Terms.Branches.9093534-2')" v-if='!isFirst && !detailCardLayout' :onConfirm="onDelete" className="terms-params-delete danger show detailed-scene-branch-delete">
          <AIcon type='DeleteOutlined' />
        </ConfirmModal>
      <div
        class='actions-terms-list'
        @mouseover='mouseover'
        @mouseout='mouseout'
      >
        <ConfirmModal :title="$t('Terms.Branches.9093534-3')" :show='showDelete && whenData.length' :onConfirm="onDeleteAll" className="terms-params-delete detailed-scene-filter-delete">
          <AIcon type='CloseOutlined' />
        </ConfirmModal>
        <div class='actions-terms-list-content'>
          <template v-if='showWhen'>
            <j-scrollbar>
              <div class="actions-terms-list-content__items">
                <WhenItem
                  v-for='(item, index) in whenData'
                  :key='item.key'
                  :name='index'
                  :showDeleteBtn='detailCardLayout || whenData.length !== 1'
                  :detail-card-layout='detailCardLayout'
                  :isFirst='index === 0'
                  :isLast='index === whenData.length -1'
                  :branchName='name'
                  :branches_Index='branches_Index'
                  :data='item'
                />

              </div>
            </j-scrollbar>
          </template>
          <div v-else class="actions-terms-list-content__items">
            <SceneFilterAddButton v-if="detailCardLayout" @add="addWhen" />
            <span v-else class='when-add' @click='addWhen' :style='{ padding: isFirst ? "16px 0" : 0 }'>
              <AIcon type='PlusCircleOutlined' style='padding: 4px' />
              {{ $t('Terms.Branches.9093534-4') }}
            </span>
          </div>
        </div>
      </div>
      <div class='actions-branches'>
        <section v-if='detailCardLayout' class='detailed-scene-action-card'>
          <DetailedSceneSectionHeader kind="action" />
          <a-form-item :name='["branches", name, "then"]' :rules='rules'>
            <Action
              :name='name'
              :openShakeLimit="false"
              :auto-expand-serial="autoExpandSerial"
              :show-action-controls="showActionControls"
              :thenOptions='FormModel.branches[name]?.then'
              :groupIndex="groupIndex"
            />
          </a-form-item>
        </section>
        <a-form-item v-else :name='["branches", name, "then"]' :rules='rules'>
          <Action
            :name='name'
            :openShakeLimit="true"
            :auto-expand-serial="autoExpandSerial"
            :show-action-controls="showActionControls"
            :thenOptions='FormModel.branches[name]?.then'
            :groupIndex="groupIndex"
          />
        </a-form-item>
      </div>
    </div>
  </div>
</template>

<script lang='ts' setup>
import type { PropType } from 'vue'
import type { ActionBranchesProps } from '../../../typings';
import WhenItem from './WhenItem.vue'
import { storeToRefs } from 'pinia';
import { useSceneStore } from '@rule-engine-manager-ui/store/scene'
import Action from '../../action/index.vue'
import ShakeLimit from '../ShakeLimit/index.vue'
import DetailedSceneSectionHeader from './DetailedSceneSectionHeader.vue'
import SceneFilterAddButton from '../SceneFilterAddButton.vue'
import { randomString} from '@jetlinks-web/utils'
import { useI18n } from 'vue-i18n'
import {ACTION_DATA} from "@rule-engine-manager-ui/views/Scene/Save/util";

defineOptions({ name: 'Branches' })

const { t: $t } = useI18n()
const sceneStore = useSceneStore()
const { data: FormModel } = storeToRefs(sceneStore)

const props = defineProps({
  isFirst: {
    type: Boolean,
    default: true
  },
  data: {
    type: Object as PropType<ActionBranchesProps>,
    default: () => ({
      when: [],
      shakeLimit: {},
      then: []
    })
  },
  class: {
    type: String,
    default: ''
  },
  name: {
    type: Number,
    default: 0
  },
  branches_Index: {
    type: Number,
    default: 0
  },
  groupLen: {
    type: Number,
    default: 0
  },
  groupIndex: {
    type: Number,
    default: 0
  },
  showGroupDelete: {
    type: Boolean,
    default: false
  },
  filterEnabled: {
    type: Boolean,
    default: false
  },
  showFilterToggle: {
    type: Boolean,
    default: true,
  },
  /** 仅详细模式显示显式动作操作，避免影响原版编辑器。 */
  showActionControls: {
    type: Boolean,
    default: false
  },
  /** 详细模式仅切换为卡片式视觉承载，原版规则树及其操作仍由当前组件维护。 */
  detailCardLayout: {
    type: Boolean,
    default: false,
  },
  /** 由详细模式新建分支触发，仅控制首屏折叠面板的展示状态。 */
  autoExpandSerial: {
    type: Boolean,
    default: false,
  }
})

const emit = defineEmits(['deleteGroup', 'delete', 'update-filter'])

provide(ACTION_DATA, {
  branchIndex: props.name
})

const showDelete = ref(false)
const error = ref(false)

const showWhen = computed(() => {
  return props.data.when.length
})

const whenData = computed(() => {
  return props.data.when
})

const WarpClass = computed(() => {
  return {
    'actions-terms-warp': true,
    'first-children': props.isFirst,
    'terms-items': (FormModel.value.branches?.length || 0) > 0,
    'actions-terms-warp--detail': props.detailCardLayout,
  }
})

const onDelete = () => {
  emit('delete')
}

const onDeleteAll = () => {
  if (FormModel.value.branches) {
    FormModel.value.branches[props.name].when = []
    FormModel.value.options.when[props.branches_Index].terms = []
    if(FormModel.value.branches[props.name + 1] === null){
      FormModel.value.branches.splice(props.name + 1 , 1)
    }
  }
}

const mouseover = () => {
  if (!props.isFirst){
    showDelete.value = true
  }
}

const mouseout = () => {
  if (!props.isFirst){
    showDelete.value = false
  }
}

const addWhen = () => {
  const terms = {
    type: 'and',
    terms: [
      {
        column: undefined,
        value: {
          source: 'fixed',
          value: undefined
        },
        termType: undefined,
        key: `params_${randomString()}`,
        type: 'and',
      }
    ],
    key: `terms_${randomString()}`,
  }
  FormModel.value.branches?.[props.name].when?.push(terms)

  FormModel.value.options!.when[props.branches_Index]!.terms = [{ termType: $t('Terms.Branches.9093534-5'), terms: [['','eq','','and']]}]
}

const optionsClass = computed(() => {
  return {
    'actions-terms-options': true,
    border: !props.isFirst && !props.detailCardLayout,
    error: error
  }
})

const rules = [{
  validator(_: string, value: any) {
    if (!value || (value && !value.length)) {
      return Promise.reject($t('Terms.Branches.9093534-6'))
    } else {
      const isActions = value.some((item: any) => item.actions && item.actions.length)
      return isActions ? Promise.resolve() : Promise.reject($t('Terms.Branches.9093534-6'));
    }
    return Promise.resolve();
  }
}]

const deleteGroup = () => {
  emit('deleteGroup')
}

</script>
<style scoped lang='less'>
.actions-terms-list {
  min-height: 52px;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: var(--ant-color-fill-quaternary);
  border: 1px dashed var(--ant-color-border);
  border-radius: var(--radius-jet-sm, 8px);
}

.actions-branches {
  padding-top: var(--space-3, 12px);
}

.when-add {
  font-size: 14px;
  color: var(--ant-color-primary);
  cursor: pointer;
}

.detailed-scene-action-card {
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--radius-jet-sm, 6px);
}
</style>
