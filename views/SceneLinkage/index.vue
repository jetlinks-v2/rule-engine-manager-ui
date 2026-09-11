<template>
  <j-page-container>
    <full-page has-padding>
      <SceneRecordTimeline v-if="recordScene" :scene="recordScene" @back="recordScene = undefined" />
      <section v-else class="scene-list">
        <div class="scene-list-table">
          <div class="scene-list-toolbar">
            <h2 class="scene-list-toolbar__title">{{ $t('IotSceneLinkage.title.list') }}</h2>
            <ConditionFilter
              class="scene-list-toolbar__search"
              :fields="filterFields"
              :common-fields="filterCommonFields"
              :model-value="terms"
              :placeholder="$t('IotSceneLinkage.placeholder.search')"
              @update:model-value="terms = $event"
              @change="reload($event)"
            />
            <div class="scene-list-toolbar__actions">
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
          </div>
          <a-table class="scene-list__table" :loading="loading" :columns="columns" :data-source="list" row-key="scene.id" :pagination="pagination" @change="changePage">
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'name'">
                <strong>{{ record.scene.name }}</strong>
                <div><a-tag class="scene-list__trigger-tag">{{ triggerLabel(record.scene) }}</a-tag></div>
              </template>
              <template v-else-if="column.dataIndex === 'rule'">
                <div class="scene-list__summary">
                  <template v-for="(part, index) in sceneSummaryParts(record.scene)" :key="`${part.keyword}-${index}`">
                    <b :class="part.kind === 'action' ? 'scene-list__summary-keyword--action' : 'scene-list__summary-keyword--trigger'">{{ part.keyword }}</b>
                    <span :class="`scene-list__summary-field--${part.kind}`" :title="part.title || part.value">{{ part.value }}</span>
                  </template>
                </div>
              </template>
              <template v-else-if="column.dataIndex === 'state'">
                <a-switch
                  :checked="stateValue(record.scene) === 'started'"
                  :disabled="!hasScenePermission('action')"
                  :loading="pendingId === record.scene.id"
                  @change="confirmToggle(record.scene)"
                />
              </template>
              <template v-else-if="column.dataIndex === 'lastExecute'">{{ record.lastExecute || '-' }}</template>
              <template v-else-if="column.dataIndex === 'actions'">
                <div class="scene-list__actions">
                <span>
                  <j-permission-button
                    v-if="sceneTriggerType(record.scene) === 'manual'"
                    type="link"
                    :hasPermission="scenePermission('tigger')"
                    @click="confirmExecute(record.scene)"
                  >
                    {{ $t('IotSceneLinkage.action.execute') }}
                  </j-permission-button>
                </span>
                  <j-permission-button type="link" :hasPermission="`${permissionKey}:update`" @click="openEditor(record.scene.id)">
                    {{ $t('IotSceneLinkage.action.edit') }}
                  </j-permission-button>
                  <a-dropdown>
                    <a-button type="link"><AIcon type="MoreOutlined" /></a-button>
                    <template #overlay>
                      <a-menu>
                        <a-menu-item @click="recordScene = record.scene">{{ $t('IotSceneLinkage.action.records') }}</a-menu-item>
                        <a-menu-item :disabled="!hasScenePermission('add')" @click="exportTemplate(record.scene)">
                          {{ $t('IotSceneLinkage.action.exportTemplate') }}
                        </a-menu-item>
                        <a-menu-item v-if="stateValue(record.scene) !== 'disable'" danger disabled>
                          <a-tooltip :title="$t('IotSceneLinkage.message.disableBeforeDelete')">
                            <span class="scene-list__delete-tooltip">{{ $t('IotSceneLinkage.action.delete') }}</span>
                          </a-tooltip>
                        </a-menu-item>
                        <a-menu-item v-else danger :disabled="!hasScenePermission('delete')" @click="confirmRemove(record.scene)">
                          {{ $t('IotSceneLinkage.action.delete') }}
                        </a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </div>
              </template>
            </template>
          </a-table>
        </div>
      </section>
      <SceneTemplateImportModal
        v-if="templateImportVisible"
        @close="templateImportVisible = false"
        @success="onTemplateImported"
      />
    </full-page>
  </j-page-container>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Modal } from 'ant-design-vue'
