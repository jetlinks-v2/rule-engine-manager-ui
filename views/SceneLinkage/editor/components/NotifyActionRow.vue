<template>
  <SceneNodeCard v-if="!dialogOnly" :class="['notify-action-row', { 'notify-action-row--invalid': invalid }]" :title="$t('IotSceneLinkage.action.sendNotify')" icon="NotificationOutlined" :number="index + 1">
    <template #actions><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></template>
    <SceneNotifySummary :config="action.config" :options="previewOptions" :users="users" :methods="methods" />
  </SceneNodeCard>

  <a-modal :open="editorVisible" :title="$t('IotSceneLinkage.action.sendNotify')" :mask-closable="false" @cancel="cancelEditor" @ok="saveEditor">
    <a-form class="notify-action-row__editor" layout="vertical">
      <a-form-item :label="$t('IotSceneLinkage.form.notifyMethod')" required>
        <a-select
          class="notify-action-row__method"
          size="large"
          popup-class-name="scene-editor__compact-dropdown"
          :dropdown-match-select-width="false"
          :value="methodValue"
          :loading="methodsLoading"
          :placeholder="$t('IotSceneLinkage.placeholder.notifyMethod')"
          :aria-label="$t('IotSceneLinkage.form.notifyMethod')"
          :options="methodOptions"
          @change="changeMethod"
        />
      </a-form-item>
      <a-form-item v-if="requiresRecipients" :label="$t('IotSceneLinkage.form.notifyRecipients')" required>
        <a-radio-group v-if="recipientKinds.length > 1" v-model:value="recipientKind" size="small" class="notify-action-row__kinds">
          <a-radio-button v-for="kind in recipientKinds" :key="kind" :value="kind">{{ $t('IotSceneLinkage.recipient.' + kind) }}</a-radio-button>
        </a-radio-group>
        <template v-if="recipientKind !== 'people'">
          <a-alert v-if="recipientDirectory?.status === 'error'" type="error" show-icon :message="$t('IotSceneLinkage.recipient.failed')">
            <template #action><a-button type="link" size="small" @click="retryRecipients">{{ $t('IotSceneLinkage.recipient.retry') }}</a-button></template>
          </a-alert>
          <a-select v-else class="notify-action-row__scope" :value="scopeIds" :options="scopeOptions" mode="multiple" show-search option-filter-prop="label" :max-tag-count="2"
            :loading="recipientDirectory?.status === 'loading'" :placeholder="$t('IotSceneLinkage.recipient.selectScope')" @update:value="changeScope">
            <template #notFoundContent>{{ $t('IotSceneLinkage.recipient.noResults') }}</template>
          </a-select>
        </template>
        <a-popover v-else :open="recipientPopoverOpen" trigger="click" placement="bottomLeft" @open-change="openRecipients">
          <template #content>
            <div class="notify-recipient-panel" role="dialog" :aria-label="$t('IotSceneLinkage.form.notifyRecipients')" @keydown.esc.stop.prevent="closeRecipients">
              <a-input v-model:value="recipientSearch" allow-clear :placeholder="$t('IotSceneLinkage.recipient.search')" :aria-label="$t('IotSceneLinkage.recipient.search')"><template #prefix><AIcon type="SearchOutlined" /></template></a-input>
              <div class="notify-recipient-panel__items" @scroll="handleUserPopupScroll">
                <div v-for="user in filteredUsers" :key="user.id" class="notify-recipient-panel__item">
                  <a-checkbox :checked="recipientIds.includes(user.id)" :disabled="usersLoading" @change="toggleRecipient(user.id)">
                    <span class="notify-recipient-panel__person"><AIcon type="UserOutlined" /><span class="notify-recipient-panel__text"><span :title="formatNotificationRecipient(user)">{{ user.name || user.username }}</span><small v-if="user.username" :title="user.username">{{ user.username }}</small></span></span>
                  </a-checkbox>
                </div>
                <div v-if="usersLoading" class="notify-recipient-panel__state" role="status"><a-spin size="small" /> {{ $t('IotSceneLinkage.recipient.loading') }}</div>
                <div v-else-if="!filteredUsers.length" class="notify-recipient-panel__state" role="status">{{ $t(recipientSearch.trim() ? 'IotSceneLinkage.recipient.noResults' : 'IotSceneLinkage.recipient.empty') }}</div>
                <a-button v-if="usersHasMore" type="link" size="small" block :loading="usersLoading" @click="$emit('load-more-users')">{{ $t('IotSceneLinkage.recipient.loadMore') }}</a-button>
              </div>
            </div>
          </template>
          <a-button ref="recipientTrigger" class="notify-action-row__users" :class="{ 'is-open': recipientPopoverOpen }" :disabled="!methodValue" :aria-label="$t('IotSceneLinkage.form.notifyRecipients')" :aria-expanded="recipientPopoverOpen" aria-haspopup="dialog" @keydown.esc.stop.prevent="closeRecipients">
            <span class="notify-action-row__selected"><AIcon type="TeamOutlined" /><SelectionSummary :names="selectedRecipientNames" :placeholder="$t('IotSceneLinkage.placeholder.notifyUsers')" /></span><AIcon type="DownOutlined" />
          </a-button>
        </a-popover>
      </a-form-item>
      <a-alert v-else-if="selectedMethod && !selectedMethod.templateId" type="warning" show-icon :message="$t('IotSceneLinkage.hint.notifyTemplateRequired')" />
      <p v-else class="notify-action-row__hint">{{ $t('IotSceneLinkage.hint.fixedNotifyRecipients') }}</p>
      <p class="notify-action-row__hint">{{ $t('IotSceneLinkage.hint.notifyContentTemplate') }}</p>
    </a-form>
    <SceneConfigPreview class="notify-action-row__preview" :hint="!isSceneNotifyConfigured(action.config, methods) ? $t('IotSceneLinkage.message.notifyRequired') : undefined">
      <div v-if="requiresRecipients" class="notify-action-row__recipient-preview">
        <span>{{ selectedMethod?.name || previewOptions.channelName }}</span>
        <section v-for="group in recipientGroups" :key="group.type" class="notify-action-row__recipient-group" role="group" :aria-label="$t('IotSceneLinkage.recipient.' + group.type)">
          <span class="notify-action-row__recipient-label">{{ $t('IotSceneLinkage.recipient.' + group.type) }}</span>
          <div class="notify-action-row__recipient-tags">
            <a-tag v-for="item in group.items" :key="item.id" closable @close.prevent="removePreviewRecipient(group.type, item.id)">
              <span :title="item.name">{{ item.name }}</span>
              <template #closeIcon><button type="button" class="notify-action-row__remove-recipient" :aria-label="$t('IotSceneLinkage.recipient.remove', { name: item.name })"><AIcon type="CloseOutlined" /></button></template>
            </a-tag>
          </div>
        </section>
      </div>
      <SceneNotifySummary v-else :config="action.config" :options="previewOptions" :users="users" :methods="methods" />
    </SceneConfigPreview>
  </a-modal>
