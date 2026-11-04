<template>
	<j-page-container>
		<a-spin v-if="loadingScene" class="scene-editor__loading" />
		<DetailedSceneEditor
			v-else-if="editorMode === 'detail'"
			:rule="canonicalDraft"
			:supported-triggers="supportedTriggers"
			:trigger-providers="triggerProviders"
			:saving="saving"
			:save-permission="savePermission"
			@cancel="menuStore.jumpPage(sceneRouteKey)"
			@save="saveDetailed"
			@switch-mode="switchFromDetailed"
		/>
		<main v-else class="scene-editor">
			<PageHeader
				show-back
					:title="route.params.id ? $t('IotSceneLinkage.title.editRule') : $t('IotSceneLinkage.title.addRule')"
			>
				<template #actions>
					<div class="scene-editor__header-actions">
						<a-radio-group :value="editorMode" button-style="solid" @change="switchFromQuick">
							<a-radio-button value="quick">{{ $t('IotSceneLinkage.editor.quickMode') }}</a-radio-button>
							<a-radio-button value="detail">{{ $t('IotSceneLinkage.editor.detailMode') }}</a-radio-button>
						</a-radio-group>
					</div>
				</template>
			</PageHeader>
			<div class="scene-editor__workspace">
				<aside class="scene-editor__sidebar">
					<section class="scene-editor__sidebar-section">
						<label class="scene-editor__sidebar-label">{{ $t('IotSceneLinkage.form.sceneName') }}</label>
						<a-input v-model:value="form.name"
						         :class="['scene-editor__name', { 'scene-editor__invalid': hasError('name') }]"
						         :placeholder="$t('IotSceneLinkage.placeholder.editorName')"/>
						<span v-if="hasError('name')" class="scene-editor__name-error">{{ errorMessage('name') }}</span>
					</section>
					<section v-if="isMulti || form.triggerKind !== 'state'" class="scene-editor__sidebar-section scene-editor__debounce-panel">
						<div class="scene-editor__sidebar-title">
							<span>{{ $t('IotSceneLinkage.debounce.enable') }} <a-tooltip :title="$t('IotSceneLinkage.debounce.hint')"><AIcon class="scene-editor__debounce-help" type="QuestionCircleOutlined"/></a-tooltip></span>
							<a-switch v-model:checked="form.debounceEnabled"/>
						</div>
						<template v-if="form.debounceEnabled">
							<div class="scene-editor__sidebar-field">
								<label>{{ $t('IotSceneLinkage.debounce.effectivePeriod') }}</label>
								<EffectivePeriodSelect v-model="timeRangeCondition"/>
								<small>{{ effectivePeriodHint }}</small>
							</div>
							<div class="scene-editor__sidebar-field">
								<label>{{ $t('IotSceneLinkage.debounce.frequency') }}</label>
								<a-select v-model:value="debounceIntervalPreset" :options="debouncePresetOptions"/>
								<small>{{ debounceFrequencyHint }}</small>
							</div>
							<div class="scene-editor__sidebar-field">
								<label>{{ $t('IotSceneLinkage.debounce.continuous') }}</label>
								<a-select v-model:value="debounceContinuousPreset" :options="debouncePresetOptions"/>
								<small>{{ debounceContinuousHint }}</small>
							</div>
						</template>
					</section>
				</aside>
				<div class="scene-editor__content">
					<section class="scene-editor__rule-preview">
						<div class="scene-editor__rule-preview-title"><AIcon type="EyeOutlined" />{{ $t('IotSceneLinkage.title.rulePreview') }}</div>
						<SceneRuleSummary :form="form" :users="notifyUsers" @change="form.summary = $event" @title-change="form.summaryTitle = $event"/>
					</section>
			<section :class="['scene-editor__section scene-editor__rule-group scene-editor__rule-group--trigger', { 'scene-editor__multi-trigger': isMulti }]">
				<header class="scene-editor__rule-group-header"><span class="scene-editor__rule-group-icon"><AIcon type="ThunderboltOutlined"/></span><div><h3>{{ $t('IotSceneLinkage.editor.triggerSectionTitle') }}</h3><p>{{ $t('IotSceneLinkage.editor.triggerGroupDescription') }}</p></div></header>
				<div class="scene-editor__rule-group-body">
					<template v-if="isMulti"><MultiTriggerCard v-for="(item, index) in form.multiTriggers" :key="item.clientId" :trigger="item" :index="index" :removable="form.multiTriggers.length > 1" :auto-open="pendingMultiTriggerClientId === item.clientId" @opened="pendingMultiTriggerClientId = undefined" @cancel-new="removeMultiTrigger(index)" @remove="removeMultiTrigger(index)"/></template>
					<article v-else-if="hasTrigger" :class="['scene-editor__rule-card scene-editor__rule-card--trigger', { 'scene-editor__invalid': hasError('trigger') }]">
						<header><span class="scene-editor__trigger-icon" :style="{ color: form.triggerKind === 'ai-event' ? '#1E5EFF' : triggerIcon.color, background: form.triggerKind === 'ai-event' ? '#E8F0FF' : triggerIcon.background }"><svg v-if="triggerIcon.path" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path :d="triggerIcon.path"/></svg><AIcon v-else :type="form.triggerKind === 'ai-event' ? 'RadarChartOutlined' : triggerIcon.type"/></span><strong>{{ triggerText }}</strong><small>{{ $t('IotSceneLinkage.editor.conditionNumber', { index: 1 }) }}</small><span class="scene-editor__rule-card-actions"><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button v-if="isDevice || form.triggerKind !== 'manual'" type="text" @click="isDevice ? openScope() : openTriggerEditor()"><AIcon type="EditOutlined"/></a-button></a-tooltip><a-button v-if="!isEditing && form.triggerKind !== 'state' && !(form.triggerKind === 'repeat' && form.repeatMode === 'custom')" type="text" danger @click="clearTrigger"><AIcon type="DeleteOutlined"/></a-button></span></header>
						<div class="scene-editor__rule-card-description">{{ isDevice ? deviceTriggerSummary : triggerConfigurationSummary }}</div>
					</article>
					<a-tooltip v-if="showMultiTriggerControl" :title="multiTriggerDisabledReason ? $t(multiTriggerDisabledReason) : undefined"><span class="scene-editor__multi-trigger-add"><a-button block class="scene-editor__add" :disabled="!canAddMultiTrigger" @click="addMultiTrigger"><AIcon type="PlusOutlined"/>{{ $t('IotSceneLinkage.editor.addAnotherTrigger') }}</a-button></span></a-tooltip>
					<a-button v-else-if="!hasTrigger" block :class="['scene-editor__add', { 'scene-editor__invalid': hasError('trigger') }]" @click="triggerPickerVisible = true"><AIcon type="PlusOutlined"/>{{ $t('IotSceneLinkage.editor.addTrigger') }}</a-button>
					<p v-if="hasError('trigger')" class="scene-editor__error-message">{{ errorMessage('trigger') }}</p>
				</div>
			</section>
			<section class="scene-editor__section scene-editor__rule-group scene-editor__rule-group--condition">
				<header class="scene-editor__rule-group-header"><span class="scene-editor__rule-group-icon"><AIcon type="FilterOutlined"/></span><div><h3>{{ $t('IotSceneLinkage.editor.conditionSectionTitle') }}</h3><p>{{ $t('IotSceneLinkage.editor.conditionGroupDescription') }}</p></div></header>
				<div class="scene-editor__rule-group-body">
				<SceneConditionRow v-for="item in quickConditions" :key="item.index" :condition="item.condition" :auto-open="autoOpenConditionIndex === item.index"
					                   :index="item.index"
					                   :invalid="hasError('condition')"
					                   :error-message="errorMessage('condition')" @update="updateCondition(item.index, $event)"
					                   @opened="autoOpenConditionIndex = undefined" @cancel-new="form.additionalConditions.splice(item.index, 1)" @remove="form.additionalConditions.splice(item.index, 1)"/>
				<a-button block class="scene-editor__add scene-editor__extra-condition-add" @click="conditionVisible = true">
					<AIcon type="PlusOutlined"/>
					{{ $t('IotSceneLinkage.editor.addCondition') }}
				</a-button>
				</div>
			</section>
			<section :class="['scene-editor__section scene-editor__rule-group scene-editor__rule-group--action', { 'scene-editor__invalid': hasError('action') || hasError('notify') }]">
				<header class="scene-editor__rule-group-header"><span class="scene-editor__rule-group-icon"><AIcon type="PlayCircleOutlined"/></span><div><h3>{{ $t('IotSceneLinkage.editor.actionSectionTitle') }}</h3><p>{{ $t('IotSceneLinkage.editor.actionGroupDescription') }}</p></div></header>
				<div class="scene-editor__rule-group-body">
				<template v-for="(action, index) in form.actions" :key="index">
					<NotifyActionRow
						v-if="action.type === 'sceneNotify'"
						:action="action"
						:index="index"
						:auto-open="autoOpenActionIndex === index"
						:methods="notifyMethods"
						:users="notifyUsers"
						:methods-loading="notifyMethodsLoading"
						:users-loading="notifyUsersLoading"
						:invalid="hasError('notify') && (!action.config?.notifyChannelIds?.length || !action.config?.userIds?.length)"
						@change="updateAction(index, $event)"
						@method-change="changeNotifyMethod(index, $event)"
						@load-users="loadNotifyUsers"
						@load-more-users="loadNotifyUsers(false)"
						@opened="autoOpenActionIndex = undefined"
						@cancel-new="form.actions.splice(index, 1)"
						@remove="form.actions.splice(index, 1)"
					/>
					<DeviceActionRow v-else-if="action.type === 'device'" :action="action" :index="index" :auto-open="autoOpenActionIndex === index"
					                 @opened="autoOpenActionIndex = undefined" @cancel-new="form.actions.splice(index, 1)" @update="updateAction(index, $event)" @remove="form.actions.splice(index, 1)"/>
					<article v-else class="scene-editor__rule-card scene-editor__rule-card--action">
						<header><span class="scene-editor__action-icon"><AIcon :type="actionIcon(action.type)"/></span><strong>{{ $t(`IotSceneLinkage.action.${action.type}`) }}</strong><small>{{ index + 1 }}</small><span class="scene-editor__rule-card-actions"><a-tooltip v-if="action.type === 'delay'" :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openDelayEditor(index)"><AIcon type="EditOutlined"/></a-button></a-tooltip><a-button type="text" danger @click="form.actions.splice(index, 1)"><AIcon type="DeleteOutlined"/></a-button></span></header>
						<div class="scene-editor__rule-card-description" v-if="action.type === 'delay'">{{ action.time }} {{ $t(`IotSceneLinkage.unit.${action.unit}`) }}</div>
					</article>
				</template>
					<article v-if="legacyAlarmActionReadOnly" class="scene-editor__rule-card scene-editor__rule-card--action scene-editor__action-row--readonly"><header><span class="scene-editor__action-icon"><AIcon type="AlertOutlined"/></span><strong>{{ $t('IotSceneLinkage.summary.legacyAlarmAction') }}</strong></header><div class="scene-editor__rule-card-description">{{ $t('IotSceneLinkage.message.legacyConfigurationUnsupported') }}</div></article>
				<a-button block
				          :class="['scene-editor__add', { 'scene-editor__invalid': hasError('action') || hasError('notify') }]"
				          @click="actionPickerVisible = true">
					<AIcon type="PlusOutlined"/>
					{{ $t('IotSceneLinkage.editor.addAction') }}
				</a-button>
				<p v-if="hasError('action') || hasError('notify')" class="scene-editor__error-message">
					{{ errorMessage(validation.field) }}</p>
				</div>
			</section>
				</div>
			</div>
			<footer class="scene-editor__footer">
				<a-button @click="menuStore.jumpPage(sceneRouteKey)">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
				<j-permission-button type="primary" :hasPermission="savePermission" :loading="saving" @click="save">{{
						$t('IotSceneLinkage.action.saveScene')
					}}
				</j-permission-button>
			</footer>
		</main>
		<TriggerPickerModal :open="triggerPickerVisible" :options="availableTriggerOptions" @cancel="cancelTriggerPicker"
		                    @select="selectTriggerFromPicker"/>
		<ActionPickerModal
			:open="actionPickerVisible"
			:supported-actions="supportedActions"
			@cancel="actionPickerVisible = false"
			@select-delay="addDelay"
			@select-device="openAction('device')"
			@select-notify="addNotifyAction"
		/>
		<DeviceScopeModal :open="scopeVisible" :title="scopeDialogTitle" :width="1180" :product-id="form.productId"
		                  :model-value="{ selector: form.allDevices ? 'all' : form.dynamicScope ? form.dynamicScopeType : 'fixed', selectorValues: form.dynamicScope ? form.groupIds.map(value => ({ value })) : form.deviceIds.map((value, index) => ({ value, name: form.scopeOptions.names?.[index] })), options: form.scopeOptions, productId: form.productId, productName: form.productName }"
		                  @cancel="cancelTriggerScope" @select-device="selectTriggerDevice" @save="saveTriggerScope">
			<template #configuration="{ hasSelection }">
				<div class="scene-editor__device-trigger-config">
					<a-form layout="vertical">
						<template v-if="hasSelection">
							<a-form-item v-if="form.triggerKind === 'property'" :label="$t('IotSceneLinkage.condition.current')">
								<a-space direction="vertical" class="scene-editor__device-trigger-fields">
									<ThingModelSelect v-model="form.propertyId" :options="propertyOptions" :placeholder="$t('IotSceneLinkage.placeholder.property')" @change="updateTriggerProperty" @dropdownVisibleChange="loadMetadata"/>
									<a-select v-model:value="form.termType" :options="termOptions"/>
									<ThingModelValueInput v-model="form.termValue" :value-type="selectedProperty?.valueType" :unit="selectedProperty?.unit"/>
								</a-space>
							</a-form-item>
							<a-form-item v-else-if="form.triggerKind === 'event'" :label="$t('IotSceneLinkage.form.event')">
								<a-space direction="vertical" class="scene-editor__device-trigger-fields">
									<ThingModelSelect v-model="form.eventId" :options="eventOptions" :placeholder="$t('IotSceneLinkage.placeholder.event')" @change="updateTriggerEvent" @dropdownVisibleChange="loadMetadata"/>
									<template v-if="form.eventId">
										<ThingModelSelect v-model="form.eventOutputId" :options="eventOutputOptions" :placeholder="$t('IotSceneLinkage.placeholder.eventOutput')" @change="updateTriggerEventOutput"/>
										<a-select v-model:value="form.eventTermType" :options="eventTermOptions"/>
										<ThingModelValueInput v-model="form.eventTermValue" :value-type="selectedEventOutput?.valueType" :placeholder="$t('IotSceneLinkage.placeholder.eventOutputValue')"/>
									</template>
								</a-space>
							</a-form-item>
							<a-form-item v-else-if="form.triggerKind === 'state'" :label="$t('IotSceneLinkage.stateCondition.label')">
								<DeviceStateTriggerRow v-model:state="form.deviceState" v-model:mode="form.deviceStateTriggerMode"
								                       v-model:sustained-time="form.deviceStateSustainedTime" :removable="false"/>
							</a-form-item>
						</template>
					</a-form>
				</div>
			</template>
			<template #preview><span>{{ deviceTriggerSummary }}</span></template>
		</DeviceScopeModal>
		<a-modal :open="triggerEditorVisible" :title="triggerText" :mask-closable="false" @cancel="cancelTriggerEditor" @ok="saveTriggerEditor">
			<div class="scene-editor__trigger-editor">
				<AlarmTriggerSourceRow v-if="form.triggerKind === 'alarm'" v-model="form.alarm"/>
				<AiEventTriggerRow v-else-if="form.triggerKind === 'ai-event'" v-model="form.aiEvent"/>
				<template v-else-if="form.triggerKind === 'repeat'">
					<a-radio-group v-model:value="form.repeatMode">
						<a-radio-button value="daily">{{ $t('IotSceneLinkage.repeat.daily') }}</a-radio-button>
						<a-radio-button value="weekdays">{{ $t('IotSceneLinkage.repeat.weekdays') }}</a-radio-button>
						<a-radio-button value="weekends">{{ $t('IotSceneLinkage.repeat.weekends') }}</a-radio-button>
						<a-radio-button value="custom">{{ $t('IotSceneLinkage.repeat.custom') }}</a-radio-button>
					</a-radio-group>
					<a-time-picker v-model:value="repeatTime" :class="{ 'scene-editor__invalid': hasError('repeat') }" format="HH:mm" value-format="HH:mm"/>
					<div v-if="form.repeatMode === 'custom'" :class="['scene-editor__custom-repeat', { 'scene-editor__invalid': hasError('repeat') }]">
						<a-radio-group v-model:value="form.repeatCustomMode" @change="changeRepeatCustomMode">
							<a-radio-button value="weekly">{{ $t('IotSceneLinkage.repeat.weekly') }}</a-radio-button>
							<a-radio-button value="monthly">{{ $t('IotSceneLinkage.repeat.monthly') }}</a-radio-button>
						</a-radio-group>
						<a-checkbox-group v-if="form.repeatCustomMode === 'weekly'" v-model:value="form.repeatWeekdays" class="scene-editor__repeat-options" :options="weekOptions"/>
						<a-checkbox-group v-else v-model:value="form.repeatMonthDays" class="scene-editor__repeat-options scene-editor__month-days" :options="monthDayOptions"/>
					</div>
				</template>
				<template v-else-if="form.triggerKind === 'date'">
					<a-date-picker v-model:value="form.dateTime" :class="{ 'scene-editor__invalid': hasError('date') }" show-time value-format="YYYY-MM-DD HH:mm:ss"/>
					<span>{{ $t('IotSceneLinkage.editor.dateExecutionHint') }}</span>
				</template>
				<template v-else-if="form.triggerKind === 'interval'">
					<span>{{ $t('IotSceneLinkage.editor.every') }}</span>
					<a-input-number v-model:value="form.interval" :min="1"/>
					<a-select v-model:value="form.intervalUnit" popup-class-name="scene-editor__compact-dropdown" :dropdown-match-select-width="false" :options="units"/>
					<span>{{ $t('IotSceneLinkage.editor.triggerOnce') }}</span>
				</template>
			</div>
		</a-modal>
		<ConditionPickerModal :open="conditionVisible" @cancel="conditionVisible = false" @select="addCondition" @select-alarm-source="addAlarmCondition"/>
		<a-modal :open="delayEditorVisible" :title="$t('IotSceneLinkage.action.delay')" :mask-closable="false" @cancel="cancelDelayEditor" @ok="saveDelayEditor">
			<a-space><span>{{ $t('IotSceneLinkage.action.wait') }}</span><a-input-number v-model:value="delayDraft.time" :min="1"/><a-select v-model:value="delayDraft.unit" :options="units"/></a-space>
		</a-modal>
	</j-page-container>
