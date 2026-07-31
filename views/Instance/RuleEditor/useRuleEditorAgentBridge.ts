import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import i18n from '@jetlinks-web-core/locales';
import { createAiClientToolRuntime, type AiClientToolCall, type AiClientToolRuntime } from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import { createRuleEditorProposalLinkHandler } from './proposalLinks';
import { createRuleEditorReferenceNodeBridge } from './referenceNodeBridge';
import {
  createEmptyRuleEditorToolRuntime,
  toRuleEditorClientToolDefinition,
  type RemoteRuleEditorToolDefinition,
  type RuleEditorToolExecutionContext,
} from './toolRuntime';
import { useRuleEditorSharedAgentTools } from './useRuleEditorSharedAgentTools';

const CHANNEL = 'jetlinks-rule-editor-agent';
const REQUEST_TIMEOUT = 60000;
const READY_TIMEOUT = 20000;
const MAX_EXECUTION_RESPONSE_ID_LENGTH = 256;
const MAX_EXECUTION_USER_MESSAGE_LENGTH = 16 * 1024;
type BridgeStatus = 'idle' | 'loading' | 'ready' | 'error';
interface RuleEditorAgentMessage {
  channel?: string;
  type?: string;
  requestId?: string;
  ruleId?: string;
  origin?: string;
  payload?: Record<string, any>;
}
interface PendingCall { timer: number; resolve: (value: any) => void; reject: (error: Error) => void }

interface BridgeOptions { ruleId: Ref<string> }

const t = (key: string, args?: unknown[]) => i18n.global.t(key, args as any);

const createEmptyRuntime = () => createEmptyRuleEditorToolRuntime(t);

const normalizeExecutionContext = (value?: RuleEditorToolExecutionContext) => {
  if (!value) return undefined;
  const responseId = typeof value.responseId === 'string'
    ? value.responseId.trim().slice(0, MAX_EXECUTION_RESPONSE_ID_LENGTH) || undefined
    : undefined;
  const userMessage = typeof value.userMessage === 'string'
    ? value.userMessage.trim().slice(0, MAX_EXECUTION_USER_MESSAGE_LENGTH) || undefined
    : undefined;
  const turnSeq = Number.isSafeInteger(value.turnSeq) && Number(value.turnSeq) > 0
    ? value.turnSeq
    : undefined;
  const rawResolution = value.userInputResolution;
  const userInputResolution = rawResolution?.version === 'user-input-resolution/v1'
    && typeof rawResolution.interactionId === 'string'
    && typeof rawResolution.requirementFingerprint === 'string'
    && typeof rawResolution.optionId === 'string'
    && typeof rawResolution.toolCallId === 'string'
    ? {
        version: 'user-input-resolution/v1' as const,
        interactionId: rawResolution.interactionId.trim().slice(0, 128),
        requirementFingerprint: rawResolution.requirementFingerprint.trim().slice(0, 256),
        optionId: rawResolution.optionId.trim().slice(0, 128),
        optionTitle: rawResolution.optionTitle?.trim().slice(0, 256),
        toolCallId: rawResolution.toolCallId.trim().slice(0, 128),
      }
    : undefined;
  const verifiedResolution = userInputResolution?.interactionId
    && userInputResolution.requirementFingerprint
    && userInputResolution.optionId
    && userInputResolution.toolCallId
    ? userInputResolution
    : undefined;
  return responseId || userMessage || turnSeq !== undefined || verifiedResolution
    ? { responseId, turnSeq, userMessage, userInputResolution: verifiedResolution }
    : undefined;
};

