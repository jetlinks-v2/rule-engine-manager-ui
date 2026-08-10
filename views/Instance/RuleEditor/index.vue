<template>
  <a-drawer
    class="rule-editor-drawer"
    :open="open"
    :width="'100%'"
    placement="right"
    :closable="false"
    :mask-closable="false"
    :destroy-on-close="true"
    :header-style="{ display: 'none' }"
    :body-style="{ padding: 0, overflow: 'hidden' }"
    @close="handleClose"
  >
    <section class="rule-editor-shell">
      <RuleEditorHeader
        :rule-id="ruleId"
        :rule-name="ruleName"
        :rule-description="ruleDescription"
        :status-color="bridgeStatusColor"
        :status-text="bridgeStatusText"
        :actioning="editorActioning"
        :action-done="editorActionDone"
        :transfer-actioning="editorTransferActioning"
        :rename-loading="ruleNameSaving"
        :description-loading="ruleDescriptionSaving"
        :deploy-disabled="isEditorActionDisabled('deploy')"
        :save-disabled="isEditorActionDisabled('save')"
        :import-disabled="isEditorActionDisabled('import')"
        :export-disabled="isEditorActionDisabled('export')"
        @execute="handleEditorAction"
        @transfer="handleEditorTransfer"
        @rename="handleRuleRename"
        @description-change="handleRuleDescriptionChange"
        @close="handleClose"
      />
      <div class="rule-editor-shell__body">
        <iframe
          v-if="editorUrl"
          :key="editorUrl"
          ref="iframeRef"
          class="rule-editor-shell__iframe"
          :src="editorUrl"
          :title="$t('RuleEditor.index.frameTitle')"
          @load="handleFrameLoaded"
        />
        <div v-if="showFrameLoading" class="rule-editor-shell__loading">
          <a-spin />
          <span>{{ bridgeStatusText }}</span>
        </div>
      </div>
    </section>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAIStore } from '@jetlinks-web-core/store';
import { getBaseApi, isFromCloud } from '@jetlinks-web-core/utils';
import RuleEditorHeader from './RuleEditorHeader.vue';
import { useRuleEditorActions } from './useRuleEditorActions';
import { useRuleEditorAgentBridge } from './useRuleEditorAgentBridge';
import { useRuleEditorAgentComposerExtensions } from './useRuleEditorAgentComposerExtensions';

const RULE_EDITOR_CLIENT_ID = 'ruleEditorChat';
const RULE_EDITOR_SUBJECT_TYPE = 'ruleInstance';
const RULE_EDITOR_RESOURCE_VERSION = '2026072907';

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  rule: {
    type: Object as PropType<Record<string, any> | undefined>,
    default: undefined,
  },
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated', rule: Record<string, any>): void;
}>();

const { t: $t } = useI18n();
const aiStore = useAIStore();
const ruleId = computed(() => String(props.rule?.id || ''));
const ruleName = computed(() => String(props.rule?.name || props.rule?.id || '--'));
const ruleDescription = computed(() => String(props.rule?.description || '').trim());
const iframeRef = ref<HTMLIFrameElement>();
const frameLoaded = ref(false);
const bridge = useRuleEditorAgentBridge({ ruleId });
const bridgeStatus = computed(() => bridge.status.value);
const bridgeActions = computed<Record<'deploy' | 'save' | 'import' | 'export', boolean | undefined>>(() => ({
  deploy: bridge.context.value?.actions?.deploy,
  save: bridge.context.value?.actions?.save,
  import: bridge.context.value?.actions?.import,
  export: bridge.context.value?.actions?.export,
}));
const composerExtensions = useRuleEditorAgentComposerExtensions({
  context: bridge.context, previewNode: bridge.previewNode, listNodes: bridge.listNodesForReference, t: $t,
});
watch(iframeRef, (value) => {
  bridge.iframeRef.value = value;
});

const normalizeBaseUrl = (value: unknown) => String(value || '').replace(/\/$/, '');

const editorUrl = computed(() => {
  if (!props.open || !ruleId.value) {
    return '';
  }

  const query = new URLSearchParams();
  query.set('v', RULE_EDITOR_RESOURCE_VERSION);
  query.set('_parentOrigin', window.location.origin);
  query.set('hideHeader', 'true');
  let baseUrl = normalizeBaseUrl(getBaseApi());

  if (isFromCloud()) {
    baseUrl = normalizeBaseUrl(localStorage.getItem('proxy'));
    const thingId = localStorage.getItem('thingId');
    if (thingId) {
      query.set('_agent', `device:${thingId}`);
    }
  }

  // Node-RED 会重写 hash，嵌入态参数必须放在 search 中才能跨 hash 更新保留。
  return `${baseUrl}/rule-editor/index.html?${query.toString()}#flow/${encodeURIComponent(ruleId.value)}`;
});

const bridgeStatusText = computed(() => {
  if (bridgeStatus.value === 'ready') {
    return $t('RuleEditor.index.bridgeReady');
  }
  if (bridgeStatus.value === 'error') {
    return $t('RuleEditor.index.bridgeError');
  }
  return bridgeStatus.value === 'loading'
    ? $t('RuleEditor.index.bridgeLoading')
    : $t('RuleEditor.index.loading');
});