</template>
<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Modal } from 'ant-design-vue'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { createSceneLinkage, getProduct, getSceneDetail, queryCurrentSceneNotifyUser, querySceneNotifyChannelTemplates, querySceneNotifyChannels, querySceneNotifyUsers, querySceneSupportedActions, querySceneSupportedTriggers, updateSceneLinkage, type SceneNotifyMethod, type SceneNotifyUser, type SceneProviderInfo } from '../../../api/scene-linkage'
import { canReceiveProfileBackedNotification, mergeNotifyUsersById } from '../../../utils/notifyUser'
import { applyMultiTriggerForm, buildRequest, defaultForm, formatSceneDuration, MULTI_TRIGGER_PROVIDERS, normalizeResult, toForm, type SceneConditionForm, type SceneEditorMode, type SceneLinkageForm, type SceneMultiTriggerForm, type SceneTimeRange, type SceneTriggerKind } from '../utils'
import DetailedSceneEditor from './detail/DetailedSceneEditor.vue'
import { mergeDetailedDraft, mergeQuickDraft, prepareQuickRuleForDetailedEditing, resolveInitialEditorMode, type SceneRuleRecord } from './editorMode'
import { getSceneCompatibility } from '../sceneCompatibility'
import { hasUnsupportedLegacyAlarmAction } from '../sceneRule'
import ActionPickerModal from './components/ActionPickerModal.vue'
import ConditionPickerModal from './components/ConditionPickerModal.vue'
import DeviceActionRow from './components/DeviceActionRow.vue'
import DeviceStateTriggerRow from './components/DeviceStateTriggerRow.vue'
import DeviceScopeModal, { type DeviceScope } from './components/DeviceScopeModal.vue'
import MultiTriggerCard from './components/MultiTriggerCard.vue'
import SceneConditionRow from './components/SceneConditionRow.vue'
import AlarmTriggerSourceRow from './components/AlarmTriggerSourceRow.vue'
import AiEventTriggerRow from './components/AiEventTriggerRow.vue'
import NotifyActionRow from './components/NotifyActionRow.vue'
import SceneRuleSummary from './components/SceneRuleSummary.vue'
import EffectivePeriodSelect from './components/EffectivePeriodSelect.vue'
import ThingModelSelect from './components/ThingModelSelect.vue'
import ThingModelValueInput from './components/ThingModelValueInput.vue'
import TriggerPickerModal from './components/TriggerPickerModal.vue'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, toTriggerScopeValue } from './deviceScopeLabel'
import { resolveSceneConditionColumns } from './sceneConditionColumns'
import { getTermTypes, toThingModelOptions } from './thingModel'
import { useMultiSceneTrigger } from './useMultiSceneTrigger'
import { PageHeader } from '@jetlinks-web-core/components'
import { useScenePermission } from '@rule-engine-manager-ui/hook/usePermission'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
const notifyUsersPageIndex = ref(-1)
const notifyUsersTotal = ref(0)
// 编辑器由 SaaS 与私有化两套菜单进入，新增和编辑分别对应各自菜单的动作码。
const sceneRoutePermissionKey = computed(() => String(route.name || permissionKey).replace(/\/Editor$/, ''))
const savePermission = computed(() => `${sceneRoutePermissionKey.value}:${route.params.id ? 'update' : 'add'}`)
// 新编辑路由按当前菜单分别使用 SaaS 的 add/update 与私有化菜单的 add/update 动作权限。
const route = useRoute(); const { t } = useI18n(); const permissionKey = useScenePermission(); const menuStore = useMenuStore(); const sceneRouteKey = computed(() => String(route.name || permissionKey).replace(/\/Editor$/, '')); const form = reactive<SceneLinkageForm>(defaultForm()); const properties = ref<any[]>([]); const events = ref<any[]>([]); const saving = ref(false); const triggerPickerVisible = ref(false); const actionPickerVisible = ref(false); const scopeVisible = ref(false); const conditionVisible = ref(false); const delayEditorVisible = ref(false); const delayEditingIndex = ref<number>(); const delayDraft = reactive({ time: 1, unit: 'seconds' }); const autoOpenActionIndex = ref<number>(); const autoOpenConditionIndex = ref<number>(); const notifyMethods = ref<SceneNotifyMethod[]>([]); const notifyUsers = ref<SceneNotifyUser[]>([]); const notifyMethodsLoading = ref(false); const notifyUsersLoading = ref(false); const supportedTriggers = ref<string[]>([]); const triggerProviders = ref<SceneProviderInfo[]>([]); const supportedActions = ref<string[]>([]); const validation = reactive({ field: '', message: '' }); const loadingScene = ref(Boolean(route.params.id)); const editorMode = ref<SceneEditorMode>('quick'); const originalSnapshot = ref<SceneRuleRecord>({}); const quickProjectionBase = ref<SceneRuleRecord>({}); const canonicalDraft = ref<SceneRuleRecord>({}); const hasDetailedSession = ref(false); const quickResetFromDetailed = ref(false); const legacyAlarmActionReadOnly = ref(false)
// 左侧快捷时段使用独立标记，避免覆盖用户从右侧添加的时间额外条件。
const timeRangeCondition = computed<SceneTimeRange[]>({
  get: () => form.additionalConditions.find((condition): condition is Extract<SceneConditionForm, { type: 'timeRange' }> => condition.type === 'timeRange' && condition.source === 'effective-period')?.ranges || [],
  set: (ranges) => {
    const index = form.additionalConditions.findIndex(condition => condition.type === 'timeRange' && condition.source === 'effective-period')
    if (ranges.length) {
      if (index > -1) form.additionalConditions[index] = { type: 'timeRange', ranges, source: 'effective-period' }
      else form.additionalConditions.unshift({ type: 'timeRange', ranges, source: 'effective-period' })
    } else if (index > -1) form.additionalConditions.splice(index, 1)
  },
})
const quickConditions = computed(() => form.additionalConditions
  .map((condition, index) => ({ condition, index }))
  .filter(({ condition }) => condition.type !== 'timeRange' || condition.source !== 'effective-period'))
