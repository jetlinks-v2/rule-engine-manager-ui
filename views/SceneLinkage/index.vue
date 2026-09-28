<template>
  <j-page-container>
    <full-page has-padding transparent-background>
      <section class="scene-list">
        <j-pro-table
          ref="tableRef"
          mode="TABLE"
          :body-style="{ padding: 0 }"
          :columns="columns"
          :request="queryScenes"
          :params="tableParams"
          :default-params="{ sorts: [{ name: 'createTime', order: 'desc' }] }"
          :pagination="{ showSizeChanger: true, showQuickJumper: true }"
          row-key="id"
          :scroll="{ x: 'max-content' }"
        >
          <template #headerLeftRender>
            <h2 class="scene-list-toolbar__title">{{ $t('IotSceneLinkage.title.list') }}</h2>
          </template>
          <template #headerRightRender>
            <div class="scene-list-toolbar__actions">
              <ConditionFilter
                class="scene-list-toolbar__search"
                :fields="filterFields"
                :common-fields="filterCommonFields"
                :model-value="terms"
                :placeholder="$t('IotSceneLinkage.placeholder.search')"
                @update:model-value="terms = $event"
                @change="reload($event)"
              />
              <j-permission-button
                :hasPermission="`${permissionKey}:add`"
                @click="templateImportVisible = true"
              >
                <template #icon><AIcon type="ImportOutlined" /></template>
                {{ $t('IotSceneLinkage.action.importTemplate') }}
              </j-permission-button>
              <j-permission-button
                type="primary"
                :hasPermission="`${permissionKey}:add`"
                @click="openEditor()"
              >
                <template #icon><AIcon type="PlusOutlined" /></template>
                {{ $t('IotSceneLinkage.title.add') }}
              </j-permission-button>
            </div>
          </template>
          <template #name="scene">
            <strong>{{ scene.name }}</strong>
            <div><a-tag class="scene-list__trigger-tag">{{ triggerLabel(scene) }}</a-tag></div>
          </template>
          <template #rule="scene">
            <div class="scene-list__summary">
              <template v-for="(part, index) in sceneSummaryParts(scene)" :key="`${part.keyword}-${index}`">
                <b :class="part.kind === 'action' ? 'scene-list__summary-keyword--action' : 'scene-list__summary-keyword--trigger'">{{ part.keyword }}</b>
                <span :class="`scene-list__summary-field--${part.kind}`" :title="part.title || part.value">{{ part.value }}</span>
              </template>
            </div>
          </template>
          <template #state="scene">
            <a-switch
              :checked="stateValue(scene) === 'started'"
              :disabled="!hasScenePermission('action')"
              :loading="pendingId === scene.id"
              @change="confirmToggle(scene)"
            />
          </template>
          <template #actions="scene">
            <TableActions>
              <TableActionsItem common>
                <j-permission-button
                  type="link"
                  :hasPermission="`${permissionKey}:update`"
                  :tooltip="{ title: $t('IotSceneLinkage.action.edit') }"
                  @click="openEditor(scene.id)"
                >
                  <AIcon type="EditOutlined" />
                </j-permission-button>
              </TableActionsItem>
              <TableActionsItem v-if="sceneTriggerType(scene) === 'manual'">
                <j-permission-button
                  type="text"
                  :hasPermission="scenePermission('tigger')"
                  @click="confirmExecute(scene)"
                >
                  <template #icon><AIcon type="PlayCircleOutlined" /></template>
                  {{ $t('IotSceneLinkage.action.execute') }}
                </j-permission-button>
              </TableActionsItem>
              <TableActionsItem>
                <a-button type="text" @click="openRecordDrawer(scene)">
                  <template #icon><AIcon type="HistoryOutlined" /></template>
                  {{ $t('IotSceneLinkage.action.records') }}
                </a-button>
              </TableActionsItem>
              <TableActionsItem>
                <a-button type="text" :disabled="!hasScenePermission('add')" @click="exportTemplate(scene)">
                  <template #icon><AIcon type="ExportOutlined" /></template>
                  {{ $t('IotSceneLinkage.action.exportTemplate') }}
                </a-button>
              </TableActionsItem>
              <TableActionsItem v-if="stateValue(scene) !== 'disable'">
                <j-permission-button
                  type="text"
                  danger
                  disabled
                  :tooltip="{ title: $t('IotSceneLinkage.message.disableBeforeDelete') }"
                >
                  <template #icon><AIcon type="DeleteOutlined" /></template>
                  {{ $t('IotSceneLinkage.action.delete') }}
                </j-permission-button>
              </TableActionsItem>
              <TableActionsItem v-else>
                <j-permission-button
                  type="text"
                  danger
                  :hasPermission="scenePermission('delete')"
                  @click="confirmRemove(scene)"
                >
                  <template #icon><AIcon type="DeleteOutlined" /></template>
                  {{ $t('IotSceneLinkage.action.delete') }}
                </j-permission-button>
              </TableActionsItem>
            </TableActions>
          </template>
        </j-pro-table>
      </section>
      <SceneRecordTimeline
        v-if="recordScene"
        :open="recordDrawerOpen"
        :scene="recordScene"
        :state="recordState"
        @update:open="updateRecordDrawerOpen"
        @toggle-record="recordLogs.toggleRecord"
        @load-more="recordLogs.loadMore"
        @retry="recordLogs.reload"
        @retry-detail="recordLogs.retryDetail"
      />
      <SceneTemplateImportModal
        v-if="templateImportVisible"
        @close="templateImportVisible = false"
        @success="onTemplateImported"
      />
    </full-page>
  </j-page-container>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Modal } from 'ant-design-vue'