</template>

<script setup lang="ts">
import { useSceneNotifyRecipients } from '../useSceneNotification'
import SceneConfigPreview from './SceneConfigPreview.vue'
import SelectionSummary from '@jetlinks-web-core/components/SelectionSummary'
import { computed, onMounted, ref, watch } from 'vue'
import SceneNodeCard from './SceneNodeCard.vue'
import SceneNotifySummary from './SceneNotifySummary.vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import type { SceneNotifyMethod, SceneNotifyUser } from '../../../../api/scene-linkage'
import { formatNotificationRecipient, getNotificationSummary, getNotificationRecipientGroups, type SceneNotifyRecipientKind } from '../notificationSummary'
import type { SceneActionForm } from '../../utils'
import { changeSceneNotifyMethod, isSceneNotifyConfigured, requiresSceneNotifyRecipients } from '../../../../utils/sceneNotify'

const props = defineProps<{
  action: SceneActionForm
  index: number
  methods: SceneNotifyMethod[]
  users: SceneNotifyUser[]
  methodsLoading?: boolean
  usersLoading?: boolean
  usersHasMore?: boolean
  invalid?: boolean
  autoOpen?: boolean
  /** 详细模式沿用此对话框，但由原版动作卡承载列表项。 */
  dialogOnly?: boolean
}>()

const emit = defineEmits<{
  remove: []
  opened: []
  'cancel-new': []
  'load-users': [reset?: boolean]
  'load-more-users': []
  'method-change': [method: SceneNotifyMethod]
  change: [action: SceneActionForm]
  saved: [action: SceneActionForm]
}>()
const { t } = useI18n()