const debouncePresetValues = [10, 30, 60, 300, 600, 1800]
const debounceTimeLabel = (value: number) => formatSceneDuration(t, value)
const debouncePresetOptions = computed(() => [
  { value: 'unlimited', label: t('IotSceneLinkage.debounce.unlimited') },
  ...debouncePresetValues.map(value => ({ value: String(value), label: debounceTimeLabel(value) })),
  ...(form.debounceLimitEnabled && !debouncePresetValues.includes(form.debounceTime)
    ? [{ value: String(form.debounceTime), label: t('IotSceneLinkage.debounce.legacyPreset', { time: debounceTimeLabel(form.debounceTime) }), disabled: true }]
    : []),
])
const toDebouncePreset = (value: number) => String(value)
/** Frequency and continuous duration use the same ShakeLimit field, so the two quick controls are mutually exclusive. */
const debounceIntervalPreset = computed<string>({
  get: () => form.debounceLimitEnabled && form.debounceMode === 'interval' ? toDebouncePreset(form.debounceTime) : 'unlimited',
  set: value => {
    if (value === 'unlimited') {
      if (form.debounceMode === 'interval') form.debounceLimitEnabled = false
      return
    }
    form.debounceLimitEnabled = true
    form.debounceMode = 'interval'
    form.debounceTime = Number(value)
  },
})
const debounceContinuousPreset = computed<string>({
  get: () => form.debounceLimitEnabled && form.debounceMode === 'continuous' ? toDebouncePreset(form.debounceTime) : 'unlimited',
  set: value => {
    if (value === 'unlimited') {
      if (form.debounceMode === 'continuous') form.debounceLimitEnabled = false
      return
    }
    form.debounceLimitEnabled = true
    form.debounceMode = 'continuous'
    form.debounceTime = Number(value)
  },
})
const hasFrequencyLimit = computed(() => form.debounceLimitEnabled && form.debounceMode === 'interval')
const hasContinuousLimit = computed(() => form.debounceLimitEnabled && form.debounceMode === 'continuous')
const debounceFrequencyHint = computed(() => hasFrequencyLimit.value
  ? t('IotSceneLinkage.debounce.frequencyHint', { time: debounceTimeLabel(form.debounceTime) })
  : hasContinuousLimit.value
    ? t('IotSceneLinkage.debounce.exclusiveFrequencyHint')
    : t('IotSceneLinkage.debounce.frequencyUnlimitedHint'))
