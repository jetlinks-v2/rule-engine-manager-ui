<template>
	<j-page-container>
		<a-spin v-if="loadingScene" class="scene-editor__loading" />
		<main v-else class="scene-editor">
			<PageHeader
				show-back
					:title="route.params.id ? $t('IotSceneLinkage.title.editRule') : $t('IotSceneLinkage.title.addRule')"
			>
				<template #description>
					<div v-if="hasRuleContent" class="scene-editor__summary">
						<SceneRuleSummary :form="form" :users="notifyUsers" @change="form.summary = $event" @title-change="form.summaryTitle = $event"/>
					</div>
				</template>
				<template #actions>
					<div class="scene-editor__header-actions">
						<a-button @click="menuStore.jumpPage(sceneRouteKey)">{{ $t('IotSceneLinkage.action.cancel') }}</a-button>
						<j-permission-button type="primary" :hasPermission="`${permissionKey}:update`" :loading="saving" @click="save">{{
								$t('IotSceneLinkage.action.saveScene')
							}}
						</j-permission-button>
					</div>
				</template>
			</PageHeader>
			<header class="scene-editor__header">
				<div class="scene-editor__field scene-editor__name-field">
						{{ $t('IotSceneLinkage.form.sceneName') }}
					<a-input v-model:value="form.name"
					         :class="['scene-editor__name', { 'scene-editor__invalid': hasError('name') }]"
					         :placeholder="$t('IotSceneLinkage.placeholder.editorName')"/>
					<span v-if="hasError('name')" class="scene-editor__name-error">{{ errorMessage('name') }}</span></div>
			</header>

			<section :class="['scene-editor__section', { 'scene-editor__multi-trigger': isMulti }]">
				<h3><i class="scene-editor__marker scene-editor__marker--trigger"/>{{ $t('IotSceneLinkage.rule.when') }}<small>{{
						$t('IotSceneLinkage.editor.triggerHint')
					}}</small></h3>
				<template v-if="!hasTrigger">
					<a-button block :class="['scene-editor__add', { 'scene-editor__invalid': hasError('trigger') }]"
					          @click="triggerPickerVisible = true">
						<AIcon type="PlusOutlined"/>
						{{ $t('IotSceneLinkage.editor.addTrigger') }}
					</a-button>
					<p v-if="hasError('trigger')" class="scene-editor__error-message">{{ errorMessage('trigger') }}</p></template>
				<template v-else>
					<template v-if="isMulti">
						<MultiTriggerCard v-for="(item, index) in form.multiTriggers" :key="item.clientId" :trigger="item"
						                  :removable="form.multiTriggers.length > 1" @remove="removeMultiTrigger(index)"/>
						<a-tooltip v-if="showMultiTriggerControl"
						           :title="multiTriggerDisabledReason ? $t(multiTriggerDisabledReason) : undefined"><span
							class="scene-editor__multi-trigger-add"><a-button block class="scene-editor__add"
						                                                    :disabled="!canAddMultiTrigger"
						                                                    @click="addMultiTrigger"><AIcon
							type="PlusOutlined"/>{{ $t('IotSceneLinkage.editor.addAnotherTrigger') }}</a-button></span></a-tooltip>
					</template>
					<template v-else>
						<template v-for="(item, index) in triggerForms" :key="index">
							<template v-if="!isMulti || index === activeMultiTriggerIndex">
								<div :class="['scene-editor__trigger-card', { 'scene-editor__invalid': hasError('trigger') }]">
									<div
									:class="['scene-editor__trigger-row', { 'scene-editor__trigger-row--property': form.triggerKind === 'property', 'scene-editor__trigger-row--device': ['property', 'event'].includes(form.triggerKind), 'scene-editor__trigger-row--state': form.triggerKind === 'state', 'scene-editor__trigger-row--interval': form.triggerKind === 'interval', 'scene-editor__trigger-row--alarm': form.triggerKind === 'alarm', 'scene-editor__trigger-row--ai-event': form.triggerKind === 'ai-event' }]">
										<span class="scene-editor__trigger-icon"
										      :style="{ color: form.triggerKind === 'ai-event' ? '#1E5EFF' : triggerIcon.color, background: form.triggerKind === 'ai-event' ? '#E8F0FF' : triggerIcon.background }"><svg
											v-if="triggerIcon.path" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path
											:d="triggerIcon.path"/></svg><AIcon v-else :type="form.triggerKind === 'ai-event' ? 'RadarChartOutlined' : triggerIcon.type"/></span><b>{{
											triggerText
										}}</b>
										<template v-if="isDevice">
											<IotAlarmTargetSelect v-model="form.productId"
											                      :class="['scene-editor__product-select', { 'scene-editor__invalid': hasError('product') }]"
											                      :request="requestProducts" :selected-option="selectedProductOption"
											                      :placeholder="$t('IotSceneLinkage.placeholder.product')" rich
											                      @change="onProductChange"/>
											<a-button :class="['scene-editor__scope', { 'scene-editor__invalid': hasError('scope') }]"
											          :title="scopeTitle"
											          @click="openScope">
												<AIcon type="AimOutlined"/>
												{{ scopeText }}
											</a-button>
											<div v-if="form.triggerKind === 'property'" class="scene-editor__trigger-condition">
												<span>{{ $t('IotSceneLinkage.condition.current') }}</span>
												<ThingModelSelect v-model="form.propertyId"
												                  :class="['scene-editor__thing-model-select', { 'scene-editor__invalid': hasError('property') }]"
												                  :options="propertyOptions" @change="updateTriggerProperty"
												                  @dropdownVisibleChange="loadMetadata"/>
												<a-select v-model:value="form.termType" class="scene-editor__term-type" :options="termOptions"/>
												<ThingModelValueInput v-model="form.termValue"
												                      :class="{ 'scene-editor__invalid': hasError('property') }"
												                      :value-type="selectedProperty?.valueType"/>
											</div>
											<div v-else-if="form.triggerKind === 'event'" class="scene-editor__trigger-condition">
												<span>{{ $t('IotSceneLinkage.rule.when') }}</span>
												<ThingModelSelect v-model="form.eventId"
												                  :class="['scene-editor__thing-model-select', 'scene-editor__event-select', { 'scene-editor__invalid': hasError('event') }]"
												                  :options="eventOptions" @change="updateTriggerEvent"
												                  @dropdownVisibleChange="loadMetadata"/>
												<template v-if="form.eventId"><span>{{ $t('IotSceneLinkage.condition.eventOutput') }}</span>
													<ThingModelSelect v-model="form.eventOutputId" class="scene-editor__event-output-select"
													                  :options="eventOutputOptions"
													                  :placeholder="$t('IotSceneLinkage.placeholder.thingModel')"
													                  @change="updateTriggerEventOutput"/>
													<a-select v-model:value="form.eventTermType" class="scene-editor__event-term-type"
													          :options="eventTermOptions"/>
													<ThingModelValueInput v-model="form.eventTermValue" class="scene-editor__event-term-value"
													                      :value-type="selectedEventOutput?.valueType"/>
												</template>
											</div>
											<DeviceStateTriggerRow v-else-if="form.triggerKind === 'state'" v-model:state="form.deviceState"
											                       v-model:mode="form.deviceStateTriggerMode"
											                       v-model:sustained-time="form.deviceStateSustainedTime"
											                       :removable="!isEditing" @remove="clearTrigger"/>
										</template>
										<AlarmTriggerSourceRow v-else-if="form.triggerKind === 'alarm'" v-model="form.alarm"/>
										<AiEventTriggerRow v-else-if="form.triggerKind === 'ai-event'" v-model="form.aiEvent"/>
										<template v-else-if="form.triggerKind === 'repeat'">
											<a-radio-group v-model:value="form.repeatMode">
												<a-radio-button value="daily">{{ $t('IotSceneLinkage.repeat.daily') }}</a-radio-button>
												<a-radio-button value="weekdays">{{ $t('IotSceneLinkage.repeat.weekdays') }}</a-radio-button>
												<a-radio-button value="weekends">{{ $t('IotSceneLinkage.repeat.weekends') }}</a-radio-button>
												<a-radio-button value="custom">{{ $t('IotSceneLinkage.repeat.custom') }}</a-radio-button>
											</a-radio-group>
											<a-time-picker v-model:value="repeatTime" :class="{ 'scene-editor__invalid': hasError('repeat') }"
											               format="HH:mm" value-format="HH:mm"/>
										</template>
										<template v-else-if="form.triggerKind === 'date'">
											<a-date-picker v-model:value="form.dateTime"
											               :class="{ 'scene-editor__invalid': hasError('date') }" show-time
											               value-format="YYYY-MM-DD HH:mm:ss"/>
											<span>{{ $t('IotSceneLinkage.editor.dateExecutionHint') }}</span></template>
										<template v-else-if="form.triggerKind === 'interval'">
											<a-input-number v-model:value="form.interval" :min="1"/>
											<a-select v-model:value="form.intervalUnit" :options="units"/>
										</template>
										<a-button
											v-if="!isEditing && form.triggerKind !== 'state' && !(form.triggerKind === 'repeat' && form.repeatMode === 'custom')"
											class="scene-editor__remove" type="text" danger @click="clearTrigger">
											<AIcon type="DeleteOutlined"/>
										</a-button>
									</div>
									<div v-if="form.triggerKind === 'repeat' && form.repeatMode === 'custom'"
									     :class="['scene-editor__custom-repeat', { 'scene-editor__invalid': hasError('repeat') }]">
										<a-radio-group v-model:value="form.repeatCustomMode" @change="changeRepeatCustomMode">
											<a-radio-button value="weekly">{{ $t('IotSceneLinkage.repeat.weekly') }}</a-radio-button>
											<a-radio-button value="monthly">{{ $t('IotSceneLinkage.repeat.monthly') }}</a-radio-button>
										</a-radio-group>
										<a-checkbox-group v-if="form.repeatCustomMode === 'weekly'" v-model:value="form.repeatWeekdays"
										                  class="scene-editor__repeat-options" :options="weekOptions"/>
										<a-checkbox-group v-else v-model:value="form.repeatMonthDays"
										                  class="scene-editor__repeat-options scene-editor__month-days"
										                  :options="monthDayOptions"/>
										<a-button v-if="!isEditing" class="scene-editor__remove" type="text" danger @click="clearTrigger">
											<AIcon type="DeleteOutlined"/>
										</a-button>
									</div>
									<p v-if="['product', 'scope', 'property', 'event', 'repeat', 'date'].includes(validation.field)"
									   class="scene-editor__error-message">{{ errorMessage(validation.field) }}</p></div>
							</template>
							<div v-if="isMulti && index !== activeMultiTriggerIndex" class="scene-editor__multi-trigger-card"
							     @click="selectMultiTrigger(index)">
								<span>{{ multiTriggerDescription(item) }}</span>
								<a-popconfirm v-if="form.multiTriggers && form.multiTriggers.length > 1"
								              :title="$t('IotSceneLinkage.confirm.removeMultiTrigger')"
								              @confirm="removeMultiTrigger(index)">
									<a-button danger type="text" @click.stop>
										<AIcon type="DeleteOutlined"/>
										{{ $t('IotSceneLinkage.action.delete') }}
									</a-button>
								</a-popconfirm>
							</div>
							<div
								v-if="isMulti && index === activeMultiTriggerIndex && form.multiTriggers && form.multiTriggers.length > 1"
								class="scene-editor__multi-trigger-remove">
								<a-popconfirm :title="$t('IotSceneLinkage.confirm.removeMultiTrigger')"
								              @confirm="removeMultiTrigger(index)">
									<a-button danger type="text">
										<AIcon type="DeleteOutlined"/>
										{{ $t('IotSceneLinkage.action.delete') }}
									</a-button>
								</a-popconfirm>
							</div>
						</template>
						<a-tooltip v-if="showMultiTriggerControl"
						           :title="multiTriggerDisabledReason ? $t(multiTriggerDisabledReason) : undefined"><span
							class="scene-editor__multi-trigger-add"><a-button block class="scene-editor__add"
						                                                    :disabled="!canAddMultiTrigger"
						                                                    @click="addMultiTrigger"><AIcon
							type="PlusOutlined"/>{{ $t('IotSceneLinkage.editor.addAnotherTrigger') }}</a-button></span></a-tooltip>
					</template>
				</template>
			</section>
			<section v-if="form.additionalConditions.length" class="scene-editor__section scene-editor__conditions">
				<h3><i class="scene-editor__marker scene-editor__marker--condition"/>{{ $t('IotSceneLinkage.rule.and') }}<small>{{
						$t('IotSceneLinkage.editor.conditionHint')
					}}</small></h3>
				<SceneConditionRow v-for="(item, index) in form.additionalConditions" :key="index" :condition="item"
				                   :index="index"
				                   :invalid="hasError('condition') && item.type === 'timeRange' && ['IotSceneLinkage.message.timeRangeRequired', 'IotSceneLinkage.message.timeRangeInvalid'].includes(validation.message)"
				                   :error-message="errorMessage('condition')" @update="updateCondition(index, $event)"
				                   @remove="form.additionalConditions.splice(index, 1)"/>
				<a-button type="text" class="scene-editor__extra-condition-add" @click="conditionVisible = true">
					<AIcon type="PlusOutlined"/>
					{{ $t('IotSceneLinkage.editor.addCondition') }}
				</a-button>
			</section>
			<a-button v-else-if="hasTrigger" type="text" class="scene-editor__extra-condition-add"
			          @click="conditionVisible = true">
				<AIcon type="PlusOutlined"/>
				{{ $t('IotSceneLinkage.editor.addCondition') }}
			</a-button>
			<section
				:class="['scene-editor__section', { 'scene-editor__invalid': hasError('action') || hasError('notify') }]">
				<h3><i class="scene-editor__marker scene-editor__marker--action"/>{{
						$t('IotSceneLinkage.rule.then')
					}}<small>{{ $t('IotSceneLinkage.editor.actionHint') }}</small></h3>
				<template v-for="(action, index) in form.actions" :key="index">
					<NotifyActionRow
						v-if="action.type === 'sceneNotify'"
						:action="action"
						:index="index"
						:methods="notifyMethods"
						:users="notifyUsers"
						:methods-loading="notifyMethodsLoading"
						:users-loading="notifyUsersLoading"
						:invalid="hasError('notify') && (!action.config?.notifyChannelIds?.length || !action.config?.userIds?.length)"
						@change="updateAction(index, $event)"
						@method-change="changeNotifyMethod(index, $event)"
						@load-users="loadNotifyUsers"
						@load-more-users="loadNotifyUsers(false)"
						@remove="form.actions.splice(index, 1)"
					/>
					<DeviceActionRow v-else-if="action.type === 'device'" :action="action" :index="index"
					                 @update="updateAction(index, $event)" @remove="form.actions.splice(index, 1)"/>
					<div v-else class="scene-editor__action scene-editor__action-row">
						<span class="scene-editor__action-index">{{ index + 1 }}</span>
						<span class="scene-editor__action-icon"><AIcon :type="actionIcon(action.type)"/></span>
						<b>{{ $t(`IotSceneLinkage.action.${action.type}`) }}</b>
						<a-input-number v-if="action.type === 'delay'" v-model:value="action.time" :min="1"/>
						<a-select v-if="action.type === 'delay'" v-model:value="action.unit" class="scene-editor__delay-unit"
						          :options="units"/>
						<a-button class="scene-editor__remove" type="text" danger @click="form.actions.splice(index, 1)">
							<AIcon type="DeleteOutlined"/>
						</a-button>
					</div>
				</template>
				<a-button block
				          :class="['scene-editor__add', { 'scene-editor__invalid': hasError('action') || hasError('notify') }]"
				          @click="actionPickerVisible = true">
					<AIcon type="PlusOutlined"/>
					{{ $t('IotSceneLinkage.editor.addAction') }}
				</a-button>
				<p v-if="hasError('action') || hasError('notify')" class="scene-editor__error-message">
					{{ errorMessage(validation.field) }}</p>
			</section>
			<section v-if="isMulti || form.triggerKind !== 'state'" class="scene-editor__advanced"
			         @click="advancedExpanded = !advancedExpanded"><i
				class="scene-editor__marker"/>{{ $t('IotSceneLinkage.editor.advanced') }}<i
				class="scene-editor__advanced-toggle">
				<AIcon :type="advancedExpanded ? 'UpOutlined' : 'DownOutlined'"/>
			</i>
				<div v-if="advancedExpanded" class="scene-editor__advanced-content" @click.stop>
					<div class="scene-editor__debounce"><b>{{ $t('IotSceneLinkage.debounce.enable') }}</b>
						<a-switch v-model:checked="form.debounceEnabled"/>
						<template v-if="form.debounceEnabled">
							<a-radio-group v-model:value="form.debounceMode">
								<a-radio value="continuous">{{ $t('IotSceneLinkage.debounce.continuous') }}</a-radio>
								<a-radio value="interval">{{ $t('IotSceneLinkage.debounce.interval') }}</a-radio>
							</a-radio-group>
							<a-input-number v-model:value="form.debounceTime" :min="1" :precision="0"/>
							<em class="scene-editor__advanced-unit">{{ $t('IotSceneLinkage.unit.seconds') }}</em><small
							class="scene-editor__advanced-hint">{{
								$t(form.debounceMode === 'continuous' ? 'IotSceneLinkage.debounce.continuousHint' : 'IotSceneLinkage.debounce.intervalHint')
							}}</small></template>
					</div>
				</div>
			</section>
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
		<DeviceScopeModal :open="scopeVisible" :product-id="form.productId"
		                  :model-value="{ selector: form.allDevices ? 'all' : form.dynamicScope ? form.dynamicScopeType : 'fixed', selectorValues: form.dynamicScope ? form.groupIds.map(value => ({ value })) : form.deviceIds.map((value, index) => ({ value, name: form.scopeOptions.names?.[index] })), options: form.scopeOptions }"
		                  @cancel="scopeVisible = false" @save="saveTriggerScope"/>
		<ConditionPickerModal :open="conditionVisible" @cancel="conditionVisible = false" @select="addCondition"/>
	</j-page-container>
