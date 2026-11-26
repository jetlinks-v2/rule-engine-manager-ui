<template>
    <div class="action-list-content">
        <template v-for="(item, index) in actions" :key="item.key">
            <Item
                :parallel="parallel"
                :data="item"
                :branchesName="branchesName"
                :thenName="thenName"
                :name="index"
                :type="type"
                :isLast="index === actions.length - 1"
                :options="item.options"
                :show-action-controls="showActionControls"
                @delete="_delete(item.key || '')"
            />
        </template>
        <div class="actions-add-list" :class="{ 'border': props.actions.length }">
            <a-button class="actions-add-list__button" type="primary" ghost style="width: 100%" @click="onAdd">
                <template #icon><AIcon type="PlusOutlined" /></template>
                {{ $t('ListItem.List.9667815-0') }}
            </a-button>
        </div>
        <Modal
            v-if="visible"
            :parallel="parallel"
            :name="actions.length"
            :branchGroup="thenName"
            :thenName="thenName"
            :branchesName="branchesName"
            @save="onSave"
            @cancel="onCancel"
        />
    </div>
</template>

<script lang="ts" setup>
import type { PropType } from 'vue';
import type { ActionsType, ParallelType } from '@rule-engine-manager-ui/Scene/typings';
import Modal from '../Modal/index.vue';
import Item from './Item.vue';
import { useSceneStore } from '@rule-engine-manager-ui/store/scene';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'ActionList' })

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data: _data } = storeToRefs(sceneStore);

interface ListProps {
    branchesName: number;
    type: ParallelType;
    actions: ActionsType[];
    parallel: boolean;
}

const props = defineProps({
    branchesName: {
      type: Number,
      default: 0
    },
    type: {
        type: String,
        default: 'serial',
    },
    actions: {
        type: Array as PropType<ListProps['actions']>,
        default: () => [],
    },
    branchesGroup: {
      type: Number,
      default: 0
    },
    parallel: Boolean,
    /** 仅详细模式使用显式的编辑、删除图标，原版入口继续保留整行编辑。 */
    showActionControls: {
      type: Boolean,
      default: false,
    },
});

const emit = defineEmits(['delete', 'add']);

const visible = ref<boolean>(false);

const thenName = computed(() => {
    const index =  _data.value.branches![props.branchesName].then.findIndex(item => item.parallel === props.parallel)
    return index === -1 ? 0 : index;
})

const onAdd = () => {
    visible.value = true;
};

const onSave = (data: any, options?: any) => {
    const { type, ...extra } = data;
    const item: ActionsType = {
        ...extra,
        key: data.key,
        actionId: data.actionId,
        options: {
          ...options,
          columns: options.otherColumns?.filter((item?: string) => item) || []
        },
    };
    emit('add', item)
    visible.value = false
};

const onCancel = () => {
  visible.value = false
}

const _delete = (_key: string) => {
  emit('delete', _key)
}

const _update = () => {
  visible.value = false
}
</script>

<style lang="less" scoped>
.action-list-content {
    display: grid;
    gap: var(--space-3, 12px);
    padding: 4px 0;

    .actions-list_form {
        .action-list-add {
            display: flex;
            justify-content: flex-end;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid @primary-color;
        }
    }

    .filter-add-button {
        width: 100%;
        color: rgba(0, 0, 0, 0.3);
        text-align: center;
        cursor: pointer;
    }

    .actions-add-list {
        &.border {
            padding-top: var(--space-3, 12px);
            border-top: 1px solid var(--ant-color-border-secondary);
        }

        .actions-add-list__button {
            height: 40px;
            border-style: dashed;
            border-color: var(--ant-color-border-secondary);
            background: var(--ant-color-bg-container);

            &:hover {
                border-color: var(--ant-color-primary);
                background: var(--ant-color-primary-bg);
            }
        }
    }
}
</style>