const debounceContinuousHint = computed(() => hasContinuousLimit.value
  ? t('IotSceneLinkage.debounce.continuousHint', { time: debounceTimeLabel(form.debounceTime) })
  : hasFrequencyLimit.value
    ? t('IotSceneLinkage.debounce.exclusiveContinuousHint')
    : t('IotSceneLinkage.debounce.continuousUnlimitedHint'))
const effectivePeriodHint = computed(() => {
  const [range] = timeRangeCondition.value
  if (!range) return t('IotSceneLinkage.debounce.effectivePeriodAllHint')
  if (range.start === '08:00' && range.end === '20:00') return t('IotSceneLinkage.debounce.effectivePeriodDaytimeHint')
  if (range.start === '20:00' && range.end === '08:00') return t('IotSceneLinkage.debounce.effectivePeriodNightHint')
  return t('IotSceneLinkage.debounce.effectivePeriodCustomHint', range)
})
const { activeMultiTriggerIndex, addingMultiTrigger, isMulti, showMultiTriggerControl, multiTriggerDisabledReason, canAddMultiTrigger, addMultiTrigger: beginMultiTrigger, cancelTriggerPicker: resetMultiTriggerPicker, removeMultiTrigger, selectMultiTrigger, selectTrigger: selectMultiTriggerKind } = useMultiSceneTrigger(form, supportedTriggers, () => { void loadMetadata(true) })
const hasTrigger = computed(() => Boolean(form.triggerKind)); const isEditing = computed(() => Boolean(route.params.id)); const isDevice = computed(() => ['property', 'event', 'online', 'offline', 'state'].includes(form.triggerKind)); const repeatTime = computed({ get: () => form.repeatTime, set: (value: string) => form.repeatTime = value }); const units = computed(() => ['seconds', 'minutes', 'hours'].map(value => ({ value, label: t(`IotSceneLinkage.unit.${value}`) }))); const weekOptions = computed(() => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => ({ value: index + 1, label: t(`IotSceneLinkage.weekday.${day}`) }))); const monthDayOptions = computed(() => Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: t('IotSceneLinkage.monthDay', { day: index + 1 }) }))); const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property')); const eventOptions = computed(() => toThingModelOptions(events.value, 'event')); const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === form.propertyId)); const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) }))); const triggerText = computed(() => hasTrigger.value ? t(`IotSceneLinkage.trigger.${form.triggerKind}`) : t('IotSceneLinkage.rule.noTrigger')); const actionText = computed(() => form.actions.length ? form.actions.map(action => t(`IotSceneLinkage.action.${action.type}`)).join('、') : t('IotSceneLinkage.rule.noAction')); const scopeText = computed(() => formatDeviceScopeText(t, toTriggerScopeValue(form), { emptyText: t('IotSceneLinkage.placeholder.device') })); const scopeTitle = computed(() => formatDeviceScopeTitle(t, toTriggerScopeValue(form), { emptyText: t('IotSceneLinkage.placeholder.device') })); const triggerIcon = computed(() => ({ manual: { background: '#F2F3F5', color: '#4E5969', path: 'M9 1.5 3 9h4l-1 5.5L12 7H8l1-5.5Z' }, repeat: { background: '#E8F0FF', color: '#1E5EFF', path: 'M8 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM8 4.5V8l2.5 1.5' }, date: { background: '#E6F5EE', color: '#0E8A5F', path: 'M2.5 3.5h11v10h-11ZM2.5 6.5h11M5.5 1.5v3M10.5 1.5v3' }, interval: { background: '#EFEBFF', color: '#6C4FE0', path: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3' }, property: { background: '#E6F5EE', color: '#0E8A5F', path: 'M2 12l3.5-3.5 2.5 2.5L14 5M14 5h-3.5M14 5v3.5' }, event: { background: '#FFECF0', color: '#D02F5A', path: 'M1.5 8h3L6 4l3 8 1.5-4h4' }, online: { background: '#E6F5EE', color: '#0E8A5F', type: 'LoginOutlined' }, offline: { background: '#F2F3F5', color: '#4E5969', type: 'LogoutOutlined' }, state: { background: '#EFEBFF', color: '#6C4FE0', type: 'SyncOutlined' }, alarm: { background: '#FFF1F0', color: '#FF4D4F', type: 'AlertOutlined' } }[form.triggerKind] || { background: '#F2F3F5', color: '#4E5969', type: 'ThunderboltOutlined' })); const hasError = (field: string) => validation.field === field; const errorMessage = (field: string) => hasError(field) ? t(validation.message) : ''
const deviceTriggerSnapshot = ref<SceneLinkageForm>()
const deviceTriggerWasNew = ref(false)
const pendingMultiTriggerClientId = ref<string>()
const triggerEditorVisible = ref(false)
const triggerEditorSnapshot = ref<SceneLinkageForm>()
const triggerEditorWasNew = ref(false)
const deviceTriggerSummary = computed(() => {
  const target = formatProductScopeText(t, form.productName || form.productId || '', scopeText.value)
  if (form.triggerKind === 'property') return [target, form.propertyName || form.propertyId, form.termValue].filter(value => value !== undefined && value !== '').join(' · ')
  if (form.triggerKind === 'event') return [target, form.eventName || form.eventId, form.eventOutputName || form.eventOutputId, form.eventTermValue].filter(value => value !== undefined && value !== '').join(' · ')
  return target
})
const triggerForms = computed(() => isMulti.value ? form.multiTriggers || [] : [form])
const multiTriggerDescription = (trigger: SceneMultiTriggerForm) => {
  const join = (...values: Array<string | number | boolean | undefined>) => values
    .filter(value => value !== undefined && value !== '')
    .map(String)
    .join(' · ')
  const type = t(`IotSceneLinkage.trigger.${trigger.triggerKind}`)
  const target = formatProductScopeText(t, trigger.productName || trigger.productId || '', formatDeviceScopeText(t, toTriggerScopeValue(trigger)))
  switch (trigger.triggerKind) {
    case 'repeat': return join(type, t(`IotSceneLinkage.repeat.${trigger.repeatMode}`), trigger.repeatTime)
    case 'date': return join(type, trigger.dateTime)
    case 'interval': return join(type, trigger.interval, t(`IotSceneLinkage.unit.${trigger.intervalUnit}`))
    case 'property': return join(type, target, trigger.propertyName || trigger.propertyId, trigger.termValue)
    case 'event': return join(type, target, trigger.eventName || trigger.eventId, trigger.eventOutputName || trigger.eventOutputId, trigger.eventTermValue)
    case 'state': return join(type, target, t(`IotSceneLinkage.deviceState.${trigger.deviceState}`))
    case 'alarm': return join(type, trigger.alarm.options?.alarmConfigName)
    default: return join(type, target)
  }
}
const triggerConfigurationSummary = computed(() => {
  switch (form.triggerKind) {
    case 'repeat': {
      const repeat = form.repeatMode === 'custom'
        ? `${t(`IotSceneLinkage.repeat.${form.repeatCustomMode}`)} · ${(form.repeatCustomMode === 'weekly' ? form.repeatWeekdays : form.repeatMonthDays).join('、')}`
        : t(`IotSceneLinkage.repeat.${form.repeatMode}`)
      return [repeat, form.repeatTime].filter(Boolean).join(' · ')
    }
    case 'date': return form.dateTime || t('IotSceneLinkage.editor.dateExecutionHint')
    case 'interval': return [form.interval, form.intervalUnit ? t(`IotSceneLinkage.unit.${form.intervalUnit}`) : undefined].filter(Boolean).join(' · ')
    case 'alarm': return [form.alarm.options?.alarmConfigName, form.alarm.modes?.map(mode => t(`IotSceneLinkage.alarmMode.${mode}`)).join('、')].filter(Boolean).join(' · ')
    case 'ai-event': return [form.aiEvent.sceneName, form.aiEvent.taskTargetName].filter(Boolean).join(' · ')
    default: return t(`IotSceneLinkage.triggerDesc.${form.triggerKind}`)
  }
})
const selectedEvent = computed(() => events.value.find(item => item.id === form.eventId))
const eventOutputOptions = computed(() => {
  const outputs = selectedEvent.value?.outputs || selectedEvent.value?.output?.properties || selectedEvent.value?.output || selectedEvent.value?.valueType?.properties || []
  return toThingModelOptions(Array.isArray(outputs) ? outputs : [], 'property')
})
const selectedEventOutput = computed(() => eventOutputOptions.value.find(item => item.value === form.eventOutputId))
const eventTermOptions = computed(() => getTermTypes(selectedEventOutput.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const scopeDialogTitle = computed(() => t('IotSceneLinkage.title.selectDevices'))
type QuickTriggerPickerKind = SceneTriggerKind | 'iot-alarm' | 'visual-alarm'
const quickTriggerCategories = {
  device: { label: 'IotSceneLinkage.triggerCategory.device', description: 'IotSceneLinkage.triggerCategoryDesc.device' },
  timer: { label: 'IotSceneLinkage.triggerCategory.timer', description: 'IotSceneLinkage.triggerCategoryDesc.timer' },
  'iot-alarm': { label: 'IotSceneLinkage.triggerCategory.iotAlarm', description: 'IotSceneLinkage.triggerCategoryDesc.iotAlarm' },
  'visual-alarm': { label: 'IotSceneLinkage.triggerCategory.visualAlarm', description: 'IotSceneLinkage.triggerCategoryDesc.visualAlarm' },
  'ai-event': { label: 'IotSceneLinkage.triggerCategory.aiEvent', description: 'IotSceneLinkage.triggerCategoryDesc.aiEvent' },
  manual: { label: 'IotSceneLinkage.triggerCategory.manual', description: 'IotSceneLinkage.triggerCategoryDesc.manual' },
} as const
// 快速配置的入口按用户场景排序；物联、视觉告警分别预设来源，但底层仍复用 alarm Provider。
const triggerOptions = computed(() => [
  { value: 'property', icon: 'RiseOutlined', provider: 'device', category: 'device' },
  { value: 'event', icon: 'NotificationOutlined', provider: 'device', category: 'device' },
  { value: 'online', icon: 'LoginOutlined', provider: 'device', category: 'device' },
  { value: 'offline', icon: 'LogoutOutlined', provider: 'device', category: 'device' },
  { value: 'state', icon: 'SyncOutlined', provider: 'device', category: 'device' },
  { value: 'repeat', icon: 'ClockCircleOutlined', provider: 'timer', category: 'timer' },
  { value: 'date', icon: 'CalendarOutlined', provider: 'timer', category: 'timer' },
  { value: 'interval', icon: 'SyncOutlined', provider: 'timer', category: 'timer' },
  { value: 'iot-alarm', icon: 'AlertOutlined', provider: 'alarm', category: 'iot-alarm' },
  { value: 'visual-alarm', icon: 'EyeOutlined', provider: 'alarm', category: 'visual-alarm' },
  { value: 'ai-event', icon: 'RadarChartOutlined', provider: 'ai-event', category: 'ai-event' },
  { value: 'manual', icon: 'ThunderboltOutlined', provider: 'manual', category: 'manual' },
].filter(item => supportedTriggers.value.includes(item.provider)).map(item => {
  const category = quickTriggerCategories[item.category as keyof typeof quickTriggerCategories]
  const kind = item.value === 'iot-alarm' || item.value === 'visual-alarm' ? 'alarm' : item.value
  return {
    ...item,
    label: t(`IotSceneLinkage.trigger.${kind}`),
    description: t(`IotSceneLinkage.triggerDesc.${kind}`),
    categoryLabel: t(category.label),
    categoryDescription: t(category.description),
  }
}))
const availableTriggerOptions = computed(() => addingMultiTrigger.value
  ? triggerOptions.value.filter(item => MULTI_TRIGGER_PROVIDERS.includes(item.provider as typeof MULTI_TRIGGER_PROVIDERS[number]))
  : triggerOptions.value)
const isActionSupported = (provider: string) => supportedActions.value.includes(provider)
const actionIcon = (type: string) => type === 'delay' ? 'ClockCircleOutlined' : 'ControlOutlined'
async function loadSceneProviders() { const [triggers, actions] = await Promise.all([querySceneSupportedTriggers(), querySceneSupportedActions()]); triggerProviders.value = normalizeResult(triggers).data; supportedTriggers.value = triggerProviders.value.map(item => item.provider); supportedActions.value = normalizeResult(actions).data.map((item: SceneProviderInfo) => item.provider) }
async function loadMetadata(open: boolean) { if (!open) return; if (!form.productId) { properties.value = []; events.value = []; return }; const response: any = await getProduct(form.productId); const metadata = typeof (response.result || response).metadata === 'string' ? JSON.parse((response.result || response).metadata) : (response.result || response).metadata || {}; properties.value = metadata.properties || []; events.value = metadata.events || [] }
function addMultiTrigger() { beginMultiTrigger(); if (addingMultiTrigger.value) triggerPickerVisible.value = true }
function cancelTriggerPicker() { resetMultiTriggerPicker(); triggerPickerVisible.value = false }
/** 设备触发在统一配置弹窗中编辑；取消时还原打开前的快速表单草稿。 */
function openScope(isNew = false) { deviceTriggerWasNew.value = isNew; deviceTriggerSnapshot.value = JSON.parse(JSON.stringify(form)); scopeVisible.value = true }
function cancelTriggerScope() {
  if (deviceTriggerWasNew.value) clearTrigger()
  else if (deviceTriggerSnapshot.value) Object.assign(form, deviceTriggerSnapshot.value)
  deviceTriggerSnapshot.value = undefined
  deviceTriggerWasNew.value = false
  scopeVisible.value = false
  if (form.productId) {
    void loadMetadata(true)
  }
}
/** Non-device triggers share the same modal commit boundary as device triggers. */
function openTriggerEditor(isNew = false) {
  triggerEditorWasNew.value = isNew
  triggerEditorSnapshot.value = JSON.parse(JSON.stringify(form)) as SceneLinkageForm
  triggerEditorVisible.value = true
}
function cancelTriggerEditor() {
  if (triggerEditorWasNew.value) clearTrigger()
  else if (triggerEditorSnapshot.value) Object.assign(form, triggerEditorSnapshot.value)
  triggerEditorSnapshot.value = undefined
  triggerEditorWasNew.value = false
  triggerEditorVisible.value = false
}
function saveTriggerEditor() {
  triggerEditorSnapshot.value = undefined
  triggerEditorWasNew.value = false
  triggerEditorVisible.value = false
}
/** 设备行是快速模式唯一的产品来源，切换设备时必须同步清空不属于新产品的物模型配置。 */
function selectTriggerDevice(device: { productId: string; productName: string }) {
  if (form.productId !== device.productId) {
    form.productId = device.productId
    form.productName = device.productName
    clearScope()
  }
  void loadMetadata(true)
}
function saveTriggerScope(scope: DeviceScope) {
  form.productId = scope.productId || form.productId
  form.productName = scope.productName || form.productName
  form.allDevices = false
  form.dynamicScope = false
  form.scopeOptions = { ...scope.options, names: scope.selectorValues.map(item => item.name || item.value) }
  form.deviceIds = scope.selectorValues.map(item => item.value)
  form.groupIds = []
  deviceTriggerSnapshot.value = undefined
  deviceTriggerWasNew.value = false
  scopeVisible.value = false
}
function applyAlarmSource(target: { alarm: SceneLinkageForm['alarm'] }, sourceKind: 'iot-device' | 'visual-ai') {
  target.alarm = {
    sourceKind,
    targetType: sourceKind === 'visual-ai' ? 'aiTaskMediaTarget' : undefined,
    modes: [],
    state: 'warning',
    options: {},
  }
}
function selectTrigger(value: QuickTriggerPickerKind) {
  const sourceKind = value === 'visual-alarm' ? 'visual-ai' : value === 'iot-alarm' ? 'iot-device' : undefined
  const kind = (sourceKind ? 'alarm' : value) as SceneTriggerKind
  const isAddingMultiTrigger = addingMultiTrigger.value
  if (!selectMultiTriggerKind(kind)) return
  // 组合条件选择后 hook 会清除添加状态；仍需按进入弹窗时的状态避免回写当前条件。
  if (!isAddingMultiTrigger) {
    form.triggerKind = kind
    if (sourceKind) applyAlarmSource(form, sourceKind)
  } else {
    const trigger = form.multiTriggers?.at(-1)
    if (sourceKind && trigger) applyAlarmSource(trigger, sourceKind)
    pendingMultiTriggerClientId.value = trigger?.clientId
  }
  validation.field = ''
  triggerPickerVisible.value = false
  if (!isAddingMultiTrigger && ['property', 'event', 'online', 'offline', 'state'].includes(kind)) void nextTick(() => openScope(true))
  else if (!isAddingMultiTrigger && kind !== 'manual') void nextTick(() => openTriggerEditor(true))
}
function selectTriggerFromPicker(value: string) { selectTrigger(value as QuickTriggerPickerKind) }
function clearTrigger() { if (isMulti.value) return; form.triggerKind = '' as SceneTriggerKind; form.productId = undefined; form.productName = undefined; form.deviceIds = []; form.groupIds = []; form.propertyId = undefined; form.eventId = undefined; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermValue = undefined; form.termValue = undefined; form.alarm = { modes: [] }; form.aiEvent = defaultForm().aiEvent; properties.value = []; events.value = []; validation.field = '' }
function resetRepeatSelections() { form.repeatWeekdays = []; form.repeatMonthDays = [] }
function changeRepeatCustomMode() { resetRepeatSelections() }
function updateTriggerProperty(value: string) { const property = propertyOptions.value.find(item => item.value === value); const termTypes = getTermTypes(property?.valueType); form.propertyName = property?.label || value; form.termType = termTypes.includes(form.termType) ? form.termType : termTypes[0]; form.termValue = undefined; if (value && hasError('property')) { validation.field = ''; validation.message = '' } }
function updateTriggerEvent(value: string) { form.eventName = eventOptions.value.find(item => item.value === value)?.label || value; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermType = 'eq'; form.eventTermValue = undefined }
function updateTriggerEventOutput(value: string) { const output = eventOutputOptions.value.find(item => item.value === value); const termTypes = getTermTypes(output?.valueType); form.eventOutputName = output?.label || value; form.eventTermType = termTypes.includes(form.eventTermType || '') ? form.eventTermType : termTypes[0]; form.eventTermValue = undefined }
function clearScope() { form.deviceIds = []; form.groupIds = []; form.propertyId = undefined; form.eventId = undefined; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermValue = undefined; properties.value = []; events.value = [] }
function addCondition(type: Exclude<SceneConditionForm['type'], 'alarmState'>) { if (type === 'timeRange') form.additionalConditions.push({ type, ranges: [{ start: '09:00', end: '18:00' }] }); else form.additionalConditions.push({ type, productId: '', selector: 'fixed', selectorValues: [], propertyId: '', termType: 'eq', value: '' }); autoOpenConditionIndex.value = form.additionalConditions.length - 1; conditionVisible.value = false }
function addAlarmCondition(sourceKind: 'iot-device' | 'visual-ai') { form.additionalConditions.push({ type: 'alarmState', alarm: { sourceKind, targetType: sourceKind === 'visual-ai' ? 'aiTaskMediaTarget' : undefined, modes: [], state: 'warning', options: {} } }); autoOpenConditionIndex.value = form.additionalConditions.length - 1; conditionVisible.value = false }
function updateCondition(index: number, condition: SceneConditionForm) { form.additionalConditions[index] = condition }
async function addNotifyAction() { await loadNotifyMethods(true); await loadNotifyUsers(true); form.actions.push({ type: 'sceneNotify', config: { userIds: [], notifyChannelIds: [] } }); autoOpenActionIndex.value = form.actions.length - 1; actionPickerVisible.value = false; clearActionValidationIfResolved() }
function addDelay() { form.actions.push({ type: 'delay', time: 1, unit: 'seconds' }); actionPickerVisible.value = false; clearActionValidationIfResolved() }
/** Keeps delay editing isolated until the dialog is explicitly confirmed. */
function openDelayEditor(index: number) {
  const action = form.actions[index]
  if (action?.type !== 'delay') return
  delayEditingIndex.value = index
  delayDraft.time = action.time
  delayDraft.unit = action.unit
  delayEditorVisible.value = true
}
function cancelDelayEditor() {
  delayEditorVisible.value = false
  delayEditingIndex.value = undefined
}
function saveDelayEditor() {
  const index = delayEditingIndex.value
  const action = index === undefined ? undefined : form.actions[index]
  if (!action || action.type !== 'delay') return
  form.actions[index] = { ...action, time: delayDraft.time, unit: delayDraft.unit }
  clearActionValidationIfResolved()
  cancelDelayEditor()
}
function openAction(type: 'device') { actionPickerVisible.value = false; form.actions.push({ type, config: { productId: '', selector: 'fixed', selectorValues: [], message: { messageType: 'READ_PROPERTY', properties: [] } } }); autoOpenActionIndex.value = form.actions.length - 1; clearActionValidationIfResolved() }
function updateAction(index: number, action: any) { form.actions[index] = action; clearActionValidationIfResolved() }
function clearValidationField(field: string) { if (hasError(field)) { validation.field = ''; validation.message = '' } }
function hasIncompleteDeviceAction(action: any) {
  if (action.type !== 'device') return false
  const message = action.config?.message || {}
  const operationId = message.messageType === 'INVOKE_FUNCTION'
    ? message.functionId
    : message.messageType === 'READ_PROPERTY'
      ? message.properties?.[0]
      : message.messageType === 'WRITE_PROPERTY'
        ? Object.keys(message.properties || {})[0]
        : undefined
  // Every device command needs its target thing-model entry; command type alone is not executable configuration.
  return !action.config?.productId
    || (action.config?.selector !== 'all' && !action.config?.selectorValues?.length)
    || !message.messageType
    || !operationId
}
function hasMissingWritePropertyValue(action: any) { return action.type === 'device' && action.config?.message?.messageType === 'WRITE_PROPERTY' && isEmptyValue(Object.values(action.config.message.properties || {})[0]) }
function hasIncompleteNotifyAction(action: any) { return action.type === 'sceneNotify' && (!action.config?.notifyChannelIds?.length || !action.config?.userIds?.length) }
function clearActionValidationIfResolved() {
  // 用户补齐当前错误对应的动作配置后，立即撤销红框和提示，避免旧校验状态滞留到下一次保存。
  if (hasError('action')) {
    if (validation.message === 'IotSceneLinkage.message.actionRequired' && form.actions.length) return clearValidationField('action')
    if (validation.message === 'IotSceneLinkage.message.deviceActionRequired' && !form.actions.some(hasIncompleteDeviceAction)) return clearValidationField('action')
    if (validation.message === 'IotSceneLinkage.message.deviceActionValueRequired' && !form.actions.some(hasMissingWritePropertyValue)) return clearValidationField('action')
  }
  if (hasError('notify') && !form.actions.some(hasIncompleteNotifyAction)) clearValidationField('notify')
}
async function changeNotifyMethod(index: number, method: SceneNotifyMethod) { await refreshNotifyTemplate(index, method, true) }
async function refreshNotifyTemplate(index: number, method: SceneNotifyMethod, changed = false) { const response: any = await querySceneNotifyChannelTemplates(method.providerId); const detail = response?.result ?? response; const item = detail?.channels?.find((channel: any) => channel.channel?.id === method.id); form.actions[index] = { ...form.actions[index], config: { ...form.actions[index].config, ...(changed ? { notifyChannelIds: [method.id] } : {}) }, options: { ...form.actions[index].options, channelName: method.name, templateContent: getTemplateContent(item?.template) } } }
function getTemplateContent(template: any) { const content = template?.template || {}; const getByPath = (source: any, path: string[]) => path.reduce((target, key) => target && typeof target === 'object' && !Array.isArray(target) ? target[key] : undefined, source); const asText = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''; const firstText = (...values: unknown[]) => values.map(asText).find(Boolean) || ''; return firstText(getByPath(content, ['message']), getByPath(content, ['ttsmessage']), getByPath(content, ['body']), getByPath(content, ['text', 'content']), getByPath(content, ['markdown', 'text']), getByPath(content, ['link', 'text']), getByPath(content, ['text'])) }
async function loadNotifyMethods(force = false) { if ((!force && notifyMethods.value.length) || notifyMethodsLoading.value) return; notifyMethodsLoading.value = true; try { const providers: any[] = normalizeResult(await querySceneNotifyChannels()).data; notifyMethods.value = providers.filter(provider => provider.provider === 'scene').flatMap(provider => (provider.channels || []).map((channel: any) => ({ id: channel.id, providerId: provider.id || provider.provider, name: channel.name || channel.channelProvider, channelProvider: channel.channelProvider }))).filter(method => method.id && method.providerId && method.channelProvider?.startsWith('notifier-')); } finally { notifyMethodsLoading.value = false } }
const selectedNotifyUserIds = () => [...new Set(form.actions
  .filter(action => action.type === 'sceneNotify')
  .flatMap(action => action.config?.userIds || [])
  .map(String)
  .filter(Boolean))]
const toSceneNotifyUsers = (users: any[]): SceneNotifyUser[] => users
  .map<SceneNotifyUser>(user => ({ id: String(user.id || ''), name: user.name, username: user.username, email: user.email, telephone: user.telephone }))
  .filter(user => Boolean(user.id))
const toSceneNotifyUser = (user: any): SceneNotifyUser | undefined =>
  toSceneNotifyUsers([user])[0]
const currentUserHasAvailableNotifyChannel = (user: SceneNotifyUser) =>
  notifyMethods.value.some(method => canReceiveProfileBackedNotification(user, method.channelProvider))
async function loadNotifyUsers(reset = true) {
  if (notifyUsersLoading.value || (!reset && notifyUsers.value.length >= notifyUsersTotal.value)) return
  const pageIndex = reset ? 0 : notifyUsersPageIndex.value + 1
  const userIds = selectedNotifyUserIds()
  notifyUsersLoading.value = true
  try {
    // Saved recipients may be outside the first dropdown page, so resolve them separately.
    const [pageResponse, selectedResponse, currentUserResponse] = await Promise.all([
      querySceneNotifyUsers({ pageIndex, pageSize: 20 }),
      reset && userIds.length
        ? querySceneNotifyUsers({ paging: false, userIds }).catch(() => undefined)
        : Promise.resolve(undefined),
      reset ? queryCurrentSceneNotifyUser().catch(() => undefined) : Promise.resolve(undefined),
    ])
    const page = normalizeResult(pageResponse)
    const selectedUsers = selectedResponse ? toSceneNotifyUsers(normalizeResult(selectedResponse).data) : []
    const currentUser = currentUserResponse
      ? toSceneNotifyUser(currentUserResponse.result ?? currentUserResponse)
      : undefined
    // Current-profile access is independent from user-management query permission; never use it to add another user.
    const currentUserOption = currentUser && (userIds.includes(currentUser.id) || currentUserHasAvailableNotifyChannel(currentUser))
      ? [currentUser]
      : []
    const retainedUsers = reset ? notifyUsers.value.filter(user => userIds.includes(user.id)) : notifyUsers.value
    notifyUsers.value = mergeNotifyUsersById(
      retainedUsers,
      mergeNotifyUsersById(currentUserOption, mergeNotifyUsersById(selectedUsers, toSceneNotifyUsers(page.data))),
    )
    notifyUsersPageIndex.value = pageIndex
    notifyUsersTotal.value = Number(page.total ?? pageIndex * 20 + page.data.length)
  } finally {
    notifyUsersLoading.value = false
  }
}
const isEmptyValue = (value: unknown) => value === undefined || value === null || value === ''
async function getMissingFunctionInputs(action: any) {
  const message = action.config?.message || {}
  if (message.messageType !== 'INVOKE_FUNCTION' || !action.config?.productId || !message.functionId) return []
  const response: any = await getProduct(action.config.productId)
  const product = response?.result ?? response
  const metadata = typeof product?.metadata === 'string' ? JSON.parse(product.metadata) : product?.metadata || {}
  const inputs = metadata.functions?.find((item: any) => item.id === message.functionId)?.inputs || []
  const values = new Map((message.inputs || []).map((input: any) => [input.name, input.value]))
  return inputs.filter((input: any) => input.expands?.required && isEmptyValue(values.get(input.id))).map((input: any) => input.name || input.id)
}
const isVisualAiAlarm = (alarm: SceneLinkageForm['alarm']) => alarm.sourceKind === 'visual-ai'
  || alarm.targetType === 'aiTaskMediaTarget'

const hasValidAlarmTrigger = (alarm: SceneLinkageForm['alarm']) => isVisualAiAlarm(alarm)
  ? Boolean(alarm.options?.sceneId && alarm.options?.taskTarget && alarm.alarmConfigId && alarm.modes.length)
  : Boolean(alarm.options?.productId && alarm.alarmConfigId && alarm.targetType && alarm.modes.length)
const hasValidAlarmStateCondition = (alarm: SceneLinkageForm['alarm']) => isVisualAiAlarm(alarm)
  ? Boolean(alarm.options?.sceneId && alarm.options?.taskTarget && alarm.alarmConfigId && alarm.state)
  : Boolean(alarm.options?.productId && alarm.alarmConfigId && alarm.state)
const hasValidAiEventTrigger = (aiEvent: SceneLinkageForm['aiEvent']) => Boolean(
  aiEvent.sceneId
  && aiEvent.taskTarget
  && (!aiEvent.condition
    || aiEvent.condition.termType === 'isnull'
    || !isEmptyValue(aiEvent.condition.value))
  && !aiEvent.mediaTargets?.some(target => target.unavailable),
)

async function validate() {
  const invalid = (field: string, message: string, params?: Record<string, unknown>) => {
    validation.field = field
    validation.message = message
    onlyMessage(t(message, params), 'warning')
    return false
  }
  if (!form.name?.trim()) return invalid('name', 'IotSceneLinkage.message.nameRequired')
  if (!hasTrigger.value) return invalid('trigger', 'IotSceneLinkage.message.triggerRequired')
  for (const trigger of form.multiTriggers || []) {
    const isDeviceTrigger = ['property', 'event', 'online', 'offline', 'state'].includes(trigger.triggerKind)
    if (isDeviceTrigger && !trigger.productId) return invalid('trigger', 'IotSceneLinkage.message.selectProductFirst')
    if (isDeviceTrigger && !trigger.allDevices && (trigger.dynamicScope ? !trigger.groupIds.length : !trigger.deviceIds.length)) return invalid('trigger', 'IotSceneLinkage.message.deviceRequired')
    if (trigger.triggerKind === 'alarm' && !hasValidAlarmTrigger(trigger.alarm)) return invalid('trigger', 'IotSceneLinkage.message.alarmTriggerRequired')
    if (trigger.triggerKind === 'ai-event' && !hasValidAiEventTrigger(trigger.aiEvent)) return invalid('trigger', 'IotSceneLinkage.message.aiEventTriggerRequired')
    if (trigger.triggerKind === 'property' && (!trigger.propertyId || trigger.termValue === undefined || trigger.termValue === '')) return invalid('trigger', 'IotSceneLinkage.message.propertyRequired')
    if (trigger.triggerKind === 'event' && !trigger.eventId) return invalid('trigger', 'IotSceneLinkage.message.eventRequired')
    if (trigger.triggerKind === 'date' && !trigger.dateTime) return invalid('trigger', 'IotSceneLinkage.message.dateRequired')
    if (trigger.triggerKind === 'repeat' && trigger.repeatMode === 'custom' && ((trigger.repeatCustomMode === 'weekly' && !trigger.repeatWeekdays.length) || (trigger.repeatCustomMode === 'monthly' && !trigger.repeatMonthDays.length))) return invalid('trigger', 'IotSceneLinkage.message.repeatDateRequired')
  }
  if (isDevice.value && !form.productId) return invalid('product', 'IotSceneLinkage.message.selectProductFirst')
  if (isDevice.value && !form.allDevices && (form.dynamicScope ? !form.groupIds.length : !form.deviceIds.length)) return invalid('scope', 'IotSceneLinkage.message.deviceRequired')
  if (form.triggerKind === 'alarm' && !hasValidAlarmTrigger(form.alarm)) return invalid('alarm', 'IotSceneLinkage.message.alarmTriggerRequired')
  if (form.triggerKind === 'ai-event' && !hasValidAiEventTrigger(form.aiEvent)) return invalid('trigger', 'IotSceneLinkage.message.aiEventTriggerRequired')
  if (form.triggerKind === 'property' && (!form.propertyId || form.termValue === undefined || form.termValue === '')) return invalid('property', 'IotSceneLinkage.message.propertyRequired')
  if (form.triggerKind === 'event' && !form.eventId) return invalid('event', 'IotSceneLinkage.message.eventRequired')
  if (form.triggerKind === 'date' && !form.dateTime) return invalid('date', 'IotSceneLinkage.message.dateRequired')
  if (form.triggerKind === 'repeat' && form.repeatMode === 'custom' && ((form.repeatCustomMode === 'weekly' && !form.repeatWeekdays.length) || (form.repeatCustomMode === 'monthly' && !form.repeatMonthDays.length))) return invalid('repeat', 'IotSceneLinkage.message.repeatDateRequired')
  if (form.additionalConditions.some(condition => condition.type === 'timeRange' && (condition.source !== 'effective-period' || form.debounceEnabled) && !condition.ranges.length)) return invalid('condition', 'IotSceneLinkage.message.timeRangeRequired')
  if (form.additionalConditions.some(condition => condition.type === 'timeRange' && (condition.source !== 'effective-period' || form.debounceEnabled) && condition.ranges.some(range => range.start === range.end))) return invalid('condition', 'IotSceneLinkage.message.timeRangeInvalid')
  if (form.additionalConditions.some(condition => condition.type === 'deviceProperty' && isEmptyValue(condition.value))) return invalid('condition', 'IotSceneLinkage.message.conditionValueRequired')
  if (!form.actions.length) return invalid('action', 'IotSceneLinkage.message.actionRequired')
  if (form.actions.some(hasIncompleteDeviceAction)) return invalid('action', 'IotSceneLinkage.message.deviceActionRequired')
  if (form.actions.some(hasMissingWritePropertyValue)) return invalid('action', 'IotSceneLinkage.message.deviceActionValueRequired')
  const missingFunctionInputs = (await Promise.all(form.actions.filter(action => action.type === 'device').map(getMissingFunctionInputs))).flat()
  if (missingFunctionInputs.length) return invalid('action', 'IotSceneLinkage.message.deviceFunctionInputRequired', { names: missingFunctionInputs.join('、') })
  if (form.actions.some(hasIncompleteNotifyAction)) return invalid('notify', 'IotSceneLinkage.message.notifyRequired')
  validation.field = ''
  validation.message = ''
  return true
}
/** 已有场景保存前重新读取后端数据，避免列表打开后被其他管理员改成不支持结构仍被覆盖。 */
async function ensureSceneCompatible(id: string) {
  const response = await getSceneDetail(id)
  const scene = response?.result || response
  if (hasUnsupportedLegacyAlarmAction(scene)) {
    onlyMessage(t('IotSceneLinkage.message.legacyConfigurationUnsupported'), 'warning')
    return false
  }
  const compatibility = getSceneCompatibility(scene)
  if (compatibility.supported) return true
  onlyMessage(t(compatibility.reason || 'IotSceneLinkage.message.unsupportedRule'), 'warning')
  return false
}

const getEditorModeValue = (value: unknown): SceneEditorMode | undefined => {
  const selected = typeof value === 'string' ? value : (value as any)?.target?.value
  return selected === 'quick' || selected === 'detail' ? selected : undefined
}

/**
 * 快速编辑草稿首次进入详细模式时，生成完整规则草稿；后续切回详细模式恢复会话草稿，
 * 不能以快速表单覆盖用户尚未保存的详细配置。
 */
async function switchFromQuick(value: unknown) {
  const mode = getEditorModeValue(value)
  if (mode !== 'detail' || saving.value) return
  if (!hasDetailedSession.value) {
    // 快速模式尚未选择触发条件时，不能调用其请求构建器；该构建器会按历史兼容逻辑落为定时触发。
    const quickRule = hasTrigger.value
      ? buildRequest({ ...form, editorMode: 'detail' }, await resolveSceneConditionColumns(form))
      : {
          name: form.name,
          description: form.description,
          trigger: {},
          branches: [],
          options: {},
        }
    const detailedRule = mergeDetailedDraft(originalSnapshot.value, quickRule)
    // 无过滤条件的快速规则进入详细模式时，统一为原版“执行：开 + 待填写条件”的编辑态。
    canonicalDraft.value = hasTrigger.value
      ? prepareQuickRuleForDetailedEditing(detailedRule)
      : detailedRule
    hasDetailedSession.value = true
  }
  editorMode.value = 'detail'
}

function switchFromDetailed(mode: SceneEditorMode, detailedDraft: SceneRuleRecord) {
  if (mode !== 'quick' || saving.value) return
  Modal.confirm({
    title: t('IotSceneLinkage.confirm.resetQuickTitle'),
    content: t('IotSceneLinkage.confirm.resetQuickContent'),
    okText: t('IotSceneLinkage.action.confirm'),
    cancelText: t('IotSceneLinkage.action.cancel'),
    onOk: () => {
      const next = defaultForm()
      next.id = detailedDraft.id || form.id
      next.name = detailedDraft.name || form.name
      next.description = detailedDraft.description || form.description
      next.triggerKind = '' as SceneTriggerKind
      next.editorMode = 'quick'
      Object.assign(form, next)
      // 重新填写快速模式时不能再与原详细树合并，否则已确认清空的配置会被带回。
      quickProjectionBase.value = {
        id: next.id,
        name: next.name,
        description: next.description,
        options: { editorMode: 'quick' },
      }
      canonicalDraft.value = quickProjectionBase.value
      hasDetailedSession.value = false
      quickResetFromDetailed.value = true
      editorMode.value = 'quick'
    },
  })
}

/** 快速和详细模式最终都只提交统一规则树。 */
async function persistCanonicalDraft(scene: SceneRuleRecord) {
  if (form.id) {
    await updateSceneLinkage(form.id, scene)
    return
  }
  await createSceneLinkage(scene)
}

async function saveDetailed(scene: SceneRuleRecord) {
  if (hasUnsupportedLegacyAlarmAction(scene)) {
    onlyMessage(t('IotSceneLinkage.message.legacyConfigurationUnsupported'), 'warning')
    return
  }
  saving.value = true
  try {
    const request = mergeDetailedDraft(originalSnapshot.value, scene)
    request.id = form.id || request.id
    canonicalDraft.value = request
    await persistCanonicalDraft(request)
    onlyMessage(t('IotSceneLinkage.message.saved', { name: request.name }), 'success')
    menuStore.jumpPage(sceneRouteKey.value)
  } finally {
    saving.value = false
  }
}

async function save() {
  if (form.id && !quickResetFromDetailed.value && !await ensureSceneCompatible(form.id)) return
  if (form.additionalConditions.some(condition => condition.type === 'alarmState' && !hasValidAlarmStateCondition(condition.alarm))) {
    validation.field = 'condition'
    validation.message = 'IotSceneLinkage.message.alarmTriggerRequired'
    onlyMessage(t(validation.message), 'warning')
    return
  }
  if (!await validate()) return
  saving.value = true
  try {
    const conditionColumns = await resolveSceneConditionColumns(form)
    const deviceConditionCount = form.additionalConditions.filter(condition => condition.type === 'deviceProperty').length
    const alarmStateConditionCount = form.additionalConditions.filter(condition => condition.type === 'alarmState').length
    if ((deviceConditionCount && conditionColumns.devicePropertyColumns?.filter(Boolean).length !== deviceConditionCount)
      || (alarmStateConditionCount && conditionColumns.alarmStateColumns?.filter(Boolean).length !== alarmStateConditionCount)) {
      validation.field = 'condition'
      validation.message = 'IotSceneLinkage.message.conditionColumnUnavailable'
      onlyMessage(t(validation.message), 'warning')
      return
    }
    const scene = mergeQuickDraft(quickProjectionBase.value, buildRequest(form, conditionColumns))
    canonicalDraft.value = scene
    await persistCanonicalDraft(scene)
    onlyMessage(t('IotSceneLinkage.message.saved', { name: form.name }), 'success')
    menuStore.jumpPage(sceneRouteKey.value)
  } finally {
    saving.value = false
  }
}
watch(() => form.repeatMode, (_value, previous) => { if (!loadingScene.value && previous) resetRepeatSelections() })
watch(() => form.name, value => { if (value.trim() && hasError('name')) { validation.field = ''; validation.message = '' } })
watch(() => [form.propertyId, form.termValue], ([propertyId, termValue]) => { if (propertyId && termValue !== undefined && termValue !== null && termValue !== '' && hasError('property')) { validation.field = ''; validation.message = '' } })
watch(() => form.actions, clearActionValidationIfResolved, { deep: true })
// Keep persisted weekly or monthly selections while the edit form is being populated.
async function init() {
  await loadSceneProviders()
  const id = String(route.params.id || '')
  if (!id) {
    form.triggerKind = '' as SceneTriggerKind
    // 新建始终从当前低门槛快速模式开始；仅没有 editorMode 的历史数据按部署类型选择入口。
    editorMode.value = 'quick'
    canonicalDraft.value = { name: form.name, description: form.description, options: {} }
    quickProjectionBase.value = {}
    hasDetailedSession.value = editorMode.value === 'detail'
    loadingScene.value = false
    return
  }
  const data: any = await getSceneDetail(id)
  const scene = data.result || data
  legacyAlarmActionReadOnly.value = hasUnsupportedLegacyAlarmAction(scene)
  originalSnapshot.value = scene
  quickProjectionBase.value = scene
  editorMode.value = resolveInitialEditorMode(scene)
  canonicalDraft.value = scene
  hasDetailedSession.value = editorMode.value === 'detail'
  Object.assign(form, toForm(scene))
  if (form.productId) {
    const response: any = await getProduct(form.productId)
    const product = response.result || response
    form.productName ||= product.name || form.productId
    await loadMetadata(true)
  }
  await nextTick()
  loadingScene.value = false
  if (form.actions.some(action => action.type === 'sceneNotify')) {
    await loadNotifyMethods()
    await loadNotifyUsers()
    await Promise.all(form.actions.map((action, index) => {
      const method = action.type === 'sceneNotify' ? notifyMethods.value.find(item => item.id === action.config?.notifyChannelIds?.[0]) : undefined
      return method ? refreshNotifyTemplate(index, method) : undefined
    }))
  }
}
init()
</script>
<style src="./SceneLinkageEditor.css"></style>
