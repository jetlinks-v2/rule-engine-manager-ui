<template>
	<j-page-container>
		<a-spin v-if="loadingScene" class="scene-editor__loading" />
		<DetailedSceneEditor
			v-else-if="editorMode === 'detail'"
			:rule="canonicalDraft"
			:show-mode-switch="showEditorModeSwitch"
			:supported-triggers="supportedTriggers"
			:trigger-providers="triggerProviders"
			:locked-trigger-providers="lockedTriggerProviders"
			:locked-trigger-root="lockedTriggerRoot"
			:saving="saving"
			:save-permission="savePermission"
			@cancel="menuStore.jumpPage(sceneRouteKey)"
			@save="saveDetailed"
			@switch-mode="switchFromDetailed"
		/>
		<main v-else class="scene-editor">
			<PageHeader
				show-back
					class="scene-editor__page-header"
					:title="$t('IotSceneLinkage.action.backToSceneList')"
					@back="menuStore.jumpPage(sceneRouteKey)"
			>
				<template #actions>
					<div v-if="showEditorModeSwitch" class="scene-editor__header-actions">
						<a-radio-group :value="editorMode" button-style="solid" @change="switchFromQuick">
							<a-radio-button value="quick">{{ $t('IotSceneLinkage.editor.quickMode') }}</a-radio-button>
							<a-radio-button value="detail">{{ $t('IotSceneLinkage.editor.detailMode') }}</a-radio-button>
						</a-radio-group>
					</div>
				</template>
			</PageHeader>
			<div class="scene-editor__workspace">
				<aside class="scene-editor__sidebar">
					<section class="scene-editor__sidebar-section scene-editor__scene-meta">
						<label class="scene-editor__sidebar-label"><span class="scene-editor__required">*</span>{{ $t('IotSceneLinkage.form.sceneName') }}</label>
						<a-input v-model:value="form.name"
						         :class="['scene-editor__name', { 'scene-editor__invalid': hasError('name') }]"
						         :placeholder="$t('IotSceneLinkage.placeholder.editorName')"/>
						<span v-if="hasError('name')" class="scene-editor__name-error">{{ errorMessage('name') }}</span>
						<div class="scene-editor__scene-meta-description">
							<label class="scene-editor__sidebar-label">{{ $t('IotSceneLinkage.form.description') }}</label>
							<a-textarea v-model:value="form.description" :auto-size="{ minRows: 2, maxRows: 3 }" :placeholder="$t('IotSceneLinkage.placeholder.description')"/>
						</div>
					</section>
					<section v-if="isMulti || form.triggerKind !== 'state'" class="scene-editor__sidebar-section scene-editor__debounce-panel">
						<div class="scene-editor__sidebar-title">
							<span>{{ $t('IotSceneLinkage.debounce.enable') }} <a-tooltip :title="$t('IotSceneLinkage.debounce.hint')"><AIcon class="scene-editor__debounce-help" type="QuestionCircleOutlined"/></a-tooltip></span>
							<a-switch v-model:checked="form.debounceEnabled"/>
						</div>
						<a-alert v-if="hasAiEventRecognitionRule" class="scene-editor__debounce-conflict" type="error" show-icon :message="$t('IotSceneLinkage.debounce.aiEventConflict')" />
						<template v-if="form.debounceEnabled">
							<div class="scene-editor__sidebar-field">
								<label>{{ $t('IotSceneLinkage.debounce.effectivePeriod') }}</label>
								<EffectivePeriodSelect v-model="timeRangeCondition"/>
								<small>{{ effectivePeriodHint }}</small>
							</div>
							<div class="scene-editor__sidebar-field">
								<label>{{ $t('IotSceneLinkage.debounce.frequency') }}</label>
								<a-select v-model:value="debounceIntervalPreset" :disabled="hasAiEventRecognitionRule" :options="debouncePresetOptions"/>
								<small :class="{ 'scene-editor__field-warning': hasAiEventRecognitionRule }">{{ hasAiEventRecognitionRule ? $t('IotSceneLinkage.debounce.aiEventConflict') : debounceFrequencyHint }}</small>
							</div>
							<div class="scene-editor__sidebar-field">
								<label>{{ $t('IotSceneLinkage.debounce.continuous') }}</label>
								<a-select v-model:value="debounceContinuousPreset" :disabled="hasAiEventRecognitionRule" :options="debouncePresetOptions"/>
								<small :class="{ 'scene-editor__field-warning': hasAiEventRecognitionRule }">{{ hasAiEventRecognitionRule ? $t('IotSceneLinkage.debounce.aiEventConflict') : debounceContinuousHint }}</small>
							</div>
						</template>
					</section>
				</aside>
				<div class="scene-editor__content">
					<RulePreviewCard>
						<SceneRuleSummary :form="form" :users="notifyUsers" @change="form.summary = $event" @title-change="form.summaryTitle = $event"/>
					</RulePreviewCard>
			<section :class="['scene-editor__section scene-editor__rule-group scene-editor__rule-group--trigger', { 'scene-editor__multi-trigger': isMulti }]">
				<header class="scene-editor__rule-group-header"><span class="scene-editor__rule-group-icon"><AIcon type="ThunderboltOutlined"/></span><div><h3>{{ $t('IotSceneLinkage.editor.triggerSectionTitle') }}</h3><p>{{ $t('IotSceneLinkage.editor.triggerGroupDescription') }}</p></div></header>
				<div class="scene-editor__rule-group-body">
					<template v-if="isMulti"><MultiTriggerCard v-for="(item, index) in form.multiTriggers" :key="item.clientId" :trigger="item" :index="index" :removable="isEditing || form.multiTriggers.length > 1" :auto-open="pendingMultiTriggerClientId === item.clientId" @opened="pendingMultiTriggerClientId = undefined" @cancel-new="removeMultiTrigger(index)" @remove="removeMultiTrigger(index)"/></template>
					<SceneNodeCard v-else-if="hasTrigger" :class="{ 'scene-editor__invalid': hasError('trigger') }" variant="trigger" :title="triggerNodeTitle(form.triggerKind, t)" :number="$t('IotSceneLinkage.editor.conditionNumber', { index: 1 })">
						<template #icon><span class="scene-editor__trigger-icon" :style="{ color: form.triggerKind === 'ai-event' ? '#1E5EFF' : triggerIcon.color, background: form.triggerKind === 'ai-event' ? '#E8F0FF' : triggerIcon.background }"><svg v-if="triggerIcon.path" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path :d="triggerIcon.path"/></svg><AIcon v-else :type="form.triggerKind === 'ai-event' ? 'RadarChartOutlined' : triggerIcon.type"/></span></template>
						<template #actions><span class="scene-editor__rule-card-actions"><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button v-if="isDevice || form.triggerKind !== 'manual'" type="text" @click="isDevice ? openScope() : openTriggerEditor()"><AIcon type="EditOutlined"/></a-button></a-tooltip><a-button type="text" danger @click="clearTrigger"><AIcon type="DeleteOutlined"/></a-button></span></template>
						<SceneTriggerSummary :form="form" />
					</SceneNodeCard>
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
					<SceneNodeCard v-else :title="$t(`IotSceneLinkage.action.${action.type}`)" :icon="actionIcon(action.type)" :number="index + 1">
						<template #actions><span class="scene-editor__rule-card-actions"><a-tooltip v-if="action.type === 'delay'" :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openDelayEditor(index)"><AIcon type="EditOutlined"/></a-button></a-tooltip><a-button type="text" danger @click="form.actions.splice(index, 1)"><AIcon type="DeleteOutlined"/></a-button></span></template>
						<SceneActionSummary v-if="action.type === 'delay'" :action="{ executor: 'delay', delay: action }" />
					</SceneNodeCard>
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
			<SceneEditorFooter>
				<a-button @click="menuStore.jumpPage(sceneRouteKey)">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
				<j-permission-button type="primary" :hasPermission="savePermission" :loading="saving" @click="save">{{
						$t('IotSceneLinkage.action.saveScene')
					}}
				</j-permission-button>
			</SceneEditorFooter>
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
		                  :validate="validateDeviceTrigger"
		                  @cancel="cancelTriggerScope" @select-device="selectTriggerDevice" @save="saveTriggerScope">
			<template #configuration="{ hasSelection }">
				<div class="scene-editor__device-trigger-config">
					<a-form layout="vertical">
						<template v-if="hasSelection">
							<a-form-item :label="$t('IotSceneLinkage.form.triggerType')">
								<a-select class="scene-editor__device-trigger-type" :value="form.triggerKind" :options="deviceTriggerKinds" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="false" @change="changeDeviceTriggerKind">
									<template #option="option"><div class="scene-editor__device-trigger-option"><span><AIcon :type="optionValue(option).icon" /></span><div><b>{{ optionValue(option).label }}</b><small>{{ optionValue(option).description }}</small></div></div></template>
								</a-select>
							</a-form-item>
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
			<template #preview><SceneTriggerSummary :form="form" /></template>
		</DeviceScopeModal>
		<AlarmStateConditionModal
			v-if="form.triggerKind === 'alarm'"
			:open="triggerEditorVisible"
			:source-kind="form.alarm.sourceKind === 'visual-ai' ? 'visual-ai' : 'iot-device'"
			mode="trigger"
			:model-value="form.alarm"
			@update:model-value="form.alarm = $event"
			@cancel="cancelTriggerEditor"
			@save="saveTriggerEditor"
		/>
		<AiEventTriggerRow
			v-else-if="form.triggerKind === 'ai-event'"
			:open="triggerEditorVisible"
			:model-value="form.aiEvent"
			@confirm="confirmAiEventTrigger"
			@cancel="cancelTriggerEditor"
		/>
		<a-modal v-else :open="triggerEditorVisible" :width="isTimerTrigger ? 640 : 720" :mask-closable="false" @cancel="cancelTriggerEditor" @ok="saveTriggerEditor">
			<template #title>
				<div v-if="isTimerTrigger" class="scene-editor__timer-modal-title"><strong>{{ $t('IotSceneLinkage.triggerCategory.timer') }}</strong><small>{{ $t('IotSceneLinkage.triggerCategoryDesc.timer') }}</small></div>
				<span v-else>{{ triggerText }}</span>
			</template>
			<div class="scene-editor__trigger-editor">
				<template v-if="isTimerTrigger">
					<section class="scene-editor__timer-methods">
						<label>{{ $t('IotSceneLinkage.timer.executionMethod') }}</label>
						<div class="scene-editor__timer-method-list">
							<button v-for="item in timerMethodOptions" :key="item.value" type="button" :class="['scene-editor__timer-method', { 'is-selected': form.triggerKind === item.value }]" @click="changeTimerTriggerKindValue(item.value)"><span><AIcon :type="item.icon" /></span><b>{{ item.label }}</b><small>{{ item.description }}</small><AIcon v-if="form.triggerKind === item.value" class="scene-editor__timer-method-check" type="CheckCircleFilled" /></button>
						</div>
					</section>
					<section class="scene-editor__timer-fields">
					<template v-if="form.triggerKind === 'repeat'">
						<label>{{ $t('IotSceneLinkage.timer.repeatFrequency') }}</label>
					<a-radio-group v-model:value="form.repeatMode">
						<a-radio-button value="daily">{{ $t('IotSceneLinkage.repeat.daily') }}</a-radio-button>
						<a-radio-button value="weekdays">{{ $t('IotSceneLinkage.repeat.weekdays') }}</a-radio-button>
						<a-radio-button value="weekends">{{ $t('IotSceneLinkage.repeat.weekends') }}</a-radio-button>
						<a-radio-button value="custom">{{ $t('IotSceneLinkage.repeat.custom') }}</a-radio-button>
					</a-radio-group>
					<a-time-picker v-model:value="repeatTime" :class="{ 'scene-editor__invalid': hasError('repeat') }" format="HH:mm" value-format="HH:mm"/>
						<small>{{ $t('IotSceneLinkage.timer.repeatTimeHint') }}</small>
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
						<label>{{ $t('IotSceneLinkage.timer.executionTime') }}</label>
					<a-date-picker v-model:value="form.dateTime" :class="{ 'scene-editor__invalid': hasError('date') }" show-time value-format="YYYY-MM-DD HH:mm:ss"/>
					<small>{{ $t('IotSceneLinkage.editor.dateExecutionHint') }}</small>
					</template>
					<template v-else>
						<label>{{ $t('IotSceneLinkage.timer.intervalFrequency') }}</label>
					<div class="scene-editor__timer-interval-input"><span>{{ $t('IotSceneLinkage.editor.every') }}</span><a-input-number v-model:value="form.interval" :min="1"/><a-select v-model:value="form.intervalUnit" popup-class-name="scene-editor__compact-dropdown" :dropdown-match-select-width="false" :options="units"/><span>{{ $t('IotSceneLinkage.editor.triggerOnce') }}</span></div>
					<small>{{ $t('IotSceneLinkage.timer.intervalDescription') }}</small>
					</template>
					</section>
					<div class="scene-editor__timer-preview">
						<span>{{ $t('IotSceneLinkage.timer.triggerRule') }}</span>
						<strong>{{ timerEditorSummary }}</strong>
					</div>
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
import SceneEditorFooter from './components/SceneEditorFooter.vue'
import SceneTriggerSummary from './components/SceneTriggerSummary.vue'
import SceneActionSummary from './components/SceneActionSummary.vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Modal } from 'ant-design-vue'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { isPrivateDeployment } from '@jetlinks-web-core/utils/deployment'
import { createSceneLinkage, getProduct, getSceneDetail, queryCurrentSceneNotifyUser, queryProtocolUnits, querySceneNotifyChannelTemplates, querySceneNotifyChannels, querySceneNotifyUsers, querySceneSupportedActions, querySceneSupportedTriggers, updateSceneLinkage, type SceneNotifyMethod, type SceneNotifyUser, type SceneProviderInfo } from '../../../api/scene-linkage'
import { canReceiveProfileBackedNotification, mergeNotifyUsersById } from '../../../utils/notifyUser'
import { applyMultiTriggerForm, buildRequest, defaultForm, formatSceneDuration, MULTI_TRIGGER_PROVIDERS, normalizeResult, toForm, type SceneConditionForm, type SceneEditorMode, type SceneLinkageForm, type SceneMultiTriggerForm, type SceneTimeRange, type SceneTriggerKind } from '../utils'
import DetailedSceneEditor from './detail/DetailedSceneEditor.vue'
import { createClearedDetailedDraft, mergeDetailedDraft, mergeQuickDraft, resolveInitialEditorMode, resolveLockedTriggerProviders, type SceneRuleRecord } from './editorMode'
import { requiresSceneNotifyTemplate, toSceneNotifyMethods } from '../../../utils/sceneNotify'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from './alarm/IotAlarmTargetSelect.vue'
import { getSceneCompatibility } from '../sceneCompatibility'
import { SCENE_TRIGGER_CATEGORIES } from './triggerPickerOptions'
import { hasUnsupportedLegacyAction, hasUnsupportedLegacyAlarmAction } from '../sceneRule'
import ActionPickerModal from './components/ActionPickerModal.vue'
import ConditionPickerModal from './components/ConditionPickerModal.vue'
import DeviceActionRow from './components/DeviceActionRow.vue'
import SceneNodeCard from './components/SceneNodeCard.vue'
import { triggerNodeTitle } from './triggerNodeSummary'
import DeviceStateTriggerRow from './components/DeviceStateTriggerRow.vue'
import DeviceScopeModal, { type DeviceScope } from './components/DeviceScopeModal.vue'
import MultiTriggerCard from './components/MultiTriggerCard.vue'
import SceneConditionRow from './components/SceneConditionRow.vue'
import AlarmStateConditionModal from './components/AlarmStateConditionModal.vue'
import AiEventTriggerRow from './components/AiEventTriggerRow.vue'
import NotifyActionRow from './components/NotifyActionRow.vue'
import RulePreviewCard from './components/RulePreviewCard.vue'
import SceneRuleSummary from './components/SceneRuleSummary.vue'
import EffectivePeriodSelect from './components/EffectivePeriodSelect.vue'
import ThingModelSelect from './components/ThingModelSelect.vue'
import ThingModelValueInput from './components/ThingModelValueInput.vue'
import TriggerPickerModal from './components/TriggerPickerModal.vue'
import { formatDeviceScopeText, formatDeviceScopeTitle, formatProductScopeText, toTriggerScopeValue } from './deviceScopeLabel'
import { resolveSceneConditionColumns } from './sceneConditionColumns'
import { getTermTypes, setThingModelUnitNames, toThingModelOptions } from './thingModel'
import { useMultiSceneTrigger } from './useMultiSceneTrigger'
import { PageHeader } from '@jetlinks-web-core/components'
import { useScenePermission } from '@rule-engine-manager-ui/hook/usePermission'
import { useMenuStore } from '@jetlinks-web-core/store/menu'
const notifyUsersPageIndex = ref(-1)
const notifyUsersTotal = ref(0)
// 编辑器由 SaaS 与私有化两套菜单进入，新增和编辑分别对应各自菜单的动作码。
const sceneRoutePermissionKey = computed(() => String(route.name || permissionKey).replace(/\/Editor$/, ''))
const savePermission = computed(() => `${sceneRoutePermissionKey.value}:${route.params.id ? 'update' : 'add'}`)
// SaaS 只提供标准化的快速配置；详细规则仅在私有化部署中开放。
const showEditorModeSwitch = isPrivateDeployment()
// 新编辑路由按当前菜单分别使用 SaaS 的 add/update 与私有化菜单的 add/update 动作权限。
const route = useRoute(); const { t } = useI18n(); const permissionKey = useScenePermission(); const menuStore = useMenuStore(); const sceneRouteKey = computed(() => String(route.name || permissionKey).replace(/\/Editor$/, '')); const form = reactive<SceneLinkageForm>(defaultForm()); const properties = ref<any[]>([]); const events = ref<any[]>([]); const saving = ref(false); const triggerPickerVisible = ref(false); const actionPickerVisible = ref(false); const scopeVisible = ref(false); const conditionVisible = ref(false); const delayEditorVisible = ref(false); const delayEditingIndex = ref<number>(); const delayCreating = ref(false); const delayDraft = reactive({ time: 1, unit: 'seconds' }); const autoOpenActionIndex = ref<number>(); const autoOpenConditionIndex = ref<number>(); const notifyMethods = ref<SceneNotifyMethod[]>([]); const notifyUsers = ref<SceneNotifyUser[]>([]); const notifyMethodsLoading = ref(false); const notifyUsersLoading = ref(false); const supportedTriggers = ref<string[]>([]); const triggerProviders = ref<SceneProviderInfo[]>([]); const supportedActions = ref<string[]>([]); const validation = reactive({ field: '', message: '' });
// 新建也需等待能力清单初始化，避免用户切到详细模式后被 init 的默认值覆盖。
const loadingScene = ref(true); const editorMode = ref<SceneEditorMode>('quick'); const originalSnapshot = ref<SceneRuleRecord>({}); const quickProjectionBase = ref<SceneRuleRecord>({}); const canonicalDraft = ref<SceneRuleRecord>({}); const quickResetFromDetailed = ref(false); const legacyAlarmActionReadOnly = ref(false)
// 编辑态允许重配触发器的具体条件，但 Provider 必须保持为首次保存时的类型。
const lockedTriggerProviders = computed(() => route.params.id
  ? resolveLockedTriggerProviders(originalSnapshot.value)
  : [])
