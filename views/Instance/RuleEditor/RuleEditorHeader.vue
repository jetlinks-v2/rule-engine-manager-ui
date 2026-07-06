<template>
  <header class="rule-editor-shell__header">
    <div class="rule-editor-shell__title">
      <span class="rule-editor-shell__icon">
        <AIcon type="BranchesOutlined" />
      </span>
      <div class="rule-editor-shell__copy">
        <a-input
          v-if="nameEditing"
          ref="nameInputRef"
          v-model:value="nameDraft"
          class="rule-editor-shell__name-input"
          size="small"
          :maxlength="64"
          :placeholder="$t('RuleEditor.index.renamePlaceholder')"
          @blur="commitNameEdit"
          @pressEnter="commitNameEdit"
          @keyup.esc="cancelNameEdit"
        />
        <button
          v-else
          class="rule-editor-shell__name"
          type="button"
          :disabled="renameLoading"
          :title="$t('RuleEditor.index.renameRule')"
          @click="startNameEdit"
        >
          <span>{{ ruleName }}</span>
          <AIcon :type="renameLoading ? 'LoadingOutlined' : 'EditOutlined'" />
        </button>
        <span class="rule-editor-shell__id">{{ $t('RuleEditor.index.ruleId', [ruleId]) }}</span>
      </div>
    </div>
    <a-space class="rule-editor-shell__actions" :size="10">
      <a-tooltip :title="statusText">
        <span class="rule-editor-shell__status" :class="`rule-editor-shell__status--${statusColor}`" />
      </a-tooltip>
      <a-button-group class="rule-editor-shell__action-group">
        <a-button
          class="rule-editor-shell__action rule-editor-shell__action--save"
          :loading="actioning === 'save'"
          :disabled="saveDisabled"
          :title="$t('RuleEditor.index.saveDescription')"
          @click="$emit('execute', 'save')"
        >
          <template #icon>
            <AIcon :type="actionDone === 'save' ? 'CheckOutlined' : 'SaveOutlined'" />
          </template>
          {{ $t('RuleEditor.index.save') }}
        </a-button>
        <a-button
          type="primary"
          class="rule-editor-shell__action rule-editor-shell__action--deploy"
          :loading="actioning === 'deploy'"
          :disabled="deployDisabled"
          :title="$t(deployDisabled ? 'RuleEditor.index.deployUnavailable' : 'RuleEditor.index.deploy')"
          @click="$emit('execute', 'deploy')"
        >
          <template #icon>
            <AIcon :type="actionDone === 'deploy' ? 'CheckOutlined' : 'CloudUploadOutlined'" />
          </template>
          {{ $t(actioning === 'deploy' ? 'RuleEditor.index.deploying' : 'RuleEditor.index.deploy') }}
        </a-button>
      </a-button-group>
      <a-button class="rule-editor-shell__close" type="text" :title="$t('RuleEditor.index.close')" @click="$emit('close')">
        <template #icon>
          <AIcon type="CloseOutlined" />
        </template>
      </a-button>
    </a-space>
  </header>
</template>

<script setup lang="ts">
import { nextTick, ref, watch, type PropType } from 'vue';