</template>
<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { createSceneLinkage, getProduct, getSceneDetail, queryDevices, queryProducts, querySceneNotifyChannelTemplates, querySceneNotifyChannels, querySceneNotifyUsers, querySceneSupportedActions, querySceneSupportedTriggers, updateSceneLinkage, type SceneNotifyMethod, type SceneNotifyUser, type SceneProviderInfo } from '../../../api/scene-linkage'
import { queryDeviceBoundGroups_api, queryDeviceGroupDetailList_api, queryDeviceSpaceAreaBindings_api, queryProjectSpaceAreaSettings_api } from '../../../api/scene-resources'
import { mergeNotifyUsersById } from '../../../utils/notifyUser'
import IotAlarmTargetSelect, { type IotAlarmTargetSelectOption, type IotAlarmTargetSelectQuery } from './alarm/IotAlarmTargetSelect.vue'
import { applyMultiTriggerForm, buildRequest, defaultForm, normalizeResult, toForm, type SceneConditionForm, type SceneLinkageForm, type SceneMultiTriggerForm, type SceneTriggerKind } from '../utils'
import { getSceneCompatibility } from '../sceneCompatibility'
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
// 新编辑路由仍复用标品菜单的 update 动作权限，避免迁移后绕过原有授权。
const route = useRoute(); const { t } = useI18n(); const permissionKey = useScenePermission(); const menuStore = useMenuStore(); const sceneRouteKey = computed(() => String(route.name || permissionKey).replace(/\/Editor$/, '')); const form = reactive<SceneLinkageForm>(defaultForm()); const selectedProductOption = ref<IotAlarmTargetSelectOption>(); const devices = ref<any[]>([]); const properties = ref<any[]>([]); const events = ref<any[]>([]); const scopeOptions = ref<any[]>([]); const scopeTreeData = ref<any[]>([]); const scopeExpandedKeys = ref<string[]>([]); const scopeLoading = ref(false); const scopeNodeMap = new Map<string, any>(); const saving = ref(false); const triggerPickerVisible = ref(false); const actionPickerVisible = ref(false); const scopeVisible = ref(false); const conditionVisible = ref(false); const advancedExpanded = ref(false); const notifyMethods = ref<SceneNotifyMethod[]>([]); const notifyUsers = ref<SceneNotifyUser[]>([]); const notifyMethodsLoading = ref(false); const notifyUsersLoading = ref(false); const supportedTriggers = ref<string[]>([]); const supportedActions = ref<string[]>([]); const validation = reactive({ field: '', message: '' }); const loadingScene = ref(Boolean(route.params.id))
const { activeMultiTriggerIndex, addingMultiTrigger, isMulti, showMultiTriggerControl, multiTriggerDisabledReason, canAddMultiTrigger, addMultiTrigger: beginMultiTrigger, cancelTriggerPicker: resetMultiTriggerPicker, removeMultiTrigger, selectMultiTrigger, selectTrigger: selectMultiTriggerKind } = useMultiSceneTrigger(form, supportedTriggers, () => Boolean(route.params.id), () => { selectedProductOption.value = undefined; void loadMetadata(true) })
const hasTrigger = computed(() => Boolean(form.triggerKind)); const hasRuleContent = computed(() => hasTrigger.value || form.additionalConditions.length > 0 || form.actions.length > 0); const isEditing = computed(() => Boolean(route.params.id)); const isDevice = computed(() => ['property', 'event', 'online', 'offline', 'state'].includes(form.triggerKind)); const repeatTime = computed({ get: () => form.repeatTime, set: (value: string) => form.repeatTime = value }); const units = computed(() => ['seconds', 'minutes', 'hours'].map(value => ({ value, label: t(`IotSceneLinkage.unit.${value}`) }))); const weekOptions = computed(() => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => ({ value: index + 1, label: t(`IotSceneLinkage.weekday.${day}`) }))); const monthDayOptions = computed(() => Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: t('IotSceneLinkage.monthDay', { day: index + 1 }) }))); const propertyOptions = computed(() => toThingModelOptions(properties.value, 'property')); const eventOptions = computed(() => toThingModelOptions(events.value, 'event')); const selectedProperty = computed(() => propertyOptions.value.find(item => item.value === form.propertyId)); const termOptions = computed(() => getTermTypes(selectedProperty.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) }))); const triggerText = computed(() => hasTrigger.value ? t(`IotSceneLinkage.trigger.${form.triggerKind}`) : t('IotSceneLinkage.rule.noTrigger')); const actionText = computed(() => form.actions.length ? form.actions.map(action => t(`IotSceneLinkage.action.${action.type}`)).join('、') : t('IotSceneLinkage.rule.noAction')); const scopeText = computed(() => formatDeviceScopeText(t, toTriggerScopeValue(form), { emptyText: t('IotSceneLinkage.placeholder.device') })); const scopeTitle = computed(() => formatDeviceScopeTitle(t, toTriggerScopeValue(form), { emptyText: t('IotSceneLinkage.placeholder.device') })); const triggerIcon = computed(() => ({ manual: { background: '#F2F3F5', color: '#4E5969', path: 'M9 1.5 3 9h4l-1 5.5L12 7H8l1-5.5Z' }, repeat: { background: '#E8F0FF', color: '#1E5EFF', path: 'M8 14.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13ZM8 4.5V8l2.5 1.5' }, date: { background: '#E6F5EE', color: '#0E8A5F', path: 'M2.5 3.5h11v10h-11ZM2.5 6.5h11M5.5 1.5v3M10.5 1.5v3' }, interval: { background: '#EFEBFF', color: '#6C4FE0', path: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3' }, property: { background: '#E6F5EE', color: '#0E8A5F', path: 'M2 12l3.5-3.5 2.5 2.5L14 5M14 5h-3.5M14 5v3.5' }, event: { background: '#FFECF0', color: '#D02F5A', path: 'M1.5 8h3L6 4l3 8 1.5-4h4' }, online: { background: '#E6F5EE', color: '#0E8A5F', type: 'LoginOutlined' }, offline: { background: '#F2F3F5', color: '#4E5969', type: 'LogoutOutlined' }, state: { background: '#EFEBFF', color: '#6C4FE0', type: 'SyncOutlined' }, alarm: { background: '#FFF1F0', color: '#FF4D4F', type: 'AlertOutlined' } }[form.triggerKind] || { background: '#F2F3F5', color: '#4E5969', type: 'ThunderboltOutlined' })); const hasError = (field: string) => validation.field === field; const errorMessage = (field: string) => hasError(field) ? t(validation.message) : ''
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
const selectedEvent = computed(() => events.value.find(item => item.id === form.eventId))
const eventOutputOptions = computed(() => {
  const outputs = selectedEvent.value?.outputs || selectedEvent.value?.output?.properties || selectedEvent.value?.output || selectedEvent.value?.valueType?.properties || []
  return toThingModelOptions(Array.isArray(outputs) ? outputs : [], 'property')
})
const selectedEventOutput = computed(() => eventOutputOptions.value.find(item => item.value === form.eventOutputId))
const eventTermOptions = computed(() => getTermTypes(selectedEventOutput.value?.valueType).map(value => ({ value, label: t(`IotSceneLinkage.term.${value}`) })))
const scopeView = ref<'space' | 'device-group'>('space')
const visibleScopeTreeData = computed(() => { const decorate = (nodes: any[]): any[] => nodes.map(({ disabled: _disabled, ...node }) => ({ ...node, disableCheckbox: node.deviceId ? form.dynamicScope : !form.dynamicScope, children: decorate(node.children || []) })); const root = scopeTreeData.value.find(item => item.key === `root:${scopeView.value === 'space' ? 'space' : 'group'}`); return decorate(root?.children || []) })
const scopeDialogTitle = computed(() => `${t('IotSceneLinkage.title.selectDevices')} · ${form.productName || selectedProductOption.value?.label || ''}`)
// SaaS 的细分类型映射到后端 Provider，后端返回结果是可选项的唯一依据。
const triggerOptions = computed(() => [{ value: 'manual', icon: 'ThunderboltOutlined', provider: 'manual' }, { value: 'repeat', icon: 'ClockCircleOutlined', provider: 'timer' }, { value: 'date', icon: 'CalendarOutlined', provider: 'timer' }, { value: 'interval', icon: 'SyncOutlined', provider: 'timer' }, { value: 'property', icon: 'RiseOutlined', provider: 'device' }, { value: 'event', icon: 'NotificationOutlined', provider: 'device' }, { value: 'online', icon: 'LoginOutlined', provider: 'device' }, { value: 'offline', icon: 'LogoutOutlined', provider: 'device' }, { value: 'state', icon: 'SyncOutlined', provider: 'device' }, { value: 'alarm', icon: 'AlertOutlined', provider: 'alarm' }, { value: 'ai-event', icon: 'RadarChartOutlined', provider: 'ai-event' }].filter(item => supportedTriggers.value.includes(item.provider)).map(item => ({ ...item, label: t(`IotSceneLinkage.trigger.${item.value}`), description: t(`IotSceneLinkage.triggerDesc.${item.value}`) })))
const availableTriggerOptions = computed(() => triggerOptions.value.map(item => addingMultiTrigger.value && item.provider === 'manual'
  ? { ...item, disabled: true, disabledReason: 'IotSceneLinkage.message.conditionCannotAddMore' }
  : item))
const isActionSupported = (provider: string) => supportedActions.value.includes(provider)
const actionIcon = (type: string) => type === 'delay' ? 'ClockCircleOutlined' : 'ControlOutlined'
async function requestProducts(query: IotAlarmTargetSelectQuery) { const terms = query.keyword ? [{ column: 'name', termType: 'like', value: `%${query.keyword}%`, type: 'or' }, { column: 'id', termType: 'like', value: `%${query.keyword}%`, type: 'or' }] : []; const page = normalizeResult(await queryProducts({ pageIndex: query.pageIndex, pageSize: query.pageSize, sorts: [{ name: 'createTime', order: 'desc' }], terms })); return { data: page.data.map((item: any) => ({ label: item.name, value: item.id, data: item })), total: page.total } }
async function loadSceneProviders() { const [triggers, actions] = await Promise.all([querySceneSupportedTriggers(), querySceneSupportedActions()]); supportedTriggers.value = normalizeResult(triggers).data.map((item: SceneProviderInfo) => item.provider); supportedActions.value = normalizeResult(actions).data.map((item: SceneProviderInfo) => item.provider) }
async function loadDevices() { if (!form.productId) return; devices.value = normalizeResult(await queryDevices({ terms: [{ column: 'productId', value: form.productId }] })).data.map((item: any) => ({ label: item.name, value: item.id })) }
const scopeCheckedKeys = computed(() => { const checked = new Set<string>(); scopeNodeMap.forEach((node, key) => { if (form.dynamicScope) { if (node.scopeType === form.dynamicScopeType && form.groupIds.includes(node.scopeId)) checked.add(key); if (node.deviceId && node.parentKey && form.groupIds.some(id => node.parentKey === `${form.dynamicScopeType}:${id}`)) checked.add(key); return }; if (node.deviceId && form.deviceIds.includes(node.deviceId)) { checked.add(key); if (node.parentKey) checked.add(node.parentKey) } }); return [...checked] })
async function loadScopeTree() { if (!form.productId || scopeLoading.value) return; scopeLoading.value = true; try { const rows = normalizeResult(await queryDevices({ terms: [{ column: 'productId', value: form.productId }] })).data; const ids = rows.map((item: any) => String(item.id)).filter(Boolean); const [areas, groups, areaBindings, groupByDevice] = await Promise.all([queryProjectSpaceAreaSettings_api(''), queryDeviceGroupDetailList_api(), queryDeviceSpaceAreaBindings_api(ids), queryDeviceBoundGroups_api(ids)]); const treeMap = new Map<string, any>(); const areaNodes = areas.areas.map(area => { const node = { key: `space:${area.id}`, title: area.name, scopeType: 'space', scopeId: area.id, disabled: !form.dynamicScope, children: [] as any[] }; treeMap.set(node.key, node); return node }); const areaRoots: any[] = []; areaNodes.forEach(node => { const parentId = areas.areas.find(area => area.id === node.scopeId)?.parentId; const parent = parentId ? treeMap.get(`space:${parentId}`) : undefined; if (parent) parent.children.push(node); else areaRoots.push(node) }); const groupNodes = groups.map(group => ({ key: `device-group:${group.id}`, title: group.name, scopeType: 'device-group', scopeId: group.id, disabled: !form.dynamicScope, children: [] as any[] })); const groupMap = new Map(groupNodes.map(node => [node.scopeId, node])); const areaMap = new Map(areaNodes.map(node => [node.scopeId, node])); const appendDevice = (parent: any, device: any) => { const key = `device:${parent.key}:${device.id}`; parent.children.push({ key, title: device.name || device.id, deviceId: String(device.id), deviceState: device.state === 'online' || device.online === true ? 'online' : 'offline', disabled: form.dynamicScope }); scopeNodeMap.set(key, { key, deviceId: String(device.id), parentKey: parent.key }) }; rows.forEach((device: any) => { const matchedAreas = areaBindings.filter(item => item.deviceId === String(device.id)); const matchedGroups = groupByDevice[String(device.id)] || []; matchedAreas.forEach(item => areaMap.get(item.areaId) && appendDevice(areaMap.get(item.areaId), device)); matchedGroups.forEach(item => groupMap.get(item.id) && appendDevice(groupMap.get(item.id), device)) }); [...areaNodes, ...groupNodes].forEach(node => scopeNodeMap.set(node.key, node)); scopeTreeData.value = [{ key: 'root:space', title: t('IotSceneLinkage.editor.areas'), disabled: true, children: areaRoots }, { key: 'root:group', title: t('IotSceneLinkage.editor.groups'), disabled: true, children: groupNodes }].filter(node => node.children.length); scopeExpandedKeys.value = [...treeMap.keys(), ...groupMap.keys()] } finally { scopeLoading.value = false } }
function changeScopeMode() { form.groupIds = []; form.deviceIds = [] }
function selectScopeView(type: 'space' | 'device-group') { scopeView.value = type; if (form.dynamicScope) { form.dynamicScopeType = type; form.groupIds = [] } }
function onScopeCheck(keys: any) { const checked = Array.isArray(keys) ? keys : keys.checked || []; const nodes = checked.map((key: string) => scopeNodeMap.get(key)).filter(Boolean); if (form.dynamicScope) { const groups = nodes.filter((node: any) => node.scopeType); const type = groups[0]?.scopeType; form.dynamicScopeType = type || form.dynamicScopeType; form.groupIds = groups.filter((node: any) => node.scopeType === form.dynamicScopeType).map((node: any) => node.scopeId); return }; form.deviceIds = [...new Set(nodes.map((node: any) => node.deviceId).filter(Boolean))] }
async function loadMetadata(open: boolean) { if (!open) return; if (!form.productId) { properties.value = []; events.value = []; return }; const response: any = await getProduct(form.productId); const metadata = typeof (response.result || response).metadata === 'string' ? JSON.parse((response.result || response).metadata) : (response.result || response).metadata || {}; properties.value = metadata.properties || []; events.value = metadata.events || [] }
function addMultiTrigger() { beginMultiTrigger(); if (addingMultiTrigger.value) triggerPickerVisible.value = true }
function cancelTriggerPicker() { resetMultiTriggerPicker(); triggerPickerVisible.value = false }
function openScope() { if (!form.productId) { validation.field = 'product'; validation.message = 'IotSceneLinkage.message.selectProductFirst'; return onlyMessage(t(validation.message), 'warning') }; scopeVisible.value = true }
function saveTriggerScope(scope: DeviceScope) { const isDynamicScope = ['space', 'device-group'].includes(scope.selector); const selectorValues = scope.selectorValues; form.allDevices = scope.selector === 'all'; form.dynamicScope = isDynamicScope; form.dynamicScopeType = scope.selector === 'space' ? 'space' : 'device-group'; form.scopeOptions = { ...scope.options, names: selectorValues.map(item => item.name || item.value) }; if (form.allDevices) { form.groupIds = []; form.deviceIds = [] } else if (form.dynamicScope) { form.groupIds = selectorValues.map(item => item.value); form.deviceIds = [] } else { form.deviceIds = selectorValues.map(item => item.value); form.groupIds = [] }; scopeVisible.value = false }
function selectTrigger(kind: SceneTriggerKind) {
  const isAddingMultiTrigger = addingMultiTrigger.value
  if (!selectMultiTriggerKind(kind)) return
  // 组合条件选择后 hook 会清除添加状态；仍需按进入弹窗时的状态避免回写当前条件。
  if (!isAddingMultiTrigger) form.triggerKind = kind
  validation.field = ''
  triggerPickerVisible.value = false
}
function selectTriggerFromPicker(value: string) { selectTrigger(value as SceneTriggerKind) }
function clearTrigger() { if (isMulti.value) return; form.triggerKind = '' as SceneTriggerKind; form.productId = undefined; form.productName = undefined; selectedProductOption.value = undefined; form.deviceIds = []; form.groupIds = []; form.propertyId = undefined; form.eventId = undefined; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermValue = undefined; form.termValue = undefined; form.alarm = { modes: [] }; form.aiEvent = defaultForm().aiEvent; properties.value = []; events.value = []; validation.field = '' }
function resetRepeatSelections() { form.repeatWeekdays = []; form.repeatMonthDays = [] }
function changeRepeatCustomMode() { resetRepeatSelections() }
function onProductChange(value?: string, option?: IotAlarmTargetSelectOption) { selectedProductOption.value = option; form.productName = option?.label; clearScope(); if (value && hasError('product')) { validation.field = ''; validation.message = '' }; void loadMetadata(true) }
function updateTriggerProperty(value: string) { const property = propertyOptions.value.find(item => item.value === value); const termTypes = getTermTypes(property?.valueType); form.propertyName = property?.label || value; form.termType = termTypes.includes(form.termType) ? form.termType : termTypes[0]; form.termValue = undefined; if (value && hasError('property')) { validation.field = ''; validation.message = '' } }
function updateTriggerEvent(value: string) { form.eventName = eventOptions.value.find(item => item.value === value)?.label || value; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermType = 'eq'; form.eventTermValue = undefined }
function updateTriggerEventOutput(value: string) { const output = eventOutputOptions.value.find(item => item.value === value); const termTypes = getTermTypes(output?.valueType); form.eventOutputName = output?.label || value; form.eventTermType = termTypes.includes(form.eventTermType || '') ? form.eventTermType : termTypes[0]; form.eventTermValue = undefined }
function clearScope() { form.deviceIds = []; form.groupIds = []; form.propertyId = undefined; form.eventId = undefined; form.eventOutputId = undefined; form.eventOutputName = undefined; form.eventTermValue = undefined; properties.value = []; events.value = [] }
function addCondition(type: SceneConditionForm['type']) { if (type === 'timeRange') { const existing = form.additionalConditions.find(item => item.type === 'timeRange'); if (existing?.type === 'timeRange') { conditionVisible.value = false; return }; form.additionalConditions.push({ type, ranges: [{ start: '09:00', end: '18:00' }] }) } else if (type === 'alarmState') form.additionalConditions.push({ type, alarm: { modes: [], state: 'warning', options: {} } }); else form.additionalConditions.push({ type, productId: '', selector: 'fixed', selectorValues: [], propertyId: '', termType: 'eq', value: '' }); conditionVisible.value = false }
function updateCondition(index: number, condition: SceneConditionForm) { form.additionalConditions[index] = condition }
async function addNotifyAction() { await Promise.all([loadNotifyMethods(true), loadNotifyUsers(true)]); form.actions.push({ type: 'sceneNotify', config: { userIds: [], notifyChannelIds: [] } }); actionPickerVisible.value = false }
function addDelay() { form.actions.push({ type: 'delay', time: 1, unit: 'seconds' }); actionPickerVisible.value = false }
function openAction(type: 'device') { actionPickerVisible.value = false; form.actions.push({ type, config: { productId: '', selector: 'fixed', selectorValues: [], message: { messageType: 'READ_PROPERTY', properties: [] } } }) }
function updateAction(index: number, action: any) { form.actions[index] = action }
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
  .map(user => ({ id: String(user.id || ''), name: user.name, username: user.username, email: user.email, telephone: user.telephone }))
  .filter((user): user is SceneNotifyUser => Boolean(user.id))
async function loadNotifyUsers(reset = true) {
  if (notifyUsersLoading.value || (!reset && notifyUsers.value.length >= notifyUsersTotal.value)) return
  const pageIndex = reset ? 0 : notifyUsersPageIndex.value + 1
  const userIds = selectedNotifyUserIds()
  notifyUsersLoading.value = true
  try {
    // Saved recipients may be outside the first dropdown page, so resolve them separately.
    const [pageResponse, selectedResponse] = await Promise.all([
      querySceneNotifyUsers({ pageIndex, pageSize: 20 }),
      reset && userIds.length
        ? querySceneNotifyUsers({ paging: false, userIds }).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
    const page = normalizeResult(pageResponse)
    const selectedUsers = selectedResponse ? toSceneNotifyUsers(normalizeResult(selectedResponse).data) : []
    const retainedUsers = reset ? notifyUsers.value.filter(user => userIds.includes(user.id)) : notifyUsers.value
    notifyUsers.value = mergeNotifyUsersById(
      retainedUsers,
      mergeNotifyUsersById(selectedUsers, toSceneNotifyUsers(page.data)),
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
  if (form.additionalConditions.some(condition => condition.type === 'timeRange' && !condition.ranges.length)) return invalid('condition', 'IotSceneLinkage.message.timeRangeRequired')
  if (form.additionalConditions.some(condition => condition.type === 'timeRange' && condition.ranges.some(range => range.start === range.end))) return invalid('condition', 'IotSceneLinkage.message.timeRangeInvalid')
  if (form.additionalConditions.some(condition => condition.type === 'deviceProperty' && isEmptyValue(condition.value))) return invalid('condition', 'IotSceneLinkage.message.conditionValueRequired')
  if (!form.actions.length) return invalid('action', 'IotSceneLinkage.message.actionRequired')
  if (form.actions.some(action => action.type === 'device' && (!action.config?.productId || (action.config?.selector !== 'all' && !action.config?.selectorValues?.length) || !action.config?.message?.messageType))) return invalid('action', 'IotSceneLinkage.message.deviceActionRequired')
  if (form.actions.some(action => action.type === 'device' && action.config?.message?.messageType === 'WRITE_PROPERTY' && isEmptyValue(Object.values(action.config.message.properties || {})[0]))) return invalid('action', 'IotSceneLinkage.message.deviceActionValueRequired')
  const missingFunctionInputs = (await Promise.all(form.actions.filter(action => action.type === 'device').map(getMissingFunctionInputs))).flat()
  if (missingFunctionInputs.length) return invalid('action', 'IotSceneLinkage.message.deviceFunctionInputRequired', { names: missingFunctionInputs.join('、') })
  if (form.actions.some(action => action.type === 'sceneNotify' && (!action.config?.notifyChannelIds?.length || !action.config?.userIds?.length))) return invalid('notify', 'IotSceneLinkage.message.notifyRequired')
  validation.field = ''
  validation.message = ''
  return true
}
/** 已有场景保存前重新读取后端数据，避免列表打开后被其他管理员改成不支持结构仍被覆盖。 */
async function ensureSceneCompatible(id: string) {
  const response = await getSceneDetail(id)
  const compatibility = getSceneCompatibility(response?.result || response)
  if (compatibility.supported) return true
  onlyMessage(t(compatibility.reason || 'IotSceneLinkage.message.unsupportedRule'), 'warning')
  return false
}

async function save() {
  if (form.id && !await ensureSceneCompatible(form.id)) return
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
    const scene = buildRequest(form, conditionColumns)
    form.id ? await updateSceneLinkage(form.id, scene) : await createSceneLinkage(scene)
    onlyMessage(t('IotSceneLinkage.message.saved', { name: form.name }), 'success')
    menuStore.jumpPage(sceneRouteKey.value)
  } finally {
    saving.value = false
  }
}
watch(() => form.repeatMode, (_value, previous) => { if (!loadingScene.value && previous) resetRepeatSelections() })
watch(() => form.name, value => { if (value.trim() && hasError('name')) { validation.field = ''; validation.message = '' } })
watch(() => [form.propertyId, form.termValue], ([propertyId, termValue]) => { if (propertyId && termValue !== undefined && termValue !== null && termValue !== '' && hasError('property')) { validation.field = ''; validation.message = '' } })
// Keep persisted weekly or monthly selections while the edit form is being populated.
async function init() {
  await loadSceneProviders()
  const id = String(route.params.id || '')
  if (!id) {
    form.triggerKind = '' as SceneTriggerKind
    return
  }
  const data: any = await getSceneDetail(id)
  const scene = data.result || data
  Object.assign(form, toForm(scene))
  advancedExpanded.value = form.debounceEnabled
  if (form.productId) {
    const response: any = await getProduct(form.productId)
    const product = response.result || response
    form.productName ||= product.name || form.productId
    selectedProductOption.value = { label: product.name || form.productId, value: form.productId, data: product }
    await loadMetadata(true)
  }
  await nextTick()
  loadingScene.value = false
  if (form.actions.some(action => action.type === 'sceneNotify')) {
    await Promise.all([loadNotifyMethods(), loadNotifyUsers()])
    await Promise.all(form.actions.map((action, index) => {
      const method = action.type === 'sceneNotify' ? notifyMethods.value.find(item => item.id === action.config?.notifyChannelIds?.[0]) : undefined
      return method ? refreshNotifyTemplate(index, method) : undefined
    }))
  }
}
init()
</script>
<style src="./SceneLinkageEditor.css"></style>