import ConditionFilter, { type ConditionFilterChangePayload, type ConditionFilterCommonField, type ConditionFilterField, type ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { useScenePermission } from '@rule-engine-manager-ui/hook/usePermission'
import { deleteScene, disableScene, enableScene, executeScene, getSceneDetail, queryScenes } from '../../api/scene-linkage'
import SceneRecordTimeline from './components/SceneRecordTimeline.vue'
import SceneTemplateImportModal from './components/SceneTemplateImportModal.vue'
import { useSceneExecutionRecords } from './hooks/useSceneExecutionRecords'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, type SceneDeviceScopeValue } from './editor/deviceScopeLabel'
import { toSceneTemplate } from './sceneCompatibility'

interface SceneRecordTarget {
  id: string
  name?: string
}

const { t } = useI18n()
const authStore = useAuthStore()
const menuStore = useMenuStore()
const route = useRoute()
// 使用当前菜单路由名定位 Editor 子页，使同一场景页可由 SaaS 与私有化各自的父菜单承载。
const injectedPermissionKey = useScenePermission()
const sceneRouteKey = computed(() => String(route.name || injectedPermissionKey).replace(/\/Editor$/, ''))
// 菜单权限按菜单 code 保存。SaaS 菜单沿用 iot-user/scene-linkage，私有化菜单使用 rule-engine/Scene。
const permissionKey = computed(() => sceneRouteKey.value || injectedPermissionKey)
const sceneActionCandidates: Record<string, string[]> = {
  // SaaS 菜单未单独声明这两个按钮，使用其编辑权限承接同等的保存/执行能力。
  action: ['action', 'update'],
  tigger: ['tigger', 'update'],
}
const scenePermission = (action: string) => {
  const candidates = sceneActionCandidates[action] || [action]
  return candidates.map(candidate => `${permissionKey.value}:${candidate}`).find(authStore.hasPermission)
    || `${permissionKey.value}:${candidates[0]}`
}
const hasScenePermission = (action: string) => authStore.hasPermission(scenePermission(action))
const pendingId = ref('')
const terms = ref<ConditionFilterTerm[]>([])
const queryTerms = ref<ConditionFilterTerm[]>([])
const tableRef = ref<{ reload: () => void }>()
const tableParams = computed(() => ({ terms: queryTerms.value }))
const recordScene = ref<SceneRecordTarget>()
const recordDrawerOpen = ref(false)
const recordLogs = useSceneExecutionRecords()
const recordState = computed(() => recordLogs.state.value)
const templateImportVisible = ref(false)
const triggerTypeOptions = computed(() => ['manual', 'timer', 'device', 'alarm', 'multi'].map(value => ({
  label: t(`IotSceneLinkage.triggerType.${value}`),
  value,
})))
const filterCommonFields: ConditionFilterCommonField[] = [{ label: t('IotSceneLinkage.form.name'), value: 'name' }, { label: t('IotSceneLinkage.form.triggerType'), value: 'triggerType' }, { label: t('IotSceneLinkage.form.state'), value: 'state' }]
const filterFields = computed<ConditionFilterField[]>(() => [{ dataIndex: 'name', title: t('IotSceneLinkage.form.name'), search: { type: 'string', defaultTermType: 'like' } }, { dataIndex: 'triggerType', title: t('IotSceneLinkage.form.triggerType'), search: { type: 'select', defaultTermType: 'eq', options: triggerTypeOptions.value } }, { dataIndex: 'state', title: t('IotSceneLinkage.form.state'), search: { type: 'select', defaultTermType: 'eq', options: [{ label: t('IotSceneLinkage.state.started'), value: 'started' }, { label: t('IotSceneLinkage.state.disable'), value: 'disable' }] } }])
const columns = computed(() => [{ title: t('IotSceneLinkage.column.scene'), dataIndex: 'name', width: 230, scopedSlots: true }, { title: t('IotSceneLinkage.column.rule'), dataIndex: 'rule', scopedSlots: true }, { title: t('IotSceneLinkage.column.state'), dataIndex: 'state', width: 100, scopedSlots: true }, { title: t('IotSceneLinkage.column.action'), dataIndex: 'actions', width: 90, scopedSlots: true }])
const stateValue = (scene: any) => scene.state?.value || scene.state
const sceneTriggerType = (scene: any) => scene.triggerType || scene.trigger?.type
const triggerLabel = (scene: any) => t(`IotSceneLinkage.triggerType.${sceneTriggerType(scene)}`)
const sceneSummary = (scene: any) => scene.options?.summary || `${t('IotSceneLinkage.rule.when')} ${triggerLabel(scene)}，${t('IotSceneLinkage.rule.then')} ${(scene.actions || []).map((a: any) => t(`IotSceneLinkage.action.${a.executor}`)).join('、')}`
const splitNames = (value?: string | string[]) => Array.isArray(value) ? value : String(value || '').split(/[、,，]/).map(item => item.trim()).filter(Boolean)
const normalizeScope = (scope: any, extraOptions: Record<string, any> = {}): SceneDeviceScopeValue => {
  const options = { ...extraOptions, ...(scope?.options || {}) }
  if (!options.names?.length) {
    const names = splitNames(options.name)
    if (names.length) options.names = names
  }
  return {
    selector: scope?.selector,
    selectorValues: (scope?.selectorValues || []).map((item: any, index: number) => typeof item === 'object'
      ? { value: String(item.value ?? item.id ?? ''), name: item.name || options.names?.[index] }
      : { value: String(item), name: options.names?.[index] }),
    options,
  }
}
const replaceAllText = (source: string, search: string, replacement: string) => search && replacement && search !== replacement ? source.split(search).join(replacement) : source
const expandScopeSummaryTitle = (scene: any, source: string) => {
  const scopes: Array<{ scope: SceneDeviceScopeValue; productName?: string }> = []
  const triggerDevice = scene.trigger?.device
  if (triggerDevice) scopes.push({ scope: normalizeScope(triggerDevice, { names: splitNames(scene.options?.trigger?.name) }), productName: scene.options?.trigger?.productName })
  const branchActions = (scene.branches || []).flatMap((branch: any) => (branch.then || []).flatMap((item: any) => item.actions || []))
  branchActions.forEach((action: any) => {
    if (action.executor === 'device' && action.device) scopes.push({ scope: normalizeScope(action.device, action.options), productName: action.options?.productName || action.device.options?.productName })
    if (action.executor === 'device-data' && action.configuration?.selector) scopes.push({ scope: normalizeScope(action.configuration.selector, action.options), productName: action.options?.productName || action.configuration.selector.options?.productName })
  })
  return scopes.reduce((text, item) => {
    const shortScope = formatDeviceScopeText(t, item.scope)
    const fullScope = formatDeviceScopeTitle(t, item.scope)
    const shortTarget = formatProductScopeText(t, item.productName || '', shortScope)
    const fullTarget = formatProductScopeText(t, item.productName || '', fullScope)
    return replaceAllText(replaceAllText(text, shortTarget, fullTarget), shortScope, fullScope)
  }, source)
}
const sceneSummaryTitle = (scene: any) => expandScopeSummaryTitle(scene, scene.options?.summaryTitle || sceneSummary(scene))
const splitSceneSummaryParts = (text: string) => {
  const matches = [...text.matchAll(/(?:^|[，。\s])([当且就则])\s*(.*?)(?=[，。\s]+[且就则]|$)/g)]
  return matches.length ? matches.map((item, index) => ({ keyword: item[1], value: item[2].replace(/[，。]\s*$/, '').trim(), kind: item[1] === '就' || item[1] === '则' ? 'action' : index ? 'condition' : 'trigger' })) : [{ keyword: t('IotSceneLinkage.rule.when'), value: text, kind: 'trigger' }]
}
const sceneSummaryParts = (scene: any) => {
  const title = sceneSummaryTitle(scene)
  const titleParts = splitSceneSummaryParts(title)
  return splitSceneSummaryParts(sceneSummary(scene)).map((part, index) => ({ ...part, title: titleParts[index]?.value || title }))
}
function reload(payload?: ConditionFilterChangePayload) {
  if (payload) {
    queryTerms.value = payload.terms
    return
  }
  tableRef.value?.reload()
}
async function openEditor(id?: string) {
  // 由菜单运行时解析当前部署的父路由，保证 SaaS 与私有化均可进入同一个 Editor 子页。
  menuStore.jumpPage(`${sceneRouteKey.value}/Editor`, { params: id ? { id } : {} })
}