const props = defineProps({
  ruleId: {
    type: String,
    required: true,
  },
  ruleName: {
    type: String,
    required: true,
  },
  statusColor: {
    type: String as PropType<'success' | 'error' | 'processing'>,
    required: true,
  },
  statusText: {
    type: String,
    required: true,
  },
  actioning: {
    type: String as PropType<'deploy' | 'save' | ''>,
    default: '',
  },
  actionDone: {
    type: String as PropType<'deploy' | 'save' | ''>,
    default: '',
  },
  renameLoading: {
    type: Boolean,
    default: false,
  },
  deployDisabled: {
    type: Boolean,
    default: false,
  },
  saveDisabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (e: 'execute', action: 'deploy' | 'save'): void;
  (e: 'rename', name: string): void;
  (e: 'close'): void;
}>();

const nameEditing = ref(false);
const nameDraft = ref('');
const nameInputRef = ref();

const startNameEdit = async () => {
  if (props.renameLoading) {
    return;
  }
  nameDraft.value = props.ruleName;
  nameEditing.value = true;
  await nextTick();
  nameInputRef.value?.focus?.();
};

const cancelNameEdit = () => {
  nameDraft.value = props.ruleName;
  nameEditing.value = false;
};

const commitNameEdit = () => {
  if (!nameEditing.value) {
    return;
  }
  const nextName = nameDraft.value.trim();
  nameEditing.value = false;
  if (!nextName || nextName === props.ruleName) {
    nameDraft.value = props.ruleName;
    return;
  }
  emit('rename', nextName);
};

watch(
  () => props.ruleName,
  (value) => {
    if (!nameEditing.value) {
      nameDraft.value = value;
    }
  },
  { immediate: true },
);
</script>

<style scoped lang="less">
.rule-editor-shell__header {
  display: flex;
  align-items: center; justify-content: space-between;
  height: 50px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}
.rule-editor-shell__title {
  display: flex; align-items: center;
  flex: 1;
  min-width: 0;
  gap: 12px;
}
.rule-editor-shell__icon {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  flex: none;
  width: 30px; height: 30px;
  overflow: hidden;
  color: var(--ant-primary-color, #1677ff);
  font-size: 16px;
  border: 1px solid rgba(22, 119, 255, 0.14);
  border-radius: 8px;
  background: rgba(22, 119, 255, 0.04);
}
.rule-editor-shell__copy {
  display: flex; flex-direction: column;
  min-width: 0;
}
.rule-editor-shell__name {
  display: inline-flex;
  align-items: center;
  max-width: 28rem;
  gap: 6px;
  padding: 0;
  color: rgba(0, 0, 0, 0.88);
  font: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .anticon {
    flex: none;
    color: rgba(0, 0, 0, 0.45);
    font-size: 12px;
    opacity: 0;
    transition: opacity 0.16s ease;
  }

  &:hover .anticon,
  &:focus-visible .anticon {
    opacity: 1;
  }

  &:disabled {
    cursor: default;

    .anticon {
      opacity: 1;
    }
  }
}
.rule-editor-shell__name,
.rule-editor-shell__name-input {
  min-width: 12rem;
  max-width: 28rem;
}
.rule-editor-shell__name span,
.rule-editor-shell__name-input {
    color: rgba(0, 0, 0, 0.88);
    font-size: 16px;
    font-weight: 600;
    line-height: 22px;
}
.rule-editor-shell__id {
  overflow: hidden;
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rule-editor-shell__status {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%; background: #d9d9d9;
}
.rule-editor-shell__status--success { background: #52c41a; box-shadow: 0 0 0 3px rgba(82, 196, 26, 0.12); }
.rule-editor-shell__status--processing { background: var(--ant-primary-color, #1677ff); box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.12); }
.rule-editor-shell__status--error { background: #ff4d4f; box-shadow: 0 0 0 3px rgba(255, 77, 79, 0.12); }
.rule-editor-shell__actions { flex: none; }
.rule-editor-shell__action-group {
  display: inline-flex; align-items: center;
  gap: 2px; padding: 2px;
  border: 1px solid #dce4f2;
  border-radius: 10px;
  background: #f4f7fb;
}
.rule-editor-shell__action-group :deep(.rule-editor-shell__action) {
  display: inline-flex; align-items: center;
  height: 32px; padding: 0 12px;
  border: 0;
  border-radius: 8px !important;
  font-weight: 500;
  box-shadow: none;
}
.rule-editor-shell__action-group :deep(.rule-editor-shell__action--save) {
  color: rgba(0, 0, 0, 0.72); background: transparent;
}
.rule-editor-shell__action-group :deep(.rule-editor-shell__action--save:not(:disabled):hover),
.rule-editor-shell__action-group :deep(.rule-editor-shell__action--save:not(:disabled):focus-visible) {
  color: var(--ant-primary-color, #1677ff); background: #fff;
}
.rule-editor-shell__action-group :deep(.rule-editor-shell__action--deploy:not(:disabled)) {
  box-shadow: 0 6px 14px rgba(22, 119, 255, 0.22);
}
.rule-editor-shell__close {
  width: 32px; height: 32px;
  color: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
}
.rule-editor-shell__close:hover,
.rule-editor-shell__close:focus-visible {
  color: rgba(0, 0, 0, 0.88); background: #f5f7fa;
}
</style>
