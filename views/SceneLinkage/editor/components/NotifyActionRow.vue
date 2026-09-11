<template>
  <div :class="['notify-action-row', { 'notify-action-row--invalid': invalid }]">
    <div class="notify-action-row__main">
      <span class="notify-action-row__index">{{ index + 1 }}</span>
      <span class="notify-action-row__icon"><AIcon type="NotificationOutlined" /></span>
      <strong>{{ $t('IotSceneLinkage.action.sendNotify') }}</strong>
      <span class="notify-action-row__label">{{ $t('IotSceneLinkage.action.send') }}</span>
      <a-select
        class="notify-action-row__method"
        :value="methodValue"
        :loading="methodsLoading"
        :placeholder="$t('IotSceneLinkage.placeholder.notifyMethod')"
        :options="methodOptions"
        @change="changeMethod"
      />
      <span class="notify-action-row__label">{{ $t('IotSceneLinkage.action.to') }}</span>
      <a-select
        class="notify-action-row__users"
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
          <span v-if="segment.variable" class="notify-action-row__variable">{{ segment.text }}</span>
          <span v-else>{{ segment.text }}</span>
        </template>
      </span>
      <span v-else class="notify-action-row__template">{{ $t('IotSceneLinkage.action.notifyTemplate') }}</span>
      <a-button class="notify-action-row__remove" type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
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
}>()

const emit = defineEmits<{
  remove: []
  'load-users': [reset?: boolean]
  'load-more-users': []
  'method-change': [method: SceneNotifyMethod]
  change: [action: SceneActionForm]
}>()

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
  const segments: Array<{ text: string; variable: boolean }> = []
  const pattern = /\$\{[^}]+}/g
  let offset = 0
  let matched: RegExpExecArray | null
  while ((matched = pattern.exec(templateContent.value))) {
    if (matched.index > offset) segments.push({ text: templateContent.value.slice(offset, matched.index), variable: false })
    segments.push({ text: matched[0], variable: true })
    offset = matched.index + matched[0].length
  }
  if (offset < templateContent.value.length || !segments.length) segments.push({ text: templateContent.value.slice(offset), variable: false })
  return segments
})

onMounted(() => {
  if (recipientIds.value.length) emit('load-users', true)
})

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
</script>

<style scoped>
.notify-action-row { overflow-x: auto; padding: var(--space-4, 16px); margin-bottom: var(--space-3, 12px); border: 1px solid var(--jet-theme-border-secondary); border-radius: var(--radius-jet-sm, 10px); }
.notify-action-row--invalid { border-color: var(--ant-color-error); }
.notify-action-row__main { display: flex; flex-wrap: nowrap; align-items: center; min-width: max-content; gap: var(--space-3, 12px); min-height: 32px; }
.notify-action-row__index { display: grid; place-items: center; flex: none; width: 22px; height: 22px; color: var(--ant-color-primary); background: #eef4ff; border-radius: 50%; font-size: 12px; font-weight: 600; }
.notify-action-row__icon { display: grid; place-items: center; width: 28px; height: 28px; color: #d46b08; background: #fff7e8; border-radius: 6px; }
.notify-action-row__icon :deep(.anticon) { display: block; line-height: 1; }
.notify-action-row__label, .notify-action-row__content { color: var(--ant-color-text-secondary); font-size: 13px; }
.notify-action-row__method { width: 132px; }
.notify-action-row__users { flex: 1; min-width: 220px; }
.notify-action-row__content { display: flex; gap: var(--space-2, 8px); align-items: flex-start; width: 100%; max-width: 100%; box-sizing: border-box; padding: var(--space-3, 12px) 0 0 calc(22px + 28px + 3.5rem + 20px); line-height: 24px; }
.notify-action-row__content-label { display: inline-flex; flex: none; gap: var(--space-1, 4px); align-items: center; }
.notify-action-row__remove { flex: none; margin-left: auto; }
.notify-action-row__help { color: var(--ant-color-text-tertiary); cursor: help; }
.notify-action-row__template { flex: 1; min-width: 0; max-width: 100%; color: var(--ant-color-text); font-weight: 500; overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap; }
.notify-action-row__variable { display: inline-flex; align-items: center; margin: 0 2px; padding: 0 5px; color: var(--ant-color-primary); background: color-mix(in srgb, var(--ant-color-primary) 12%, var(--ant-color-bg-container)); border-radius: 4px; font-weight: 650; }
@media (max-width: 960px) { .notify-action-row__users { min-width: 180px; } .notify-action-row__content { padding-left: 0; } }
</style>