const bridgeStatusColor = computed(() => {
  if (bridgeStatus.value === 'ready') {
    return 'success';
  }
  if (bridgeStatus.value === 'error') {
    return 'error';
  }
  return 'processing';
});
const showFrameLoading = computed(() => !frameLoaded.value && (bridgeStatus.value === 'loading' || bridgeStatus.value === 'idle'));
const {
  editorActioning,
  editorActionDone,
  editorTransferActioning,
  ruleNameSaving,
  ruleDescriptionSaving,
  clearEditorActionDone,
  handleEditorAction,
  handleEditorTransfer,
  handleRuleRename,
  handleRuleDescriptionChange,
} = useRuleEditorActions({
  bridge,
  bridgeStatus,
  bridgeActions,
  ruleId,
  ruleName,
  ruleDescription,
  getRule: () => props.rule,
  onRuleUpdated: (rule) => emit('updated', rule),
  t: $t,
});
const isEditorActionDisabled = (action: 'deploy' | 'save' | 'import' | 'export') => (
  bridgeStatus.value !== 'ready'
  || !!editorActioning.value
  || !!editorTransferActioning.value
  || bridgeActions.value[action] === false
);

const buildSystemPrompt = () => [
  $t('RuleEditor.agent.system.role'), $t('RuleEditor.agent.system.userConstraints'),
  $t('RuleEditor.agent.system.compact'),
  $t('RuleEditor.agent.system.templateSemantics'),
  $t('RuleEditor.agent.system.presentation'),
].join('\n');

const buildAgentParameters = () => ({
  ruleId: ruleId.value,
  ruleName: ruleName.value,
  subjectType: RULE_EDITOR_SUBJECT_TYPE,
  subjectId: ruleId.value,
  subjectName: ruleName.value,
  clientTools: bridge.clientTools.value,
  clientToolsVersion: bridge.version.value,
  clientToolHandler: bridge.handleClientToolCall,
  clientToolsName: bridge.clientToolsName.value,
  clientToolsDescription: bridge.clientToolsDescription.value,
  workflowGuides: bridge.workflowGuides.value,
  referenceProviders: composerExtensions.referenceProviders.value,
  composerAddActions: composerExtensions.composerAddActions.value,
  markdownLinkHandler: bridge.handleMarkdownLink,
  systemPrompt: buildSystemPrompt(),
  openingStatement: $t('RuleEditor.agent.opening'),
  promptExamples: [$t('RuleEditor.agent.prompt.inspect'), $t('RuleEditor.agent.prompt.findNode'), $t('RuleEditor.agent.prompt.validate')],
  conversationTitle: $t('RuleEditor.agent.conversationTitle'),
  bubbleIcon: 'BranchesOutlined',
  bubbleIconBadge: 'ToolOutlined',
  bubbleTooltip: $t('RuleEditor.agent.bubbleTooltip'),
});

const refreshActiveAgentParameters = () => {
  if (aiStore.activeClientId !== RULE_EDITOR_CLIENT_ID || !aiStore.agentList.length) {
    return;
  }
  // 同一个规则编排助手可连续服务不同规则实例，切换规则时必须刷新 subject 与工具上下文。
  aiStore.parameters = {
    ...aiStore.parameters,
    ...buildAgentParameters(),
  };
};

const syncRuleEditorAgent = () => {
  if (!props.open || !ruleId.value || !bridge.ready.value) {
    return;
  }

  const parameters = buildAgentParameters();
  if (aiStore.activeClientId === RULE_EDITOR_CLIENT_ID && aiStore.agentList.length) {
    refreshActiveAgentParameters();
    return;
  }

  void aiStore.queryAgent(RULE_EDITOR_CLIENT_ID, parameters)
    .then(refreshActiveAgentParameters);
};

const handleClose = () => {
  emit('close');
};

const handleFrameLoaded = () => {
  frameLoaded.value = true;
  bridge.markFrameLoaded();
};

watch(
  () => [props.open, ruleId.value],
  async ([visible]) => {
    clearEditorActionDone();
    editorActioning.value = '';
    if (visible && ruleId.value) {
      frameLoaded.value = false;
      bridge.reset();
      await nextTick();
      return;
    }
    frameLoaded.value = false;
    bridge.disposeBridge();
    if (aiStore.activeClientId === RULE_EDITOR_CLIENT_ID) {
      aiStore.hideAiButton();
    }
  },
  { immediate: true },
);

watch(
  () => [bridge.ready.value, bridge.version.value, bridge.contextVersion.value, props.open, ruleId.value],
  () => {
    syncRuleEditorAgent();
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  bridge.disposeBridge();
  if (aiStore.activeClientId === RULE_EDITOR_CLIENT_ID) {
    aiStore.hideAiButton();
  }
});
</script>
<style src="./RuleEditorShell.less" scoped lang="less" />