const methodValue = computed(() => props.action.config?.notifyChannelIds?.[0])
const selectedMethod = computed(() => props.methods.find(method => method.id === methodValue.value))
const requiresRecipients = computed(() => requiresSceneNotifyRecipients(selectedMethod.value))
const recipientIds = computed(() => props.action.config?.userIds || [])
const methodOptions = computed(() => props.methods.map(method => ({
  label: method.name,
  value: method.id,
})))
const recipientPopoverOpen = ref(false)
const recipientSearch = ref('')
const recipientTrigger = ref<{ focus: () => void }>()
const filteredUsers = computed(() => {
  const keyword = recipientSearch.value.trim().toLocaleLowerCase()
  return keyword ? props.users.filter(user => user.name?.toLocaleLowerCase().includes(keyword) || user.username?.toLocaleLowerCase().includes(keyword)) : props.users
})
const selectedRecipientNames = computed(() => recipientIds.value.length
  ? getNotificationSummary({ ...props.action.config, dimensions: [] }, props.action.options, t, props.users, props.methods).recipients : [])
const editorVisible = ref(false)
const { kind: recipientKind, kinds: recipientKinds, directory: recipientDirectory, ids: scopeIds, options: scopeOptions, scopeNames, change: buildScopeAction, remove: buildRemoveRecipientAction, retry: retryRecipients } = useSceneNotifyRecipients(() => props.action, () => selectedMethod.value, () => editorVisible.value)
const previewOptions = computed(() => ({ ...props.action.options, recipientScopes: scopeNames.value }))
const recipientGroups = computed(() => getNotificationRecipientGroups(props.action.config, previewOptions.value, t, props.users))
function removePreviewRecipient(type: SceneNotifyRecipientKind, id: string) {
  emit('change', buildRemoveRecipientAction(type, id))
}
const changeScope = (value: unknown) => {
  if (Array.isArray(value)) emit('change', buildScopeAction(value.filter((id): id is string => typeof id === 'string')))
}
const originalAction = ref<SceneActionForm>()
const createdByPicker = ref(false)


onMounted(() => {
  if (requiresRecipients.value && recipientIds.value.length) emit('load-users', true)
})

/** Notification configuration is committed by the dialog, so closing it restores the action snapshot. */
function openEditor() {
  originalAction.value = JSON.parse(JSON.stringify(props.action)) as SceneActionForm
  editorVisible.value = true
  if (requiresRecipients.value) emit('load-users', true)
}
function cancelEditor() {
  recipientPopoverOpen.value = false
  if (createdByPicker.value) emit('cancel-new')
  else if (originalAction.value) emit('change', originalAction.value)
  originalAction.value = undefined
  createdByPicker.value = false
  editorVisible.value = false
}
function saveEditor() {
  if (!isSceneNotifyConfigured(props.action.config, props.methods)) {
    onlyMessage(t('IotSceneLinkage.message.notifyRequired'), 'warning')
    return
  }
  // 名称只写入 options 展示元数据，运行时仍使用原有渠道和用户 ID。
  const action = {
    ...props.action,
    config: selectedMethod.value ? changeSceneNotifyMethod(props.action.config, selectedMethod.value) : props.action.config,
    options: {
      ...props.action.options,
      channelName: props.methods.find(method => method.id === methodValue.value)?.name || props.action.options?.channelName,
      fixedRecipient: !requiresRecipients.value,
      recipientScopes: requiresRecipients.value ? scopeNames.value : [],
      users: requiresRecipients.value ? props.users.filter(user => recipientIds.value.includes(user.id)).map(user => ({ id: user.id, name: user.name, username: user.username })) : [],
    },
  }
  emit('change', action)
  emit('saved', action)
  recipientPopoverOpen.value = false
  originalAction.value = undefined
  createdByPicker.value = false
  editorVisible.value = false
}

function openRecipients(open: boolean) {
  recipientPopoverOpen.value = open && Boolean(methodValue.value)
  if (recipientPopoverOpen.value) {
    recipientSearch.value = ''
    emit('load-users', true)
  }
}
function closeRecipients() {
  recipientPopoverOpen.value = false
  recipientTrigger.value?.focus()
}
function toggleRecipient(id: string) {
  if (props.usersLoading) return
  changeRecipients(recipientIds.value.includes(id) ? recipientIds.value.filter((value: string) => value !== id) : [...recipientIds.value, id])
}

const handleUserPopupScroll = (event: Event) => {
  const target = event.target as HTMLElement
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
    emit('load-more-users')
  }
}

const changeMethod = (channelId: unknown) => {
  const method = props.methods.find(item => item.id === channelId)
  if (method) {
    recipientKind.value = 'people'
    emit('method-change', method)
    if (requiresSceneNotifyRecipients(method)) emit('load-users', true)
  }
}

