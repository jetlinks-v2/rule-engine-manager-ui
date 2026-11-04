<template>
  <article :class="['notify-action-row', { 'notify-action-row--invalid': invalid }]">
    <header><span class="notify-action-row__icon"><AIcon type="NotificationOutlined" /></span><strong>{{ $t('IotSceneLinkage.action.sendNotify') }}</strong><small>{{ index + 1 }}</small><span class="notify-action-row__actions"><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button class="notify-action-row__remove" type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></span></header>
    <div class="notify-action-row__description">{{ summaryText }}</div>
  </article>

  <a-modal :open="editorVisible" :title="$t('IotSceneLinkage.action.sendNotify')" :mask-closable="false" @cancel="cancelEditor" @ok="saveEditor">
    <div class="notify-action-row__editor">
      <div class="notify-action-row__main">
        <span class="notify-action-row__label">{{ $t('IotSceneLinkage.action.send') }}</span>
        <a-select
          class="notify-action-row__method"
          popup-class-name="scene-editor__compact-dropdown"
          :dropdown-match-select-width="false"
          :value="methodValue"
          :loading="methodsLoading"
          :placeholder="$t('IotSceneLinkage.placeholder.notifyMethod')"
          :options="methodOptions"
          @change="changeMethod"
        />
        <span class="notify-action-row__label">{{ $t('IotSceneLinkage.action.to') }}</span>
        <a-select
          class="notify-action-row__users"
          popup-class-name="scene-editor__resource-dropdown"
          :dropdown-match-select-width="false"
          mode="multiple"
          :value="recipientIds"
          :loading="usersLoading"
          :placeholder="$t('IotSceneLinkage.placeholder.notifyUsers')"
          :options="userOptions"
          @dropdownVisibleChange="loadUsers"
          @popupScroll="handleUserPopupScroll"
          @change="changeRecipients"
        />
      </div>
      <div class="notify-action-row__content">
      <span class="notify-action-row__content-label">
        {{ $t('IotSceneLinkage.form.notifyContent') }}
        <a-tooltip :title="$t('IotSceneLinkage.hint.notifyContentTemplate')">
          <AIcon class="notify-action-row__help" type="QuestionCircleOutlined" />
        </a-tooltip>
        ：
      </span>
      <span v-if="templateContent" class="notify-action-row__template">
        <template v-for="(segment, segmentIndex) in templateSegments" :key="segmentIndex">
          <span v-if="segment.variable" class="notify-action-row__variable" :title="segment.token">{{ segment.text }}</span>
          <span v-else>{{ segment.text }}</span>
        </template>
      </span>
      <span v-else class="notify-action-row__template">{{ $t('IotSceneLinkage.action.notifyTemplate') }}</span>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SceneNotifyMethod, SceneNotifyUser } from '../../../../api/scene-linkage'
import type { SceneActionForm } from '../../utils'

const props = defineProps<{
  action: SceneActionForm
  index: number
  methods: SceneNotifyMethod[]
  users: SceneNotifyUser[]
  methodsLoading?: boolean
  usersLoading?: boolean
  invalid?: boolean
  autoOpen?: boolean
}>()

const emit = defineEmits<{
  remove: []
  opened: []
  'cancel-new': []
  'load-users': [reset?: boolean]
  'load-more-users': []
  'method-change': [method: SceneNotifyMethod]
  change: [action: SceneActionForm]
}>()
const { t } = useI18n()

const methodValue = computed(() => props.action.config?.notifyChannelIds?.[0])
const recipientIds = computed(() => props.action.config?.userIds || [])
const methodOptions = computed(() => props.methods.map(method => ({
  label: method.name,
  value: method.id,
})))
const userOptions = computed(() => props.users.map(user => ({
  label: user.email || user.telephone || user.username
    ? `${user.name || user.username} (${user.email || user.telephone || user.username})`
    : user.name,
  value: user.id,
})))
const templateContent = computed(() => String(
  props.action.options?.templateContent
  || props.action.options?.channelName
  || '',
))
const templateSegments = computed(() => {
  const variableNames = new Map(
    (Array.isArray(props.action.options?.templateVariables) ? props.action.options.templateVariables : [])
      .map((variable: any) => [String(variable?.id || ''), String(variable?.name || variable?.i18nName || '').trim()] as const)
      .filter(([id, name]) => Boolean(id && name)),
  )
  const segments: Array<{ text: string; variable: boolean; token?: string }> = []
  const pattern = /\$\{[^}]+}/g
  let offset = 0
  let matched: RegExpExecArray | null
  while ((matched = pattern.exec(templateContent.value))) {
    if (matched.index > offset) segments.push({ text: templateContent.value.slice(offset, matched.index), variable: false })
    const variableId = matched[0].slice(2, -1).trim()
    segments.push({ text: variableNames.get(variableId) || t('IotSceneLinkage.notify.unnamedVariable'), token: matched[0], variable: true })
    offset = matched.index + matched[0].length
  }
  if (offset < templateContent.value.length || !segments.length) segments.push({ text: templateContent.value.slice(offset), variable: false })
  return segments
})
const editorVisible = ref(false)
const originalAction = ref<SceneActionForm>()
const createdByPicker = ref(false)
const summaryText = computed(() => {
  const method = props.methods.find(item => item.id === methodValue.value)?.name || props.action.options?.channelName
  const recipients = recipientIds.value
    .map(id => props.users.find(user => user.id === id)?.name || id)
    .filter(Boolean)
  return method && recipients.length
    ? t('IotSceneLinkage.summary.notify', { method, recipients: recipients.join('、') })
    : ''
})