const lockedTriggerRoot = computed(() => route.params.id
  ? String(originalSnapshot.value.triggerType || originalSnapshot.value.trigger?.type || '')
  : '')
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
const hasAiEventRecognitionRule = computed(() => form.triggerKind === 'ai-event' && Boolean(form.aiEvent.recognitionRule))
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
const { activeMultiTriggerIndex, addingMultiTrigger, isMulti, showMultiTriggerControl, multiTriggerDisabledReason, canAddMultiTrigger, addMultiTrigger: beginMultiTrigger, cancelTriggerPicker: resetMultiTriggerPicker, removeMultiTrigger, selectMultiTrigger, selectTrigger: selectMultiTriggerKind } = useMultiSceneTrigger(form, supportedTriggers, () => { void loadMetadata(true) }, () => Boolean(route.params.id), clearTrigger)
const hasTrigger = computed(() => Boolean(form.triggerKind)); const isEditing = computed(() => Boolean(route.params.id)); const isDevice = computed(() => ['property', 'event', 'online', 'offline', 'state'].includes(form.triggerKind)); const repeatTime = computed({ get: () => form.repeatTime, set: (value: string) => form.repeatTime = value }); const units = computed(() => ['seconds', 'minutes', 'hours'].map(value => ({ value, label: t(`IotSceneLinkage.unit.${value}`) }))); const weekOptions = computed(() => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => ({ value: index + 1, label: t(`IotSceneLinkage.weekday.${day}`) }))); const monthDayOptions = computed(() => Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: t('IotSceneLinkage.monthDay', { day: index + 1 }) }))); const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property')); const eventOptions = computed(() => toThingModelOptions(events.value, 'event')); const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === form.propertyId)); const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) }))); const triggerText = computed(() => hasTrigger.value ? t(`IotSceneLinkage.trigger.${form.triggerKind}`) : t('IotSceneLinkage.rule.noTrigger')); const actionText = computed(() => form.actions.length ? form.actions.map(action => t(`IotSceneLinkage.action.${action.type}`)).join('、') : t('IotSceneLinkage.rule.noAction')); const scopeText = computed(() => formatDeviceScopeText(t, toTriggerScopeValue(form), { emptyText: t('IotSceneLinkage.placeholder.device') })); const scopeTitle = computed(() => formatDeviceScopeTitle(t, toTriggerScopeValue(form), { emptyText: t('IotSceneLinkage.placeholder.device') })); const triggerIcon = computed(() => ({ manual: { background: '#F2F3F5', color: '#4E5969', path: 'M9 1.5 3 9h4l-1 5.5L12 7H8l1-5.5Z' }, repeat: { background: '#E8F0FF', color: '#1E5EFF', path: 'M8 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM8 4.5V8l2.5 1.5' }, date: { background: '#E6F5EE', color: '#0E8A5F', path: 'M2.5 3.5h11v10h-11ZM2.5 6.5h11M5.5 1.5v3M10.5 1.5v3' }, interval: { background: '#EFEBFF', color: '#6C4FE0', path: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3' }, property: { background: '#E6F5EE', color: '#0E8A5F', path: 'M2 12l3.5-3.5 2.5 2.5L14 5M14 5h-3.5M14 5v3.5' }, event: { background: '#FFECF0', color: '#D02F5A', path: 'M1.5 8h3L6 4l3 8 1.5-4h4' }, online: { background: '#E6F5EE', color: '#0E8A5F', type: 'LoginOutlined' }, offline: { background: '#F2F3F5', color: '#4E5969', type: 'LogoutOutlined' }, state: { background: '#EFEBFF', color: '#6C4FE0', type: 'SyncOutlined' }, alarm: { background: '#FFF1F0', color: '#FF4D4F', type: 'AlertOutlined' } }[form.triggerKind] || { background: '#F2F3F5', color: '#4E5969', type: 'ThunderboltOutlined' })); const hasError = (field: string) => validation.field === field; const errorMessage = (field: string) => hasError(field) ? t(validation.message) : ''
const isTimerTrigger = computed(() => ['repeat', 'interval', 'date'].includes(form.triggerKind))
const timerMethodOptions = computed(() => [
  { value: 'repeat', icon: 'CalendarOutlined', label: t('IotSceneLinkage.timer.fixed'), description: t('IotSceneLinkage.timer.fixedDescription') },
  { value: 'interval', icon: 'SyncOutlined', label: t('IotSceneLinkage.timer.interval'), description: t('IotSceneLinkage.timer.intervalDescription') },
  { value: 'date', icon: 'ClockCircleOutlined', label: t('IotSceneLinkage.timer.once'), description: t('IotSceneLinkage.timer.onceDescription') },
])
const timerEditorSummary = computed(() => {
  if (form.triggerKind === 'date') return form.dateTime || t('IotSceneLinkage.editor.dateExecutionHint')
  if (form.triggerKind === 'interval') return t('IotSceneLinkage.summary.interval', {
    time: form.interval,
    unit: t(`IotSceneLinkage.unit.${form.intervalUnit}`),
  })
  const repeat = form.repeatMode === 'custom'
    ? `${t(`IotSceneLinkage.repeat.${form.repeatCustomMode}`)} ${(
      form.repeatCustomMode === 'weekly' ? form.repeatWeekdays : form.repeatMonthDays
    ).join('、')}`
    : t(`IotSceneLinkage.repeat.${form.repeatMode}`)
  return [repeat, form.repeatTime].filter(Boolean).join(' ')
})
const deviceTriggerKinds = computed(() => [
  ['property', 'RiseOutlined'], ['event', 'NotificationOutlined'], ['online', 'LoginOutlined'], ['offline', 'LogoutOutlined'], ['state', 'SyncOutlined'],
].map(([value, icon]) => ({ value, icon, label: t(`IotSceneLinkage.trigger.${value}`), description: t(`IotSceneLinkage.triggerDesc.${value}`) })))
const deviceTriggerSnapshot = ref<SceneLinkageForm>()
const deviceTriggerWasNew = ref(false)
const pendingMultiTriggerClientId = ref<string>()
const triggerEditorVisible = ref(false)
const triggerEditorSnapshot = ref<SceneLinkageForm>()
const triggerEditorWasNew = ref(false)
const triggerForms = computed(() => isMulti.value ? form.multiTriggers || [] : [form])
const selectedEvent = computed(() => events.value.find(item => item.id === form.eventId))
const eventOutputOptions = computed(() => {
  const outputs = selectedEvent.value?.outputs || selectedEvent.value?.output?.properties || selectedEvent.value?.output || selectedEvent.value?.valueType?.properties || []
  return toThingModelOptions(Array.isArray(outputs) ? outputs : [], 'property')
})
const selectedEventOutput = computed(() => eventOutputOptions.value.find(item => item.value === form.eventOutputId))
const eventTermOptions = computed(() => getTermTypes(selectedEventOutput.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const scopeDialogTitle = computed(() => t('IotSceneLinkage.title.selectDevices'))
type QuickTriggerPickerKind = SceneTriggerKind | 'iot-alarm' | 'visual-alarm'
const quickTriggerCategories = SCENE_TRIGGER_CATEGORIES
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
    // 编辑态仍展示全部触发器入口，避免用户误以为能力消失；不兼容 Provider 仅禁止选择。
    disabled: Boolean(lockedTriggerProviders.value.length && !lockedTriggerProviders.value.includes(item.provider)),
    disabledReason: 'IotSceneLinkage.message.triggerProviderLocked',
  }
}))
const availableTriggerOptions = computed(() => {
  const options = addingMultiTrigger.value
    ? triggerOptions.value.map(item => MULTI_TRIGGER_PROVIDERS.some(provider => provider === item.provider)
      ? item
      : { ...item, disabled: true, disabledReason: 'IotSceneLinkage.message.multiTriggerProviderUnsupported' })
    : triggerOptions.value
  return options
})
const isActionSupported = (provider: string) => supportedActions.value.includes(provider)
const actionIcon = (type: string) => type === 'delay' ? 'ClockCircleOutlined' : 'ControlOutlined'
async function loadSceneProviders() { const [triggers, actions] = await Promise.all([querySceneSupportedTriggers(), querySceneSupportedActions()]); triggerProviders.value = normalizeResult(triggers).data; supportedTriggers.value = triggerProviders.value.map(item => item.provider); supportedActions.value = normalizeResult(actions).data.map((item: SceneProviderInfo) => item.provider) }
async function loadThingModelUnits() { const response: any = await queryProtocolUnits(); const units = Array.isArray(response) ? response : response?.result; if (Array.isArray(units)) setThingModelUnitNames(units) }
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
/** Switching a device trigger type preserves the selected device but discards incompatible thing-model fields. */
function changeDeviceTriggerKind(value: unknown) {
  if (!['property', 'event', 'online', 'offline', 'state'].includes(String(value))) return
  if (form.triggerKind === value) return
  form.triggerKind = value as SceneTriggerKind
  form.propertyId = undefined
  form.propertyName = undefined
  form.termValue = undefined
  form.eventId = undefined
  form.eventName = undefined
  form.eventOutputId = undefined
  form.eventOutputName = undefined
  form.eventTermValue = undefined
}
function optionValue(option: any) { return option?.data?.value ? option.data : option }
/** The three timer shapes share one dialog and keep the existing timer serialization unchanged. */
function changeTimerTriggerKind(event: { target?: { value?: unknown } }) {
  const value = event.target?.value
  if (value === 'repeat' || value === 'interval' || value === 'date') form.triggerKind = value
}
function changeTimerTriggerKindValue(value: string) {
  if (value === 'repeat' || value === 'interval' || value === 'date') form.triggerKind = value
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
/** Keep incomplete thing-model selections inside the device shell instead of creating an invalid rule card. */
function validateDeviceTrigger() {
  if (form.triggerKind === 'property' && (!form.propertyId || form.termValue === undefined || form.termValue === '')) {
    onlyMessage(t('IotSceneLinkage.message.propertyRequired'), 'warning')
    return false
  }
  if (form.triggerKind === 'event' && !form.eventId) {
    onlyMessage(t('IotSceneLinkage.message.eventRequired'), 'warning')
    return false
  }
  return true
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
  const option = triggerOptions.value.find(item => item.value === value)
  // 选择器已过滤；此处仍校验，避免组件回调或旧弹窗状态绕过编辑态的触发类型锁。
  if (lockedTriggerProviders.value.length && (!option || !lockedTriggerProviders.value.includes(option.provider))) return
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
/** 视觉识别规则与通用防抖共用后端 ShakeLimit；确认后只清除频率限制，保留独立生效时段。 */
function confirmAiEventTrigger(value: SceneLinkageForm['aiEvent']) {
  const apply = () => {
    form.aiEvent = value
    form.debounceLimitEnabled = false
    saveTriggerEditor()
  }
  if (value.recognitionRule && form.debounceLimitEnabled) {
    Modal.confirm({
      title: t('IotSceneLinkage.confirm.aiEventDebounceTitle'),
      content: t('IotSceneLinkage.confirm.aiEventDebounceContent'),
      okText: t('IotSceneLinkage.action.confirm'),
      cancelText: t('IotSceneLinkage.action.cancel'),
      onOk: apply,
      onCancel: cancelTriggerEditor,
    })
    return
  }
  form.aiEvent = value
  saveTriggerEditor()
}
function clearTrigger() { form.multiTriggers = undefined; form.triggerKind = '' as SceneTriggerKind; form.productId = undefined; form.productName = undefined; form.deviceIds = []; form.groupIds = []; form.propertyId = undefined; form.eventId = undefined; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermValue = undefined; form.termValue = undefined; form.alarm = { modes: [] }; form.aiEvent = defaultForm().aiEvent; properties.value = []; events.value = []; validation.field = '' }
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
/** A new delay stays outside the form until its configuration is explicitly confirmed. */
function addDelay() {
  delayCreating.value = true
  delayEditingIndex.value = undefined
  delayDraft.time = 1
  delayDraft.unit = 'seconds'
  actionPickerVisible.value = false
  delayEditorVisible.value = true
}
/** Keeps delay editing isolated until the dialog is explicitly confirmed. */
function openDelayEditor(index: number) {
  const action = form.actions[index]
  if (action?.type !== 'delay') return
  delayEditingIndex.value = index
  delayCreating.value = false
  delayDraft.time = action.time
  delayDraft.unit = action.unit
  delayEditorVisible.value = true
}
function cancelDelayEditor() {
  delayEditorVisible.value = false
  delayEditingIndex.value = undefined
  delayCreating.value = false
}
function saveDelayEditor() {
  const index = delayEditingIndex.value
  if (delayCreating.value) {
    form.actions.push({ type: 'delay', time: delayDraft.time, unit: delayDraft.unit })
    clearActionValidationIfResolved()
    cancelDelayEditor()
    return
  }
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
async function refreshNotifyTemplate(index: number, method: SceneNotifyMethod, changed = false) {
  let template: any
  if (requiresSceneNotifyTemplate(method.channelProvider)) {
    const response: any = await querySceneNotifyChannelTemplates(method.providerId)
    const detail = response?.result ?? response
    template = detail?.channels?.find((channel: any) => channel.channel?.id === method.id)?.template
  }
  form.actions[index] = {
    ...form.actions[index],
    config: { ...form.actions[index].config, ...(changed ? { notifyChannelIds: [method.id] } : {}) },
    // 通知动作只缓存展示需要的模板信息，变量名称来自通知模板本身，避免把变量 ID 暴露到快速配置中。
    options: {
      ...form.actions[index].options,
      channelName: method.name,
      templateContent: getTemplateContent(template),
      templateVariables: getTemplateVariables(template),
    },
  }
}

function getTemplateContent(template: any) {
  const content = template?.template || {}
  const getByPath = (source: any, path: string[]) => path.reduce((target, key) => target && typeof target === 'object' && !Array.isArray(target) ? target[key] : undefined, source)
  const asText = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  const firstText = (...values: unknown[]) => values.map(asText).find(Boolean) || ''
  return firstText(
    getByPath(content, ['message']), getByPath(content, ['ttsmessage']), getByPath(content, ['body']),
    getByPath(content, ['text', 'content']), getByPath(content, ['markdown', 'text']),
    getByPath(content, ['link', 'text']), getByPath(content, ['text']),
  )
}

function getTemplateVariables(template: any) {
  const variables = Array.isArray(template?.variableDefinitions) ? template.variableDefinitions : []
  return variables
    .filter((variable: any) => variable?.id)
    .map((variable: any) => ({ id: String(variable.id), name: variable.name, i18nName: variable.i18nName }))
}
async function loadNotifyMethods(force = false) { if ((!force && notifyMethods.value.length) || notifyMethodsLoading.value) return; notifyMethodsLoading.value = true; try { const providers: any[] = normalizeResult(await querySceneNotifyChannels()).data; notifyMethods.value = toSceneNotifyMethods(providers); } finally { notifyMethodsLoading.value = false } }
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
  && aiEvent.mediaTargets?.length === 1
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
  if (hasUnsupportedLegacyAction(scene)) {
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

/** 确认切换后清空目标详细草稿，不再尝试把快速规则反向投影为原版规则树。 */
function switchFromQuick(value: unknown) {
  const mode = getEditorModeValue(value)
  if (mode !== 'detail' || saving.value) return
  // 名称和说明不属于规则配置；空草稿直接切换，保留原有低打断体验。
  if (!hasQuickConfiguration()) {
    resetDetailedDraft()
    return
  }
  Modal.confirm({
    title: t('IotSceneLinkage.confirm.resetQuickTitle'),
    content: t('IotSceneLinkage.confirm.resetQuickContent'),
    okText: t('IotSceneLinkage.action.confirm'),
    cancelText: t('IotSceneLinkage.action.cancel'),
    onOk: () => resetDetailedDraft(),
  })
}

function switchFromDetailed(mode: SceneEditorMode, detailedDraft: SceneRuleRecord) {
  if (mode !== 'quick' || saving.value) return
  if (!hasDetailedConfiguration(detailedDraft)) {
    resetQuickDraft(detailedDraft)
    return
  }
  Modal.confirm({
    title: t('IotSceneLinkage.confirm.resetQuickTitle'),
    content: t('IotSceneLinkage.confirm.resetQuickContent'),
    okText: t('IotSceneLinkage.action.confirm'),
    cancelText: t('IotSceneLinkage.action.cancel'),
    onOk: () => resetQuickDraft(detailedDraft),
  })
}

/** 名称和说明以外的快速模式输入才视为需要用户确认丢弃的规则配置。 */
function hasQuickConfiguration() {
  return Boolean(form.triggerKind || form.additionalConditions.length || form.actions.length || form.debounceEnabled)
}

/** 原版详细编辑器会初始化空分支和条件占位；只有真实内容才需要切换确认。 */
function hasDetailedConfiguration(draft: SceneRuleRecord) {
  if (draft.triggerType || draft.trigger?.type) return true
  return (draft.branches || []).some((branch: SceneRuleRecord) => {
    const hasAction = (branch.then || []).some((group: SceneRuleRecord) => (group.actions || []).length)
    const hasCondition = (branch.when || []).some((condition: SceneRuleRecord) => (condition.terms || []).some((term: SceneRuleRecord) => term.column || term.value?.value !== undefined))
    return hasAction || hasCondition || branch.shakeLimit?.enabled
  })
}

/** 清空目标详细草稿；编辑态的 Provider 锁保留在加载快照中而非草稿内。 */
function resetDetailedDraft() {
  canonicalDraft.value = createClearedDetailedDraft({
    id: form.id,
    name: form.name,
    description: form.description,
  })
  quickResetFromDetailed.value = false
  editorMode.value = 'detail'
}

/** 清空目标快速草稿而非投影详细规则，防止已确认清除的分支在保存时回流。 */
function resetQuickDraft(detailedDraft: SceneRuleRecord) {
  const next = defaultForm()
  next.id = detailedDraft.id || form.id
  next.name = detailedDraft.name || form.name
  // 说明允许被主动清空；只有历史数据未带此字段时才沿用当前快速草稿的值。
  next.description = typeof detailedDraft.description === 'string' ? detailedDraft.description : form.description
  next.triggerKind = '' as SceneTriggerKind
  next.editorMode = 'quick'
  Object.assign(form, next)
  quickProjectionBase.value = {
    id: next.id,
    name: next.name,
    description: next.description,
    options: { editorMode: 'quick' },
  }
  canonicalDraft.value = quickProjectionBase.value
  quickResetFromDetailed.value = true
  editorMode.value = 'quick'
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
  if (hasUnsupportedLegacyAction(scene)) {
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
  } catch {
    // 请求层统一提示保存错误；保留当前草稿供重试，避免异步事件产生未处理的拒绝。
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
  } catch {
    // 请求层统一提示保存错误；保留当前草稿供重试，避免异步事件产生未处理的拒绝。
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
  await Promise.all([loadSceneProviders(), loadThingModelUnits().catch(() => undefined)])
  const id = String(route.params.id || '')
  if (!id) {
    form.triggerKind = '' as SceneTriggerKind
    // 新建始终从当前低门槛快速模式开始；仅没有 editorMode 的历史数据按部署类型选择入口。
    editorMode.value = 'quick'
    canonicalDraft.value = { name: form.name, description: form.description, options: {} }
    quickProjectionBase.value = {}
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
  Object.assign(form, toForm(scene))
  if (form.productId) {
    const response: any = await getProduct(form.productId)
    const product = response.result || response
    form.productName ||= product.name || form.productId
    // 旧详细规则未保存产品名称时，复用本次产品查询补齐展示元数据，不解析旧汇总文案。
    if (scene.trigger?.type === 'device' && !scene.options?.trigger?.productName) {
      canonicalDraft.value = { ...scene, options: { ...scene.options, trigger: { ...scene.options?.trigger, productName: form.productName } } }
    }
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