const changeRecipients = (userIds: string[]) => {
  emit('change', {
    ...props.action,
    config: { ...props.action.config, userIds },
  })
}

watch(() => props.autoOpen, value => {
  if (!value || editorVisible.value) return
  createdByPicker.value = true
  openEditor()
  emit('opened')
}, { immediate: true })
watch(methodValue, () => { recipientPopoverOpen.value = false; recipientSearch.value = '' })
</script>

<style scoped>
.notify-action-row { margin-bottom: var(--space-3, 12px); }
.notify-action-row--invalid { border-color: var(--ant-color-error); }
.notify-action-row__editor { display: grid; gap: var(--space-4, 16px); min-width: 0; }
.notify-action-row__editor :deep(.ant-form-item) { margin-bottom: 0; }
.notify-action-row__method, .notify-action-row__users { width: 100%; min-width: 0; }
.notify-action-row__users { display: flex; align-items: center; justify-content: space-between; min-height: 40px; padding: 0 12px; text-align: left; }
.notify-action-row__selected { display: flex; flex: 1; min-width: 0; align-items: center; gap: 8px; overflow: hidden; }
.notify-action-row__selected > .selection-summary { flex: 1; }
.notify-action-row__users > :deep(.anticon) { flex: none; margin-left: 8px; color: var(--jet-theme-text-disabled, #86909c); font-size: 12px; }
.notify-action-row__users.is-open, .notify-action-row__users:focus-visible { border-color: var(--ant-color-primary, #1677ff); background: var(--ant-color-primary-bg, #edf5ff); outline: 2px solid var(--ant-color-primary-border, #d8e8ff); }
.notify-recipient-panel { width: min(300px, calc(100vw - 64px)); }
.notify-recipient-panel__items { max-height: 268px; overflow-y: auto; padding: 4px 0; }
.notify-recipient-panel__item { min-height: 44px; border-radius: 4px; }
.notify-recipient-panel__item:hover { background: var(--ant-color-fill-quaternary, #f7f8fb); }
.notify-recipient-panel__item :deep(.ant-checkbox-wrapper) { display: flex; width: 100%; min-height: 44px; align-items: center; margin: 0; padding: 3px 8px; font-size: 14px; }
.notify-recipient-panel__item :deep(.ant-checkbox + span) { flex: 1; min-width: 0; padding-right: 0; }
.notify-recipient-panel__person { display: flex; width: 100%; align-items: center; gap: 10px; }
.notify-recipient-panel__person > :deep(.anticon) { flex: none; color: var(--ant-color-primary, #1677ff); }
.notify-recipient-panel__text { display: flex; flex: 1; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; line-height: 19px; }
.notify-recipient-panel__text > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.notify-recipient-panel__text small { flex: none; max-width: min(136px, 55%); overflow: hidden; color: var(--jet-theme-text-secondary, #86909c); font-size: 12px; line-height: 16px; text-overflow: ellipsis; white-space: nowrap; }
.notify-recipient-panel__state { padding: 12px 4px; color: var(--jet-theme-text-secondary, #86909c); font-size: 12px; }
.notify-action-row__kinds { display: flex; width: fit-content; margin-bottom: 12px; }
.notify-action-row__hint { margin: 0; color: var(--jet-theme-text-secondary, #595959); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.notify-action-row__preview { max-height: min(280px, 36dvh); }
.notify-action-row__preview :deep(.scene-summary-parts__field) { display: inline-block; max-width: calc(100% - 4px); box-sizing: border-box; }
.notify-action-row__recipient-preview, .notify-action-row__recipient-group { display: grid; min-width: 0; gap: var(--space-1, 4px); }
.notify-action-row__recipient-preview { gap: var(--space-2, 8px); }
.notify-action-row__recipient-label { color: var(--jet-theme-text-secondary, #595959); font-size: 12px; line-height: 18px; }
.notify-action-row__recipient-tags { display: flex; flex-wrap: wrap; min-width: 0; gap: var(--space-1, 4px); }
.notify-action-row__recipient-tags :deep(.ant-tag) { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; margin: 0; }
.notify-action-row__recipient-tags :deep(.ant-tag > span:first-child) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notify-action-row__remove-recipient { display: inline-flex; flex: none; align-items: center; justify-content: center; padding: 0; border: 0; background: none; color: var(--jet-theme-text-secondary, #595959); cursor: pointer; }
.notify-action-row__remove-recipient:focus-visible { outline: 2px solid var(--ant-color-primary, #1677ff); outline-offset: 2px; }
</style>
