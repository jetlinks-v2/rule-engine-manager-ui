<template>
  <SceneNodeCard v-if="!dialogOnly" :class="['notify-action-row', { 'notify-action-row--invalid': invalid }]" :title="$t('IotSceneLinkage.action.sendNotify')" icon="NotificationOutlined" :number="index + 1">
    <template #actions><a-tooltip :title="$t('IotSceneLinkage.action.edit')"><a-button type="text" @click="openEditor"><AIcon type="EditOutlined" /></a-button></a-tooltip><a-button type="text" danger @click="$emit('remove')"><AIcon type="DeleteOutlined" /></a-button></template>
    <SceneNotifySummary :config="action.config" :options="action.options" :users="users" :methods="methods" />
  </SceneNodeCard>

  <a-modal :open="editorVisible" :title="$t('IotSceneLinkage.action.sendNotify')" :mask-closable="false" @cancel="cancelEditor" @ok="saveEditor">
    <a-form class="notify-action-row__editor" layout="vertical">
      <a-form-item :label="$t('IotSceneLinkage.form.notifyMethod')" required>
        <a-select
          class="notify-action-row__method"
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
      <a-form-item :label="$t('IotSceneLinkage.form.notifyRecipients')" required>
        <a-select
          class="notify-action-row__users"
          popup-class-name="scene-editor__resource-dropdown"
          :dropdown-match-select-width="false"
          mode="multiple"
          max-tag-count="responsive"
          :value="recipientIds"
          :loading="usersLoading"
          :placeholder="$t('IotSceneLinkage.placeholder.notifyUsers')"
          :aria-label="$t('IotSceneLinkage.form.notifyRecipients')"
          :options="userOptions"
          @dropdownVisibleChange="loadUsers"
          @popupScroll="handleUserPopupScroll"
          @change="changeRecipients"
        />
      </a-form-item>
      <p class="notify-action-row__hint">{{ $t('IotSceneLinkage.hint.notifyContentTemplate') }}</p>
    </a-form>
    <SceneConfigPreview class="notify-action-row__preview" :hint="!methodValue || !recipientIds.length ? $t('IotSceneLinkage.message.notifyRequired') : undefined"><SceneNotifySummary :config="action.config" :options="action.options" :users="users" :methods="methods" /></SceneConfigPreview>
  </a-modal>
</template>

<script setup lang="ts">
import SceneConfigPreview from './SceneConfigPreview.vue'
import { computed, onMounted, ref, watch } from 'vue'
import SceneNodeCard from './SceneNodeCard.vue'
import SceneNotifySummary from './SceneNotifySummary.vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import type { SceneNotifyMethod, SceneNotifyUser } from '../../../../api/scene-linkage'
import { formatNotificationRecipient } from '../notificationSummary'
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
const recipientIds = computed(() => props.action.config?.userIds || [])
const methodOptions = computed(() => props.methods.map(method => ({
  label: method.name,
  value: method.id,
})))
const userOptions = computed(() => props.users.map(user => ({
  label: formatNotificationRecipient(user),
  value: user.id,
})))
const editorVisible = ref(false)
const originalAction = ref<SceneActionForm>()
const createdByPicker = ref(false)


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
  if (!methodValue.value || !recipientIds.value.length) {
    onlyMessage(t('IotSceneLinkage.message.notifyRequired'), 'warning')
    return
  }
  // 名称只写入 options 展示元数据，运行时仍使用原有渠道和用户 ID。
  const action = {
    ...props.action,
    options: {
      ...props.action.options,
      channelName: props.methods.find(method => method.id === methodValue.value)?.name || props.action.options?.channelName,
      users: props.users.filter(user => recipientIds.value.includes(user.id)).map(user => ({ id: user.id, name: user.name, username: user.username })),
    },
  }
  emit('change', action)
  emit('saved', action)
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
.notify-action-row { margin-bottom: var(--space-3, 12px); }
.notify-action-row--invalid { border-color: var(--ant-color-error); }
.notify-action-row__editor { display: grid; gap: var(--space-4, 16px); min-width: 0; }
.notify-action-row__editor :deep(.ant-form-item) { margin-bottom: 0; }
.notify-action-row__method, .notify-action-row__users { width: 100%; min-width: 0; }
.notify-action-row__hint { margin: 0; color: var(--jet-theme-text-secondary, #595959); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.notify-action-row__preview :deep(.scene-summary-parts__field) { display: inline-block; max-width: calc(100% - 4px); box-sizing: border-box; }
</style>
