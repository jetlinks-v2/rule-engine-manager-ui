<template>
  <a-modal
    :open="open"
    :footer="null"
    :width="680"
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
    <div class="action-picker__body">
      <div class="action-picker__items">
        <button
          v-for="item in actions"
          :key="item.value"
          class="action-picker__item"
          @click="select(item.value)"
        >
          <span class="action-picker__icon"><AIcon :type="item.icon" /></span>
          <span class="action-picker__content"><b>{{ item.label }}</b><small>{{ item.description }}</small></span>
          <AIcon class="action-picker__arrow" type="RightOutlined" />
        </button>
      </div>
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
  },
  {
    value: 'device' as const,
    provider: 'device',
    icon: 'ControlOutlined',
    label: t('IotSceneLinkage.action.device'),
    description: t('IotSceneLinkage.actionDesc.device'),
  },
  {
    value: 'sceneNotify' as const,
    provider: 'sceneNotify',
    icon: 'NotificationOutlined',
    label: t('IotSceneLinkage.action.notify'),
    description: t('IotSceneLinkage.actionDesc.notify'),
  },
].filter(item => props.supportedActions.includes(item.provider)))

function select(type: ActionType) {
  if (type === 'delay') emit('selectDelay')
  else if (type === 'device') emit('selectDevice')
  else emit('selectNotify')
}
</script>

<style scoped>
:global(.action-picker-modal .ant-modal-content) {
	padding: 1rem;
	overflow: hidden;
	background: linear-gradient(180deg, #bad6ff 0%, #ebf3ff 10%, #fff 31%);
	border-radius: 1.25rem;
	box-shadow: none;
}

:global(.action-picker-modal .ant-modal-header) {
	margin-bottom: 0 !important;
}

:global(.action-picker-modal .ant-modal-title) {
	padding-bottom: var(--space-1, 4px) !important;
}

:global(.action-picker-modal .ant-modal-body) {
	padding: 0;
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
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--space-3, 12px);
}

.action-picker__body {
	padding: var(--space-2, 8px) .875rem .75rem;
	background: rgb(255 255 255 / 70%);
	border: 1px solid #eceff3;
	border-radius: 1rem;
}

.action-picker__item {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: 4.125rem;
	gap: var(--space-3, 12px);
	padding: .6875rem .9375rem;
	text-align: left;
	background: linear-gradient(123deg, #fff 0%, #f8fbff 100%);
	border: 1px solid #f1f5f9;
	border-radius: .5rem;
	cursor: pointer;
	transition: border-color .2s, background-color .2s;
}

.action-picker__item:hover {
	border-color: #1e72f0;
	background: #e8f3ff;
}

.action-picker__item:hover .action-picker__icon {
	color: #fff;
	background: #3b82f6;
	border-color: #3b82f6;
}

.action-picker__item:hover .action-picker__arrow {
	color: #1e72f0;
}

.action-picker__content {
	display: grid;
	flex: 1;
	gap: var(--space-1, 4px);
}

.action-picker__content b {
	color: #1d2129;
	font-size: .875rem;
	font-weight: 500;
	line-height: 1.25rem;
}

.action-picker__content small {
	overflow: hidden;
	color: #4e5969;
	font-size: .75rem;
	font-weight: 400;
	line-height: 1rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.action-picker__icon {
	display: grid;
	flex: none;
	place-items: center;
	width: 2.5rem;
	height: 2.5rem;
	color: #1e72f0;
	background: linear-gradient(180deg, #f6f9fe 0%, #fefefe 100%);
	border: 1px solid #f3f7fc;
	border-radius: 50%;
	transition: color .2s, background-color .2s, border-color .2s;
}

.action-picker__icon :deep(.anticon) { font-size: 1.25rem; }
.action-picker__arrow { flex: none; color: var(--ant-color-text-tertiary); transition: color .2s; }

@media (max-width: 640px) { .action-picker__items { grid-template-columns: 1fr; } }
</style>