import ConditionFilter, { type ConditionFilterChangePayload, type ConditionFilterCommonField, type ConditionFilterField, type ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { useAuthStore } from '@jetlinks-web-core/store/auth'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
import { useScenePermission } from '@rule-engine-manager-ui/hook/usePermission'
import { deleteScene, disableScene, enableScene, executeScene, getSceneDetail, queryScenes } from '../../api/scene-linkage'
import { normalizeResult } from './utils'
import SceneRecordTimeline from './components/SceneRecordTimeline.vue'
import SceneTemplateImportModal from './components/SceneTemplateImportModal.vue'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, type SceneDeviceScopeValue } from './editor/deviceScopeLabel'
import { toSceneTemplate } from './sceneCompatibility'
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
const list = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const pendingId = ref('')
const terms = ref<ConditionFilterTerm[]>([])
const queryTerms = ref<ConditionFilterTerm[]>([])
const pageIndex = ref(0)
const pageSize = ref(10)
const recordScene = ref<any>()
const templateImportVisible = ref(false)
const triggerTypeOptions = computed(() => ['manual', 'timer', 'device', 'alarm', 'multi'].map(value => ({
  label: t(`IotSceneLinkage.triggerType.${value}`),
  value,
})))
const filterCommonFields: ConditionFilterCommonField[] = [{ label: t('IotSceneLinkage.form.name'), value: 'name' }, { label: t('IotSceneLinkage.form.triggerType'), value: 'triggerType' }, { label: t('IotSceneLinkage.form.state'), value: 'state' }]
const filterFields = computed<ConditionFilterField[]>(() => [{ dataIndex: 'name', title: t('IotSceneLinkage.form.name'), search: { type: 'string', defaultTermType: 'like', handleParamsItem: term => ({ ...term, value: term.termType === 'like' && typeof term.value === 'string' && !term.value.includes('%') ? `%${term.value}%` : term.value }) } }, { dataIndex: 'triggerType', title: t('IotSceneLinkage.form.triggerType'), search: { type: 'select', defaultTermType: 'eq', options: triggerTypeOptions.value } }, { dataIndex: 'state', title: t('IotSceneLinkage.form.state'), search: { type: 'select', defaultTermType: 'eq', options: [{ label: t('IotSceneLinkage.state.started'), value: 'started' }, { label: t('IotSceneLinkage.state.disable'), value: 'disable' }] } }])
const columns = computed(() => [{ title: t('IotSceneLinkage.column.scene'), dataIndex: 'name', width: 230 }, { title: t('IotSceneLinkage.column.rule'), dataIndex: 'rule' }, { title: t('IotSceneLinkage.column.state'), dataIndex: 'state', width: 100 }, { title: t('IotSceneLinkage.column.action'), dataIndex: 'actions', width: 160 }])
const pagination = computed(() => ({ current: pageIndex.value + 1, pageSize: pageSize.value, total: total.value, showSizeChanger: true, showQuickJumper: true }))
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
async function reload(payload?: ConditionFilterChangePayload) {
  // 翻页时沿用 ConditionFilter 已转换的查询条件，避免丢失名称模糊匹配的通配符。
  if (payload) queryTerms.value = payload.terms
  loading.value = true
  try {
    const result = normalizeResult<any>(await queryScenes({
      pageIndex: pageIndex.value,
      pageSize: pageSize.value,
      terms: queryTerms.value,
      sorts: [{ name: 'createTime', order: 'desc' }],
    }))
    list.value = result.data.map(scene => ({ scene }))
    total.value = result.total
  } finally {
    loading.value = false
  }
}
function changePage(pager: any) {
  pageIndex.value = Number(pager.current || 1) - 1
  pageSize.value = Number(pager.pageSize || 10)
  reload()
}
async function openEditor(id?: string) {
  // 由菜单运行时解析当前部署的父路由，保证 SaaS 与私有化均可进入同一个 Editor 子页。
  menuStore.jumpPage(`${sceneRouteKey.value}/Editor`, { params: id ? { id } : {} })
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
  pageIndex.value = 0
  void reload()
}
async function toggle(scene: any) {
  pendingId.value = scene.id
  try {
    const enabled = stateValue(scene) !== 'started'
    enabled ? await enableScene(scene.id) : await disableScene(scene.id)
    onlyMessage(t(enabled ? 'IotSceneLinkage.message.enabled' : 'IotSceneLinkage.message.disabled', { name: scene.name }), 'success')
    await reload()
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
  await reload()
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
onMounted(reload)
</script>
<style scoped>
.scene-list {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
}

.scene-list-table {
  display: grid;
  gap: var(--space-4);
  background: var(--jet-theme-bg-container);
  border-radius: var(--jet-theme-radius);
}

.scene-list-toolbar {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  padding: var(--space-4) var(--space-4) 0;
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
  min-width: 280px;
  max-width: 640px;
}

.scene-list-toolbar__actions {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.scene-list__actions {
  display: grid;
  grid-template-columns: 40px 40px 24px;
  gap: var(--space-2);
  align-items: center;
}

.scene-list__actions > span {
  min-width: 0;
}

.scene-list__delete-tooltip {
  display: block;
  cursor: not-allowed;
}

.scene-list :deep(.ant-table-pagination) {
  margin: var(--space-4) 0 0;
}

.scene-list__table :deep(.ant-table-container) {
  overflow: hidden;
  border-radius: var(--r-2);
}

.scene-list__table :deep(.ant-table-thead > tr > th) {
  background: var(--canvas);
  font-weight: 600;
  border-bottom: 1px solid var(--line);
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
