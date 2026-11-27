<template>
  <header class="rule-editor-shell__header">
    <div class="rule-editor-shell__title">
      <IconLibrary size="small" :type="ruleIcon" :disabled="iconLoading" :save="saveIcon" :label="$t('components.IconLibrary.title')" />
      <div class="rule-editor-shell__copy">
        <InputEditable class="rule-editor-shell__name" :value="ruleName" trigger="text" size="small"
          :max-length="64" :disabled="renameLoading" :save="saveName"
          :label="$t('RuleEditor.index.renameRule')" :placeholder="$t('RuleEditor.index.renamePlaceholder')" />
        <div class="rule-editor-shell__meta">
          <span class="rule-editor-shell__id">{{ $t('RuleEditor.index.ruleId', [ruleId]) }}</span>
          <span class="rule-editor-shell__meta-separator" />
          <InputEditable class="rule-editor-shell__description" :value="ruleDescription" textarea trigger="text" size="small"
            :max-length="256" :disabled="descriptionLoading" :save="saveDescription"
            :label="$t('RuleEditor.index.editDescription')" :placeholder="$t('RuleEditor.index.descriptionEmpty')" />
        </div>
      </div>
    </div>
    <a-space class="rule-editor-shell__actions" :size="10">
      <a-tooltip :title="statusText">
        <span class="rule-editor-shell__status" :class="`rule-editor-shell__status--${statusColor}`" />
      </a-tooltip>
      <a-button-group class="rule-editor-shell__action-group rule-editor-shell__transfer-group">
        <a-button
          class="rule-editor-shell__action rule-editor-shell__action--transfer"
          :loading="transferActioning === 'import'"
          :disabled="importDisabled"
          :title="$t('RuleEditor.index.importDescription')"
          @click="$emit('transfer', 'import')"
        >
          <template #icon>
            <AIcon type="ImportOutlined" />
          </template>
          {{ $t('RuleEditor.index.import') }}
        </a-button>
        <a-button
          class="rule-editor-shell__action rule-editor-shell__action--transfer"
          :loading="transferActioning === 'export'"
          :disabled="exportDisabled"
          :title="$t('RuleEditor.index.exportDescription')"
          @click="$emit('transfer', 'export')"
        >
          <template #icon>
            <AIcon type="ExportOutlined" />
          </template>
          {{ $t('RuleEditor.index.export') }}
        </a-button>
      </a-button-group>
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
import InputEditable from '@jetlinks-web-core/components/Editable/InputEditable.vue';
import IconLibrary from '@jetlinks-web-core/components/IconLibrary/index.vue';
import type { PropType } from 'vue';

defineProps({
  ruleIcon: { type: String, default: 'BranchesOutlined' },
  iconLoading: Boolean,
  saveName: { type: Function as PropType<(value: string) => Promise<boolean>>, required: true },
  saveDescription: { type: Function as PropType<(value: string) => Promise<boolean>>, required: true },
  saveIcon: { type: Function as PropType<(value: string) => Promise<boolean>>, required: true },
  ruleId: {
    type: String,
    required: true,
  },
  ruleName: {
    type: String,
    required: true,
  },
  ruleDescription: {
    type: String,
    default: '',
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
  transferActioning: {
    type: String as PropType<'import' | 'export' | ''>,
    default: '',
  },
  renameLoading: {
    type: Boolean,
    default: false,
  },
  descriptionLoading: {
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
  importDisabled: {
    type: Boolean,
    default: false,
  },
  exportDisabled: {
    type: Boolean,
    default: false,
  },
});

defineEmits<{
  (e: 'execute', action: 'deploy' | 'save'): void;
  (e: 'transfer', action: 'import' | 'export'): void;
  (e: 'close'): void;
}>();
</script>

<style src="./RuleEditorHeader.less" scoped lang="less" />