onMounted(() => {
  if (recipientIds.value.length) emit('load-users', true)
})

/** Notification configuration is committed by the dialog, so closing it restores the action snapshot. */
function openEditor() {
  originalAction.value = JSON.parse(JSON.stringify(props.action)) as SceneActionForm
  editorVisible.value = true
  emit('load-users', true)
}
function cancelEditor() {
  if (createdByPicker.value) emit('cancel-new')
  else if (originalAction.value) emit('change', originalAction.value)
  originalAction.value = undefined
  createdByPicker.value = false
  editorVisible.value = false
}
function saveEditor() {
  originalAction.value = undefined
  createdByPicker.value = false
  editorVisible.value = false
}

const loadUsers = (open: boolean) => {
  if (open) emit('load-users', true)
}

const handleUserPopupScroll = (event: Event) => {
  const target = event.target as HTMLElement
  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
    emit('load-more-users')
  }
}

const changeMethod = (channelId: string) => {
  const method = props.methods.find(item => item.id === channelId)
  if (method) emit('method-change', method)
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
</script>

<style scoped>
.notify-action-row { overflow: hidden; margin-bottom: var(--space-3, 12px); border: 1px solid var(--jet-theme-border-secondary); border-radius: var(--radius-jet-sm, 10px); }.notify-action-row > header { display: flex; gap: var(--space-3, 12px); align-items: center; min-height: 48px; padding: 0 var(--space-4, 16px); background: var(--ant-color-fill-quaternary); }.notify-action-row > header small { color: var(--ant-color-text-tertiary); }.notify-action-row__actions { display: inline-flex; gap: 2px; margin-left: auto; }.notify-action-row__description { padding: var(--space-4, 16px); overflow-wrap: anywhere; }
.notify-action-row--invalid { border-color: var(--ant-color-error); }
.notify-action-row__summary { display: grid; grid-template-columns: 22px 28px max-content minmax(0, 1fr) auto auto; gap: var(--space-3, 12px); align-items: center; min-width: 0; }
.notify-action-row__summary-text { min-width: 0; overflow: hidden; color: var(--ant-color-text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.notify-action-row__editor { display: grid; gap: var(--space-4, 16px); }
.notify-action-row__main { display: flex; flex-wrap: nowrap; align-items: center; min-width: max-content; gap: var(--space-3, 12px); min-height: 32px; }
.notify-action-row__index { display: grid; place-items: center; flex: none; width: 22px; height: 22px; color: var(--ant-color-primary); background: #eef4ff; border-radius: 50%; font-size: 12px; font-weight: 600; }
.notify-action-row__icon { display: grid; place-items: center; width: 28px; height: 28px; color: #d46b08; background: #fff7e8; border-radius: 6px; }
.notify-action-row__icon :deep(.anticon) { display: block; line-height: 1; }
.notify-action-row__label, .notify-action-row__content { color: var(--ant-color-text-secondary); font-size: 13px; }
.notify-action-row__method {
	flex: 0 0 var(--scene-linkage-compact-select-width, 8rem);
	width: var(--scene-linkage-compact-select-width, 8rem);
}
.notify-action-row__users {
	flex: 0 0 var(--scene-linkage-resource-select-width, 18rem);
	width: var(--scene-linkage-resource-select-width, 18rem);
	min-width: var(--scene-linkage-resource-select-width, 18rem);
}
.notify-action-row__content { display: flex; gap: var(--space-2, 8px); align-items: flex-start; width: 100%; max-width: 100%; box-sizing: border-box; padding-top: var(--space-3, 12px); line-height: 24px; }
.notify-action-row__content-label { display: inline-flex; flex: none; gap: var(--space-1, 4px); align-items: center; }
.notify-action-row__remove { flex: none; margin-left: auto; }
.notify-action-row__help { color: var(--ant-color-text-tertiary); cursor: help; }
.notify-action-row__template { flex: 1; min-width: 0; max-width: 100%; color: var(--ant-color-text); font-weight: 500; overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap; }
.notify-action-row__variable { display: inline-flex; align-items: center; margin: 0 2px; padding: 0 5px; color: var(--ant-color-primary); background: color-mix(in srgb, var(--ant-color-primary) 12%, var(--ant-color-bg-container)); border-radius: 4px; font-weight: 650; }
@media (max-width: 960px) { .notify-action-row__users { min-width: 180px; } .notify-action-row__content { padding-left: 0; } }
</style>
