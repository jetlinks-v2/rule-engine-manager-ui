<template>
  <a-modal :open="true" :title="$t('IotSceneLinkage.action.sendNotify')" :mask-closable="false" @cancel="$emit('cancel')" @ok="save">
    <a-form layout="vertical">
      <a-form-item :label="$t('IotSceneLinkage.placeholder.notifyMethod')" required>
        <a-select v-model:value="form.notifyChannelIds" :options="methodOptions" :loading="loading" mode="multiple" :max-count="1" />
      </a-form-item>
      <a-form-item :label="$t('IotSceneLinkage.placeholder.notifyUsers')" required>
        <a-select v-model:value="form.userIds" :options="userOptions" :loading="loading" mode="multiple" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { querySceneNotifyChannels, querySceneNotifyUsers } from '@rule-engine-manager-ui/api/scene-linkage'
import { normalizeResult } from '@rule-engine-manager-ui/views/SceneLinkage/utils'

const props = defineProps({
  value: {
    type: Object,
    default: () => ({}),
  },
})
const emit = defineEmits(['cancel', 'save'])
const { t } = useI18n()
const loading = ref(false)
const methods = ref<any[]>([])
const users = ref<any[]>([])
const form = reactive({
  notifyChannelIds: [...(props.value?.notifyChannelIds || [])],
  userIds: [...(props.value?.userIds || [])],
})

const methodOptions = computed(() => methods.value.map(item => ({ label: item.name, value: item.id })))
const userOptions = computed(() => users.value.map(item => ({
  label: item.email || item.telephone || item.username ? `${item.name || item.username} (${item.email || item.telephone || item.username})` : item.name,
  value: item.id,
})))

/** 详细模式沿用 SaaS 场景通知 Provider，不能回退到已下线的 notify 管理能力。 */
async function loadOptions() {
  loading.value = true
  try {
    const [channelsResponse, usersResponse] = await Promise.all([
      querySceneNotifyChannels(),
      querySceneNotifyUsers({ paging: false }),
    ])
    methods.value = normalizeResult<any>(channelsResponse).data
      .filter(provider => provider.provider === 'scene')
      .flatMap(provider => (provider.channels || []).map((channel: any) => ({
        id: channel.id,
        name: channel.name || channel.channelProvider,
      })))
    users.value = normalizeResult<any>(usersResponse).data
  } finally {
    loading.value = false
  }
}

function save() {
  if (!form.notifyChannelIds.length || !form.userIds.length) {
    onlyMessage(t('IotSceneLinkage.message.notifyRequired'), 'warning')
    return
  }
  emit('save', { ...form }, {})
}

onMounted(() => void loadOptions())
</script>
