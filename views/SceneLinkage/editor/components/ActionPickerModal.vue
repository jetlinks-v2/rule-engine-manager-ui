<template>
  <a-modal
    :open="open"
    :footer="null"
    :width="520"
    :mask-closable="false"
    wrap-class-name="action-picker-modal"
    @cancel="$emit('cancel')"
  >
    <template #title>
      <div class="action-picker__title">
        <span>{{ $t('IotSceneLinkage.title.actionPicker') }}</span>
        <small>{{ $t('IotSceneLinkage.editor.actionPickerHint') }}</small>
      </div>
    </template>
    <div class="action-picker__items">
      <button
        v-for="item in actions"
        :key="item.value"
        class="action-picker__item"
        @click="select(item.value)"
      >
        <span class="action-picker__icon" :style="item.iconStyle"><AIcon :type="item.icon" /></span>
        <span class="action-picker__content"><b>{{ item.label }}</b><small>{{ item.description }}</small></span>
      </button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type ActionType = 'delay' | 'device' | 'sceneNotify'

const props = defineProps<{
  open: boolean
  supportedActions: string[]
}>()
const emit = defineEmits<{
  cancel: []
  selectDelay: []
  selectDevice: []
  selectNotify: []
}>()

const { t } = useI18n()
const actions = computed(() => [
  {
    value: 'delay' as const,
    provider: 'delay',
    icon: 'ClockCircleOutlined',
    label: t('IotSceneLinkage.action.delay'),
    description: t('IotSceneLinkage.actionDesc.delay'),
    iconStyle: { color: '#6c4fe0', background: '#efebff' },
  },
  {
    value: 'device' as const,
    provider: 'device',
    icon: 'ControlOutlined',
    label: t('IotSceneLinkage.action.device'),
    description: t('IotSceneLinkage.actionDesc.device'),
    iconStyle: { color: '#1e5eff', background: '#e8f0ff' },
  },
  {
    value: 'sceneNotify' as const,
    provider: 'sceneNotify',
    icon: 'NotificationOutlined',
    label: t('IotSceneLinkage.action.notify'),
    description: t('IotSceneLinkage.actionDesc.notify'),
    iconStyle: { color: '#d46b08', background: '#fff7e8' },
  },
].filter(item => props.supportedActions.includes(item.provider)))

function select(type: ActionType) {
  if (type === 'delay') emit('selectDelay')
  else if (type === 'device') emit('selectDevice')
  else emit('selectNotify')
}
</script>

<style scoped>
:global(.action-picker-modal .ant-modal-header) {
	margin-bottom: 0 !important;
}

:global(.action-picker-modal .ant-modal-title) {
	padding-bottom: var(--space-1, 4px) !important;
}

:global(.action-picker-modal .ant-modal-body) {
	padding-top: 0;
}

.action-picker__title {
	display: flex;
	gap: var(--space-2, 8px);
	align-items: baseline;
	min-width: 0;
}

.action-picker__title span {
	flex: none;
}

.action-picker__title small {
	overflow: hidden;
	color: var(--ant-color-text-tertiary);
	font-size: .75rem;
	font-weight: 400;
	line-height: 1rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.action-picker__items {
	display: grid;
	gap: var(--space-2, 8px);
	padding-top: var(--space-2, 8px);
}

.action-picker__item {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: 76px;
	gap: var(--space-3, 12px);
	padding: var(--space-4, 16px);
	text-align: left;
	background: var(--ant-color-bg-container);
	border: 1px solid #d9dfe8;
	border-radius: var(--radius-jet-sm, 10px);
	cursor: pointer;
	transition: border-color .2s, background-color .2s, box-shadow .2s;
}

.action-picker__item:hover {
	border-color: var(--ant-color-primary);
	background: var(--ant-color-primary-bg);
	box-shadow: 0 2px 8px rgb(22 119 255 / 8%);
}

.action-picker__content {
	display: grid;
	flex: 1;
	gap: var(--space-1, 4px);
}

.action-picker__content b {
	font-size: 15px;
	color: var(--jet-theme-text)
}

.action-picker__content small {
	color: var(--jet-theme-text-description);
}

.action-picker__icon {
	display: grid;
	flex: none;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: var(--radius-jet-sm, 10px);
	font-size: 20px;
}
</style>
