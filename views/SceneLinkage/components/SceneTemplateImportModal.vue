<template>
  <a-modal
    :open="true"
    :title="$t('IotSceneLinkage.title.importTemplate')"
    :confirm-loading="loading"
    :ok-button-props="{ disabled: !template }"
    @cancel="emit('close')"
    @ok="submit"
  >
    <a-upload-dragger
      accept=".json,application/json"
      :show-upload-list="false"
      :before-upload="readTemplate"
    >
      <p class="scene-template-import__icon"><AIcon type="InboxOutlined" /></p>
      <p>{{ $t('IotSceneLinkage.template.uploadHint') }}</p>
      <p class="scene-template-import__tip">{{ $t('IotSceneLinkage.template.sizeHint') }}</p>
    </a-upload-dragger>
    <a-alert
      v-if="fileName"
      class="scene-template-import__file"
      type="success"
      show-icon
      :message="$t('IotSceneLinkage.template.selected', { name: fileName })"
    />
    <a-alert
      v-if="errorMessage"
      class="scene-template-import__file"
      type="error"
      show-icon
      :message="$t(errorMessage)"
    />
  </a-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onlyMessage } from '@jetlinks-web-core/utils/comm'
import { createSceneLinkage } from '../../../api/scene-linkage'
import { parseSceneTemplate } from '../sceneCompatibility'

const MAX_TEMPLATE_SIZE = 10 * 1024 * 1024

const emit = defineEmits(['close', 'success'])
const { t } = useI18n()
const loading = ref(false)
const fileName = ref('')
const errorMessage = ref('')
const template = ref<Record<string, any>>()

/** 只在文件完整通过格式和规则边界校验后保存导入内容，避免后续创建半成品。 */
function setTemplate(file: File, content: string) {
  try {
    const result = parseSceneTemplate(JSON.parse(content))
    if (!result.supported || !result.data) {
      errorMessage.value = result.reason || 'IotSceneLinkage.message.invalidTemplate'
      template.value = undefined
      return
    }
    fileName.value = file.name
    template.value = result.data
    errorMessage.value = ''
  } catch {
    template.value = undefined
    errorMessage.value = 'IotSceneLinkage.message.invalidTemplate'
  }
}

/** 在浏览器本地读取模板，不上传源文件；场景创建只在用户确认后发生。 */
function readTemplate(file: File) {
  fileName.value = ''
  template.value = undefined
  errorMessage.value = ''
  if (!file.name.toLowerCase().endsWith('.json')) {
    errorMessage.value = 'IotSceneLinkage.message.templateFileType'
    return false
  }
  if (file.size > MAX_TEMPLATE_SIZE) {
    errorMessage.value = 'IotSceneLinkage.message.templateTooLarge'
    return false
  }
  const reader = new FileReader()
  reader.onload = event => setTemplate(file, String(event.target?.result || ''))
  reader.onerror = () => {
    errorMessage.value = 'IotSceneLinkage.message.templateReadFailed'
  }
  reader.readAsText(file, 'utf-8')
  return false
}

async function submit() {
  if (!template.value) return
  loading.value = true
  try {
    await createSceneLinkage(template.value)
    onlyMessage(t('IotSceneLinkage.message.templateImported', { name: template.value.name }), 'success')
    emit('success')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.scene-template-import__icon {
  margin-bottom: var(--space-2);
  font-size: 36px;
  color: var(--ant-color-primary);
}

.scene-template-import__tip {
  color: var(--ant-color-text-tertiary);
}

.scene-template-import__file {
  margin-top: var(--space-4);
}
</style>