export const useRuleEditorAgentBridge = (options: BridgeOptions) => {
  const iframeRef = ref<HTMLIFrameElement>();
  const status = ref<BridgeStatus>('idle');
  const context = ref<Record<string, any>>({});
  const remoteTools = ref<RemoteRuleEditorToolDefinition[]>([]);
  const runtime = ref<AiClientToolRuntime>(createEmptyRuntime());
  const toolVersion = ref(0);
  const contextVersion = ref(0);
  const sharedTools = useRuleEditorSharedAgentTools(computed(() => status.value !== 'idle'));
  const pendingCalls = new Map<string, PendingCall>();
  let readyTimer: number | undefined;
  let runtimeInitialized = false;
  let remoteSourceRevision = 'rule-editor:empty';
  let unsubscribeRuntime: (() => void) | undefined;

  const activeFrameWindow = () => iframeRef.value?.contentWindow;
  const activeFrameOrigin = () => {
    try {
      return iframeRef.value?.src ? new URL(iframeRef.value.src, window.location.href).origin : '';
    } catch {
      return '';
    }
  };

  const clearReadyTimer = () => {
    if (readyTimer !== undefined) {
      window.clearTimeout(readyTimer);
      readyTimer = undefined;
    }
  };

  const startReadyTimer = () => {
    clearReadyTimer();
    readyTimer = window.setTimeout(() => {
      if (status.value === 'loading') {
        status.value = 'error';
      }
    }, READY_TIMEOUT);
  };

  const markReady = () => {
    clearReadyTimer();
    status.value = 'ready';
  };

  const rejectPendingCalls = (message: string) => {
    pendingCalls.forEach((pending) => {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(message));
    });
    pendingCalls.clear();
  };

  const executeBridgeRequest = (type: string, payload: Record<string, any>) => new Promise((resolve, reject) => {
    const targetWindow = activeFrameWindow();
    if (!targetWindow) {
      reject(new Error(t('RuleEditor.bridge.error.notReady')));
      return;
    }

    const requestId = `rule-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => {
      pendingCalls.delete(requestId);
      reject(new Error(t('RuleEditor.bridge.error.timeout')));
    }, REQUEST_TIMEOUT);

    pendingCalls.set(requestId, { timer, resolve, reject });
    targetWindow.postMessage({
      channel: CHANNEL,
      type,
      requestId,
      ruleId: options.ruleId.value,
      origin: window.location.origin,
      payload,
    }, activeFrameOrigin() || '*');
  });

  const executeRemoteTool = (
    toolId: string,
    args: Record<string, any>,
    executionContext?: RuleEditorToolExecutionContext,
  ) => {
    const normalizedContext = normalizeExecutionContext(executionContext);
    return executeBridgeRequest(
      'rule-editor-agent:execute-tool',
      {
        toolName: toolId,
        arguments: args,
        ...(normalizedContext ? { executionContext: normalizedContext } : {}),
      },
    );
  };

  const executeEditorAction = (action: 'deploy' | string, payload: Record<string, any> = {}) => executeBridgeRequest(
    'rule-editor-agent:execute-action',
    { ...payload, action },
  );

  const executeProposalAction = (proposalId: string) => executeBridgeRequest(
    'rule-editor-agent:execute-proposal',
    { proposalId },
  );

  const { previewNode, listNodesForReference } = createRuleEditorReferenceNodeBridge({
    isReady: () => status.value === 'ready',
    executeRemoteTool,
  });

  const createRemoteSourceRevision = (tools: RemoteRuleEditorToolDefinition[]) => {
    const source = JSON.stringify(tools);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `rule-editor:${(hash >>> 0).toString(36)}`;
  };

  const createRuntime = () => createAiClientToolRuntime(() => remoteTools.value
      .filter((tool) => tool?.id)
      .map((tool) => toRuleEditorClientToolDefinition(tool, executeRemoteTool, remoteSourceRevision)), {
      toolsName: t('RuleEditor.agent.toolsName'),
      toolsDescription: t('RuleEditor.agent.toolsDescription'),
      getContext: () => context.value,
      resultGuard: {
        maxJsonLength: 48 * 1024,
        maxStringLength: 1600,
        maxArrayLength: 30,
        maxObjectKeys: 50,
        maxDepth: 7,
      },
    });

  const replaceRuntime = (nextRuntime: AiClientToolRuntime, initialized: boolean) => {
    unsubscribeRuntime?.();
    runtime.value.dispose();
    runtime.value = nextRuntime;
    runtimeInitialized = initialized;
    unsubscribeRuntime = initialized
      ? nextRuntime.subscribeClientTools(() => {
          toolVersion.value += 1;
        })
      : undefined;
    toolVersion.value += 1;
  };

  const rebuildRuntime = () => {
    if (!runtimeInitialized) {
      replaceRuntime(createRuntime(), true);
      return;
    }
    // Runtime owns active-execution deferral, so a late iframe revision cannot detach the current turn.
    runtime.value.refreshClientTools();
  };

  const handleRequestResult = (message: RuleEditorAgentMessage) => {
    const pending = message.requestId ? pendingCalls.get(message.requestId) : undefined;
    if (!pending) {
      return;
    }

    pendingCalls.delete(message.requestId!);
    window.clearTimeout(pending.timer);
    const payload = message.payload || {};
    if (payload.ok === false) {
      const remoteError = payload.error;
      const error = typeof remoteError === 'string' ? remoteError : remoteError?.message || t('RuleEditor.bridge.error.unsupportedTool');
      pending.resolve({
        ok: false,
        error,
      });
      return;
    }
    pending.resolve(payload.result);
  };

  const handleMessage = (event: MessageEvent) => {
    const data = event.data as RuleEditorAgentMessage;
    if (!data || data.channel !== CHANNEL) {
      return;
    }
    // 只接受当前 iframe 与预期来源发出的消息，避免同页其它窗口伪造工具注册或工具结果。
    const expectedOrigin = activeFrameOrigin();
    if (event.source !== activeFrameWindow() || (expectedOrigin && event.origin !== expectedOrigin)) {
      return;
    }
    if (data.origin && data.origin !== event.origin) {
      return;
    }
    if (data.ruleId && data.ruleId !== options.ruleId.value) {
      return;
    }

    if (data.type === 'rule-editor-agent:ready') {
      context.value = data.payload?.context || context.value;
      contextVersion.value += 1;
      return;
    }
    if (data.type === 'rule-editor-agent:register-tools') {
      markReady();
      remoteTools.value = Array.isArray(data.payload?.tools)
        ? data.payload!.tools as RemoteRuleEditorToolDefinition[]
        : [];
      remoteSourceRevision = String(
        data.payload?.sourceRevision
        || data.payload?.toolsRevision
        || createRemoteSourceRevision(remoteTools.value),
      );
      context.value = data.payload?.context || context.value;
      contextVersion.value += 1;
      rebuildRuntime();
      return;
    }
    if (data.type === 'rule-editor-agent:context-change') {
      context.value = data.payload?.context || {};
      contextVersion.value += 1;
      return;
    }
    if (
      data.type === 'rule-editor-agent:tool-result'
      || data.type === 'rule-editor-agent:action-result'
      || data.type === 'rule-editor-agent:proposal-result'
    ) {
      handleRequestResult(data);
      return;
    }
    if (data.type === 'rule-editor-agent:dispose') {
      disposeBridge();
    }
  };

  const reset = () => {
    rejectPendingCalls(t('RuleEditor.bridge.error.notReady'));
    remoteTools.value = [];
    context.value = {};
    replaceRuntime(createEmptyRuntime(), false);
    status.value = 'loading';
    startReadyTimer();
    contextVersion.value += 1;
  };

  const markFrameLoaded = () => {
    if (status.value === 'idle' || status.value === 'error') {
      status.value = 'loading';
      startReadyTimer();
    }
  };

  const disposeBridge = () => {
    clearReadyTimer();
    rejectPendingCalls(t('RuleEditor.bridge.error.notReady'));
    remoteTools.value = [];
    context.value = {};
    replaceRuntime(createEmptyRuntime(), false);
    status.value = 'idle';
    contextVersion.value += 1;
  };

  const clientTools = computed(() => {
    void toolVersion.value;
    return [
      ...runtime.value.clientTools,
      ...sharedTools.clientTools.value,
    ];
  });
  const workflowGuides = computed(() => sharedTools.workflowGuides.value);
  const combinedVersion = computed(() => toolVersion.value + sharedTools.version.value);

  const handleClientToolCall = (call: AiClientToolCall) => (
    sharedTools.hasTool(call.toolName)
      ? sharedTools.handleClientToolCall(call)
      : runtime.value.handleClientToolCall(call)
  );

  const handleMarkdownLink = createRuleEditorProposalLinkHandler({
    execute: (proposalId) => executeProposalAction(proposalId),
    registerActions: (payload) => executeRemoteTool('rule_editor_propose_canvas_actions', payload),
    t,
  });

  onMounted(() => {
    window.addEventListener('message', handleMessage);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('message', handleMessage);
    disposeBridge();
  });

  return {
    iframeRef,
    status,
    context,
    contextVersion,
    version: combinedVersion,
    clientTools,
    clientToolsName: computed(() => runtime.value.clientToolsName),
    clientToolsDescription: computed(() => runtime.value.clientToolsDescription),
    workflowGuides,
    ready: computed(() => {
      void toolVersion.value;
      return status.value === 'ready' && runtime.value.clientTools.length > 0;
    }),
    reset,
    markFrameLoaded,
    disposeBridge,
    executeEditorAction,
    executeProposalAction,
    previewNode,
    listNodesForReference,
    handleClientToolCall,
    handleMarkdownLink,
  };
};
