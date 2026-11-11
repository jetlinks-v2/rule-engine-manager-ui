<template>
  <NotifyActionRow
    dialog-only
    :action="action"
    :index="0"
    :auto-open="true"
    :methods="methods"
    :users="users"
    :methods-loading="methodsLoading"
    :users-loading="usersLoading"
    @change="updateAction"
    @method-change="changeMethod"
    @load-users="loadUsers"
    @load-more-users="loadUsers(false)"
    @cancel-new="$emit('cancel')"
    @saved="save"
  />
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { queryCurrentSceneNotifyUser, querySceneNotifyChannels, querySceneNotifyUsers, type SceneNotifyMethod, type SceneNotifyUser } from '@rule-engine-manager-ui/api/scene-linkage'
import { normalizeResult, type SceneActionForm } from '@rule-engine-manager-ui/views/SceneLinkage/utils'
import { canReceiveProfileBackedNotification, mergeNotifyUsersById } from '@rule-engine-manager-ui/utils/notifyUser'
import NotifyActionRow from '@rule-engine-manager-ui/views/SceneLinkage/editor/components/NotifyActionRow.vue'

const props = defineProps({
  value: {
    type: Object,
    default: () => ({}),
  },
})
const emit = defineEmits(['cancel', 'save'])
const { t } = useI18n()
const methodsLoading = ref(false)
const usersLoading = ref(false)
const methods = ref<SceneNotifyMethod[]>([])
const users = ref<SceneNotifyUser[]>([])
const usersPageIndex = ref(-1)
const usersTotal = ref(0)
const action = reactive<SceneActionForm>({
  type: 'sceneNotify',
  config: {
    notifyChannelIds: [...(props.value?.notifyChannelIds || [])],
    userIds: [...(props.value?.userIds || [])],
  },
  options: {},
})

/** 与快速模式共用通知动作组件和收件人权限边界，详细模式仅适配原版 action.configuration。 */
async function loadMethods() {
  if (methodsLoading.value) return
  methodsLoading.value = true
  try {
    const providers = normalizeResult<any>(await querySceneNotifyChannels()).data
    methods.value = providers
      .filter(provider => provider.provider === 'scene')
      .flatMap(provider => (provider.channels || []).map((channel: any) => ({
        id: channel.id,
        providerId: provider.id || provider.provider,
        name: channel.name || channel.channelProvider,
        channelProvider: channel.channelProvider,
      })))
      .filter(method => method.id && method.providerId && (method.channelProvider?.startsWith('notifier-') || ['inside-mail', 'inbox'].includes(method.channelProvider)))
  } finally {
    methodsLoading.value = false
  }
}

const toUsers = (value: any[]): SceneNotifyUser[] => value
  .map(user => ({ id: String(user.id || ''), name: user.name, username: user.username, email: user.email, telephone: user.telephone }))
  .filter(user => Boolean(user.id))

async function loadUsers(reset = true) {
  if (usersLoading.value || (!reset && users.value.length >= usersTotal.value)) return
  const pageIndex = reset ? 0 : usersPageIndex.value + 1
  const selectedUserIds = (action.config?.userIds || []).map(String).filter(Boolean)
  usersLoading.value = true
  try {
    const [pageResponse, selectedResponse, currentUserResponse] = await Promise.all([
      querySceneNotifyUsers({ pageIndex, pageSize: 20 }),
      reset && selectedUserIds.length ? querySceneNotifyUsers({ paging: false, userIds: selectedUserIds }).catch(() => undefined) : Promise.resolve(undefined),
      reset ? queryCurrentSceneNotifyUser().catch(() => undefined) : Promise.resolve(undefined),
    ])
    const page = normalizeResult(pageResponse)
    const selected = selectedResponse ? toUsers(normalizeResult(selectedResponse).data) : []
    const current = currentUserResponse ? toUsers([currentUserResponse.result ?? currentUserResponse])[0] : undefined
    const currentOption = current && (selectedUserIds.includes(current.id) || methods.value.some(method => canReceiveProfileBackedNotification(current, method.channelProvider))) ? [current] : []
    const retained = reset ? users.value.filter(user => selectedUserIds.includes(user.id)) : users.value
    users.value = mergeNotifyUsersById(retained, mergeNotifyUsersById(currentOption, mergeNotifyUsersById(selected, toUsers(page.data))))
    usersPageIndex.value = pageIndex
    usersTotal.value = Number(page.total ?? pageIndex * 20 + page.data.length)
  } finally {
    usersLoading.value = false
  }
}

function updateAction(value: SceneActionForm) {
  Object.assign(action, value)
}

function changeMethod(method: SceneNotifyMethod) {
  action.config = { ...action.config, notifyChannelIds: [method.id] }
  action.options = { ...action.options, channelName: method.name }
}

function save(value: SceneActionForm) {
  if (!value.config?.notifyChannelIds?.length || !value.config?.userIds?.length) {
    onlyMessage(t('IotSceneLinkage.message.notifyRequired'), 'warning')
    return
  }
  emit('save', value.config, {
    ...value.options,
    channelName: methods.value.find(method => value.config?.notifyChannelIds?.includes(method.id))?.name || value.options?.channelName,
    users: users.value.filter(user => value.config?.userIds?.includes(user.id)).map(user => ({ id: user.id, name: user.name })),
  })
}

onMounted(() => { void loadMethods(); void loadUsers(true) })
</script>