function openRecordDrawer(scene: SceneRecordTarget) {
  recordScene.value = scene
  recordDrawerOpen.value = true
  void recordLogs.open(scene.id)
}

function updateRecordDrawerOpen(open: boolean) {
  recordDrawerOpen.value = open
  if (!open) recordScene.value = undefined
}

/** 读取完整场景后再导出，列表摘要不足以生成可重新导入的模板。 */
async function exportTemplate(scene: any) {
  const response = await getSceneDetail(scene.id)
  const content = JSON.stringify(toSceneTemplate(response?.result || response), null, 2)
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${String(scene.name || scene.id).replace(/[\\/:*?"<>|]/g, '_')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function onTemplateImported() {
  templateImportVisible.value = false
  // 重新提交当前筛选参数，让 ProTable 回到第一页并加载最新导入的场景。
  queryTerms.value = [...queryTerms.value]
}
async function toggle(scene: any) {
  pendingId.value = scene.id
  try {
    const enabled = stateValue(scene) !== 'started'
    enabled ? await enableScene(scene.id) : await disableScene(scene.id)
    onlyMessage(t(enabled ? 'IotSceneLinkage.message.enabled' : 'IotSceneLinkage.message.disabled', { name: scene.name }), 'success')
    reload()
  } finally {
    pendingId.value = ''
  }
}
function confirmToggle(scene: any) {
  const enabled = stateValue(scene) !== 'started'
  Modal.confirm({
    title: t(enabled ? 'IotSceneLinkage.confirm.enable' : 'IotSceneLinkage.confirm.disable'),
    onOk: () => toggle(scene),
  })
}
async function execute(scene: any) {
  await executeScene(scene.id)
  onlyMessage(t('IotSceneLinkage.message.executed', { name: scene.name }), 'success')
  reload()
}
function confirmExecute(scene: any) {
  Modal.confirm({
    title: t('IotSceneLinkage.confirm.executeTitle'),
    content: t('IotSceneLinkage.confirm.executeContent', { name: scene.name }),
    okText: t('IotSceneLinkage.action.execute'),
    onOk: () => execute(scene),
  })
}
function confirmRemove(scene: any) {
  Modal.confirm({
    title: t('IotSceneLinkage.confirm.delete'),
    okType: 'danger',
    onOk: () => remove(scene),
  })
}
async function remove(scene: any) {
  await deleteScene(scene.id)
  reload()
}
</script>
<style scoped>
.scene-list {
  width: 100%;
  gap: var(--space-4);
	height: 100%;
}

.scene-list-toolbar__title {
  margin: 0;
  color: rgba(0, 0, 0, 0.85);
  font-size: 20px;
  font-weight: 600;
  line-height: 32px;
  white-space: nowrap;
}

.scene-list-toolbar__search {
  flex: 1 1 360px;
  min-width: 25rem;
  max-width: 40rem;
}

.scene-list-toolbar__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.scene-list__trigger-tag {
  display: inline-flex;
  margin-top: var(--space-2);
  padding: 1px 6px !important;
  color: var(--ant-color-primary) !important;
  background: #eef4ff !important;
  border: 1px solid #d6e4ff !important;
  border-radius: 3px;
}

.scene-list__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
  color: var(--ant-color-text-secondary);
  line-height: 24px;
}

.scene-list__summary b {
  font-weight: 600;
}

.scene-list__summary-keyword--trigger {
  color: #d46b08;
}

.scene-list__summary-keyword--action {
  color: var(--ant-color-primary);
}

.scene-list__summary span {
  padding: 0;
}

.scene-list__summary-field--trigger,
.scene-list__summary-field--condition,
.scene-list__summary-field--action {
  color: inherit;
  background: transparent;
}
</style>
