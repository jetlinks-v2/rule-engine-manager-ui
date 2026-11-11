<template>
  <section :class="['device-scope-tree', { 'is-error': invalid }]">
    <header><strong>{{ title }}</strong></header>
    <p v-if="hint" class="device-scope-tree__hint">{{ hint }}</p>
    <a-input v-model:value="keyword" allow-clear :placeholder="$t('IotSceneLinkage.scope.searchTree')">
      <template #prefix><AIcon type="SearchOutlined" /></template>
    </a-input>
    <div v-if="countsError" class="device-scope-tree__error">
      <span>{{ $t('IotSceneLinkage.scope.countFailed') }}</span>
      <a-button type="link" size="small" @click="emit('retry')">{{ $t('IotSceneLinkage.scope.retry') }}</a-button>
    </div>
    <div v-if="treeError" class="device-scope-tree__error">
      <span>{{ $t('IotSceneLinkage.scope.treeFailed') }}</span>
      <a-button type="link" size="small" @click="emit('retry-tree')">{{ $t('IotSceneLinkage.scope.retry') }}</a-button>
    </div>
    <a-spin v-else :spinning="loading" class="device-scope-tree__body">
      <a-tree v-if="filteredNodes.length" block-node :show-line="{ showLeafIcon: false }"
        :tree-data="filteredNodes" :selected-keys="checkable ? [] : selectedKeys"
        :checkable="checkable" check-strictly :checked-keys="checkedKeys" :expanded-keys="visibleExpandedKeys"
        @select="select" @check="check" @expand="expand">
        <template #leafIcon><AIcon class="ant-tree-switcher-line-icon" type="FileOutlined" /></template>
        <template #title="node">
          <IotTreeNodeRow :count="showCounts ? countsLoading ? '…' : counts[node.key] ?? '—' : ''"
            :count-tooltip="!showCounts || counts[node.key] === undefined ? '' : $t('IotSceneLinkage.scope.deviceCount', { count: counts[node.key] })">
            <template #icon><AIcon :type="node.icon || icon" /></template>
            <template #label>{{ node.title }}</template>
          </IotTreeNodeRow>
        </template>
      </a-tree>
      <CloudEmpty v-else-if="!loading" :description="$t('IotSceneLinkage.scope.noTreeMatches')" />
    </a-spin>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import IotTreeNodeRow from '@device-manager-ui/components/IotTreeNodeRow.vue'
import { filterScopeTree, type SpaceNode } from '../deviceScopeTree'

const props = withDefaults(defineProps<{
  title: string; hint?: string; nodes: SpaceNode[]; counts?: Record<string, number>; showCounts?: boolean
  loading?: boolean; treeError?: boolean; countsLoading?: boolean; countsError?: boolean; invalid?: boolean
  checkable?: boolean; selectedKeys?: string[]; checkedKeys?: string[]; icon?: string
}>(), { hint: '', counts: () => ({}), showCounts: true, loading: false, treeError: false,
  countsLoading: false, countsError: false, invalid: false, checkable: false,
  selectedKeys: () => [], checkedKeys: () => [], icon: 'AppstoreOutlined' })
const emit = defineEmits<{ select: [keys: string[]]; check: [keys: string[]]; retry: []; 'retry-tree': [] }>()
const keyword = ref('')
const expandedKeys = ref<string[]>()
const filteredNodes = computed(() => filterScopeTree(props.nodes, keyword.value))
const allParentKeys = computed(() => {
  const collect = (nodes: SpaceNode[]): string[] => nodes.flatMap(node => node.children?.length ? [node.key, ...collect(node.children)] : [])
  return collect(props.nodes)
})
const visibleExpandedKeys = computed(() => keyword.value.trim() ? allParentKeys.value : expandedKeys.value ?? props.nodes.filter(node => node.children?.length).map(node => node.key))
function expand(keys: Array<string | number>) { expandedKeys.value = keys.map(String) }
function select(keys: Array<string | number>) { if (!props.checkable) emit('select', keys.map(String)) }
function check(_keys: unknown, info: { node: { key: string | number }; checked: boolean }) {
  // 范围按明确勾选的层级生效，父子互不联动；搜索隐藏的其他选择也必须保留。
  const keys = new Set(props.checkedKeys)
  const key = String(info.node.key)
  if (info.checked) keys.add(key)
  else keys.delete(key)
  emit('check', [...keys])
}
</script>

<style scoped>
.device-scope-tree { display: flex; flex: 1; flex-direction: column; gap: var(--space-4, 16px); min-height: 0; }
.device-scope-tree header strong { color: var(--jet-theme-text-title); font-size: var(--fs-18, 18px); font-weight: 600; line-height: var(--lh-24, 24px); }
.device-scope-tree__hint { margin: 0; color: var(--ant-color-text-tertiary); font-size: 12px; line-height: 1.5; }
.device-scope-tree__body { flex: 1; min-height: 0; overflow: auto; }
.device-scope-tree :deep(.ant-tree-title) { display: block; flex: 1; min-width: 0; width: 100%; }
.device-scope-tree :deep(.ant-tree-node-content-wrapper) { text-align: left; }
.device-scope-tree :deep(.ant-tree) { margin-top: var(--space-1, 4px); background: transparent; }
.device-scope-tree.is-error { outline: 1px solid var(--ant-color-error); border-radius: var(--radius-jet-sm, 8px); }
.device-scope-tree__error { display: flex; gap: 4px; align-items: center; color: var(--ant-color-error); font-size: 12px; }
</style>
