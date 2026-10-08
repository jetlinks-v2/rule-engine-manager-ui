import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import i18n from '@jetlinks-web-core/locales';
import {
  createAiClientToolFailureResult,
  createAiClientToolRuntime,
  type AiClientToolCall,
  type AiClientToolRuntime,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import { createRuleEditorProposalLinkHandler } from './proposalLinks';
import { createRuleEditorReferenceNodeBridge } from './referenceNodeBridge';
import {
  createEmptyRuleEditorToolRuntime,
  createRuleEditorToolUnavailableResult,
  RuleEditorBridgeUnavailableError,
  type RemoteRuleEditorToolDefinition,
  type RuleEditorToolExecutionContext,
  type RuleEditorToolUnavailableReason,
} from './toolRuntime';
import { createRuleEditorAgentProfile } from './ruleEditorAgentProfile';
import { resolveRuleEditorToolDisplayName } from './confirmOptions';
import {
  RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  RULE_EDITOR_RESOURCE_VERSION,
} from './toolRuntimeContracts';
import { useRuleEditorSharedAgentTools } from './useRuleEditorSharedAgentTools';
import {
  createRuleEditorTaskTargetStore,
  createRuleEditorCapabilityCatalogDigest,
  createRuleEditorBridgeRequestId,
  createRuleEditorContextDigest,
  normalizeRuleEditorCanvasRevision,
  requestRuleEditorLocalTargetConfirmation,
  resolveRuleEditorTaskTargetFromExecution,
  shouldAdvanceRuleEditorContextVersion,
} from './ruleEditorAgentContext';

const CHANNEL = 'jetlinks-rule-editor-agent';
const REQUEST_TIMEOUT = 60000;
const READY_TIMEOUT = 20000;
const HANDSHAKE_RETRY_INTERVAL = 1000;
const MAX_EXECUTION_RESPONSE_ID_LENGTH = 256;
const MAX_EXECUTION_LOGICAL_CALL_ID_LENGTH = 128;
const MAX_EXECUTION_USER_MESSAGE_LENGTH = 16 * 1024;
const TERMINAL_WRITE_BASELINE_TTL = 60_000;
const MAX_WRITE_BASELINES = 128;
type BridgeStatus = 'idle' | 'loading' | 'ready' | 'error';
interface RuleEditorAgentMessage {
  channel?: string;
  type?: string;
  requestId?: string;
  transportRequestId?: string;
  ruleId?: string;
  origin?: string;
  payload?: Record<string, any>;
}
interface PendingCall {
  timer: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  reportProgress?: AiClientToolCall['reportProgress'];
  targetWindow: WindowProxy;
  targetOrigin: string;
  signal?: AbortSignal;
  abortListener?: () => void;
}

interface WriteBaseline {
  revision?: number;
  expiresAt?: number;
  inFlight: boolean;
}

interface BridgeOptions { ruleId: Ref<string> }

const t = (key: string, args?: unknown[]) => i18n.global.t(key, args as any);

const createEmptyRuntime = () => createEmptyRuleEditorToolRuntime(t);

export const normalizeRuleEditorExecutionContext = (value?: RuleEditorToolExecutionContext) => {
  if (!value) return undefined;
  const responseId = typeof value.responseId === 'string'
    ? value.responseId.trim().slice(0, MAX_EXECUTION_RESPONSE_ID_LENGTH) || undefined
    : undefined;
  const userMessage = typeof value.userMessage === 'string'
    ? value.userMessage.trim().slice(0, MAX_EXECUTION_USER_MESSAGE_LENGTH) || undefined
    : undefined;
  const logicalToolCallId = typeof value.logicalToolCallId === 'string'
    ? value.logicalToolCallId.trim().slice(0, MAX_EXECUTION_LOGICAL_CALL_ID_LENGTH) || undefined
    : undefined;
  const phase = value.phase === 'prepare' || value.phase === 'execute' || value.phase === 'verify' || value.phase === 'cancel'
    ? value.phase
    : undefined;
  const turnSeq = Number.isSafeInteger(value.turnSeq) && Number(value.turnSeq) > 0
    ? value.turnSeq
    : undefined;
  const expectedRevision = normalizeRuleEditorCanvasRevision(value.expectedRevision);
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
        executionToolCallId: rawResolution.executionToolCallId?.trim().slice(0, 128),
        values: isRecord(rawResolution.values) ? rawResolution.values : undefined,
      }
    : undefined;
  const verifiedResolution = userInputResolution?.interactionId
    && userInputResolution.requirementFingerprint
    && userInputResolution.optionId
    && userInputResolution.toolCallId
    ? userInputResolution
    : undefined;
  return responseId || logicalToolCallId || phase || userMessage || turnSeq !== undefined || verifiedResolution || expectedRevision !== undefined
    ? {
        responseId, logicalToolCallId, turnSeq, userMessage, userInputResolution: verifiedResolution,
        ...(phase ? { phase } : {}),
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      }
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, any> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const useRuleEditorAgentBridge = (options: BridgeOptions) => {
  const iframeRef = ref<HTMLIFrameElement>();
  const status = ref<BridgeStatus>('idle');
  const context = ref<Record<string, any>>({});
  const remoteTools = ref<RemoteRuleEditorToolDefinition[]>([]);
  const remoteToolSourceRevision = ref('unversioned');
  const runtime = ref<AiClientToolRuntime>(createEmptyRuntime());
  const toolVersion = ref(0);
  const contextVersion = ref(0);
  const catalogVersion = ref(0);
  // Domain reads belong to the parent page, not to the iframe's transport readiness.
  const pageActive = ref(false);
  const lifecycleReason = ref<RuleEditorToolUnavailableReason>('not-initialized');
  const sharedTools = useRuleEditorSharedAgentTools(pageActive);
  const pendingCalls = new Map<string, PendingCall>();
  const writeBaselines = new Map<string, WriteBaseline>();
  let readyTimer: number | undefined;
  let handshakeTimer: number | undefined;
  let runtimeInitialized = false;
  let handshakeRejected = false;
  let unsubscribeRuntime: (() => void) | undefined;
  let lastContextDigest = '';
  let lastCatalogDigest = '';
  let pendingContextDigest: string | undefined;
  let pendingCatalogDigest: string | undefined;
  let flushDeferredContextChanges = () => undefined;
  let activeClientToolCalls = 0;
  const taskTargets = createRuleEditorTaskTargetStore();

  const activeFrameWindow = () => iframeRef.value?.contentWindow;
  const activeFrameOrigin = () => {
    try {
      const origin = iframeRef.value?.src ? new URL(iframeRef.value.src, window.location.href).origin : '';
      return origin && origin !== 'null' ? origin : '';
    } catch {
      return '';
    }
  };

  const bridgeDiagnostic = (reason = lifecycleReason.value) => ({
    transport: 'iframe' as const,
    reason,
    lifecycleReason: lifecycleReason.value,
    status: status.value,
    frameAvailable: Boolean(activeFrameWindow()),
    originAvailable: Boolean(activeFrameOrigin()),
  });

  const clearReadyTimer = () => {
    if (readyTimer !== undefined) {
      window.clearTimeout(readyTimer);
      readyTimer = undefined;
    }
  };

  const clearHandshakeTimer = () => {
    if (handshakeTimer !== undefined) {
      window.clearTimeout(handshakeTimer);
      handshakeTimer = undefined;
    }
  };

  const requestHandshake = () => {
    clearHandshakeTimer();
    if (status.value !== 'loading') return;
    const targetWindow = activeFrameWindow();
    const targetOrigin = activeFrameOrigin();
    if (targetWindow && targetOrigin) {
      try {
        targetWindow.postMessage({
          channel: CHANNEL,
          type: 'rule-editor-agent:handshake',
          ruleId: options.ruleId.value,
          origin: window.location.origin,
          payload: {
            resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
            contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
          },
        }, targetOrigin);
      } catch {
        // The frame can disappear between resolving contentWindow and posting during route/HMR teardown.
      }
    }
    if (status.value === 'loading') {
      handshakeTimer = window.setTimeout(requestHandshake, HANDSHAKE_RETRY_INTERVAL);
    }
  };

  const startReadyTimer = () => {
    clearReadyTimer();
    readyTimer = window.setTimeout(() => {
      if (status.value === 'loading') {
        clearHandshakeTimer();
        lifecycleReason.value = 'ready-timeout';
        status.value = 'error';
      }
    }, READY_TIMEOUT);
  };

  const markReady = () => {
    clearReadyTimer();
    clearHandshakeTimer();
    status.value = 'ready';
  };

  const rejectInvalidHandshake = () => {
    lifecycleReason.value = 'invalid-handshake';
    handshakeRejected = true;
    clearReadyTimer();
    clearHandshakeTimer();
    rejectPendingCalls('invalid-handshake');
    writeBaselines.clear();
    context.value = {};
    remoteTools.value = [];
    remoteToolSourceRevision.value = 'unversioned';
    lastContextDigest = '';
    lastCatalogDigest = '';
    pendingContextDigest = undefined;
    pendingCatalogDigest = undefined;
    replaceRuntime(createEmptyRuntime(), false);
    status.value = 'error';
    contextVersion.value += 1;
  };

  // Resource and contract versions describe provenance, not rolling-deployment compatibility.
  // The parent consumes only the stable payload shape and keeps source/origin/ruleId as security boundaries.
  const hasUsableHandshakePayload = (payload?: Record<string, any>) => (
    isRecord(payload)
    && (payload.context === undefined || isRecord(payload.context))
    && (payload.tools === undefined || Array.isArray(payload.tools))
  );

  const cleanupPendingCall = (requestId: string, pending: PendingCall) => {
    if (pendingCalls.get(requestId) === pending) {
      pendingCalls.delete(requestId);
    }
    window.clearTimeout(pending.timer);
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
    if (pendingCalls.size === 0) flushDeferredContextChanges();
  };

  const postBridgeCancellation = (requestId: string, pending: PendingCall) => {
    try {
      pending.targetWindow.postMessage({
        channel: CHANNEL,
        type: 'rule-editor-agent:cancel',
        requestId,
        transportRequestId: requestId,
        ruleId: options.ruleId.value,
        origin: window.location.origin,
        payload: { transportRequestId: requestId },
      }, pending.targetOrigin);
    } catch {
      // The request is already being rejected locally; cancellation is best-effort during frame teardown.
    }
  };

  const rejectPendingCalls = (reason: RuleEditorToolUnavailableReason) => {
    pendingCalls.forEach((pending, requestId) => {
      postBridgeCancellation(requestId, pending);
      cleanupPendingCall(requestId, pending);
      pending.reject(new RuleEditorBridgeUnavailableError(
        t('RuleEditor.bridge.error.notReady'), bridgeDiagnostic(reason), true,
      ));
    });
  };

  const cleanupWriteBaselines = () => {
    const now = Date.now();
    for (const [key, baseline] of writeBaselines) {
      if (!baseline.inFlight && baseline.expiresAt !== undefined && baseline.expiresAt <= now) {
        writeBaselines.delete(key);
      }
    }
  };

  const trimInactiveWriteBaselines = () => {
    cleanupWriteBaselines();
    while (writeBaselines.size >= MAX_WRITE_BASELINES) {
      const inactive = [...writeBaselines.entries()].find(([, baseline]) => !baseline.inFlight);
      if (!inactive) break;
      writeBaselines.delete(inactive[0]);
    }
  };

  const writeBaselineCapacityFailure = () => ({
    ...createAiClientToolFailureResult({
      code: 'rule_editor.write.capacity_exhausted',
      message: '规则编辑器正在处理过多未完成写入，请等待现有调用结束后再试。',
      failureDisposition: 'tool',
      recoveryAction: 'terminal',
      retryable: false,
    }),
    effectState: 'not-started' as const,
    externalExecutionStarted: false as const,
    receipt: {
      effect: 'not-applied' as const,
      completion: 'blocked' as const,
      effectState: 'not-started' as const,
      externalExecutionStarted: false as const,
    },
    resultStatus: 'blocked' as const,
  });

  const executeBridgeRequest = (
    type: string,
    payload: Record<string, any>,
    transportRequestId?: string,
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => new Promise((resolve, reject) => {
    if (!pageActive.value || !runtimeInitialized) {
      resolve(createRuleEditorToolUnavailableResult(t, bridgeDiagnostic()));
      return;
    }
    const targetWindow = activeFrameWindow();
    if (!targetWindow) {
      resolve(createRuleEditorToolUnavailableResult(t, bridgeDiagnostic('frame-missing')));
      return;
    }

    const requestId = transportRequestId || createRuleEditorBridgeRequestId();
    if (pendingCalls.has(requestId)) {
      reject(new Error('rule editor tool call is already pending'));
      return;
    }
    if (signal?.aborted) {
      const aborted = new Error('rule editor tool call was cancelled');
      aborted.name = 'AbortError';
      reject(aborted);
      return;
    }
    const targetOrigin = activeFrameOrigin();
    if (!targetOrigin) {
      resolve(createRuleEditorToolUnavailableResult(t, bridgeDiagnostic('origin-unavailable')));
      return;
    }
    let pending: PendingCall;
    const timer = window.setTimeout(() => {
      const current = pendingCalls.get(requestId);
      if (!current) return;
      postBridgeCancellation(requestId, current);
      cleanupPendingCall(requestId, current);
      const timeout = new Error(t('RuleEditor.bridge.error.timeout'));
      timeout.name = 'RuleEditorBridgeTimeout';
      current.reject(timeout);
    }, REQUEST_TIMEOUT);
    const abortListener = signal
      ? () => {
          const current = pendingCalls.get(requestId);
          if (!current) return;
          postBridgeCancellation(requestId, current);
          cleanupPendingCall(requestId, current);
          const aborted = new Error('rule editor tool call was cancelled');
          aborted.name = 'AbortError';
          current.reject(aborted);
        }
      : undefined;
    pending = { timer, resolve, reject, reportProgress, targetWindow, targetOrigin, signal, abortListener };
    pendingCalls.set(requestId, pending);
    signal?.addEventListener('abort', abortListener!, { once: true });
    if (signal?.aborted) {
      abortListener?.();
      return;
    }
    if (!pendingCalls.has(requestId)) return;
    try {
      targetWindow.postMessage({
        channel: CHANNEL,
        type,
        requestId,
        transportRequestId: requestId,
        ruleId: options.ruleId.value,
        origin: window.location.origin,
        payload: { ...payload, transportRequestId: requestId },
      }, targetOrigin);
    } catch {
      cleanupPendingCall(requestId, pending);
      resolve(createRuleEditorToolUnavailableResult(t, bridgeDiagnostic('post-message-failed')));
    }
  });

  const executeRemoteTool = async (
    toolId: string,
    args: Record<string, any>,
    executionContext?: RuleEditorToolExecutionContext,
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => {
    const normalizedContext = normalizeRuleEditorExecutionContext(executionContext);
    const responseId = normalizedContext?.responseId;
    const resolvedTarget = resolveRuleEditorTaskTargetFromExecution(taskTargets.get(responseId), args);
    taskTargets.set(responseId, resolvedTarget.taskTarget);
    const trustedContext = {
      ...(normalizedContext || {}),
      targetState: resolvedTarget.taskTarget,
    };
    const startedAt = Date.now();
    const tool = remoteTools.value.find(item => item.id === toolId);
    const label = resolveRuleEditorToolDisplayName(tool || { id: toolId });
    const report = (status: 'running' | 'completed' | 'failed') => reportProgress?.({
      version: 'client-tool-progress/v1',
      stepId: toolId,
      status,
      label,
      completed: status === 'running' ? 0 : 1,
      total: 1,
      elapsedMs: Date.now() - startedAt,
    });
    report('running');
    // Owner-reported multi-step progress takes precedence over the transport lifecycle.
    let ownerReportedProgress = false;
    try {
      const result = await executeBridgeRequest(
        'rule-editor-agent:execute-tool',
        {
          toolName: toolId,
          arguments: resolvedTarget.toolArguments,
          executionContext: trustedContext,
        },
        createRuleEditorBridgeRequestId(normalizedContext?.logicalToolCallId, normalizedContext?.phase),
        (progress) => {
          ownerReportedProgress = true;
          reportProgress?.(progress);
        },
        signal,
      );
      const failed = result !== null && typeof result === 'object'
        && (('ok' in result && result.ok === false) || ('success' in result && result.success === false));
      if (!ownerReportedProgress) report(failed ? 'failed' : 'completed');
      return result;
    } catch (error) {
      report('failed');
      if (error instanceof RuleEditorBridgeUnavailableError) {
        return createRuleEditorToolUnavailableResult(t, error.diagnostic, error.externalExecutionStarted);
      }
      throw error;
    }
  };

  const executeEditorAction = (action: 'deploy' | string, payload: Record<string, any> = {}) => executeBridgeRequest(
    'rule-editor-agent:execute-action',
    { ...payload, action },
  );

  const executeEditorUtilityAction = (action: 'import' | 'export') => executeBridgeRequest(
    'rule-editor-agent:execute-action',
    { action },
  );

  const executeProposalAction = (proposalId: string) => executeBridgeRequest(
    'rule-editor-agent:execute-proposal',
    { proposalId },
  );

  const { previewNode, listNodesForReference } = createRuleEditorReferenceNodeBridge({
    isReady: () => status.value === 'ready',
    executeRemoteTool,
  });

  const createRuntime = () => createAiClientToolRuntime(() => createRuleEditorAgentProfile({
      executeInternalTool: (toolId, args, executionContext, reportProgress, signal) => executeRemoteTool(
        toolId,
        args as Record<string, any>,
        executionContext,
        reportProgress,
        signal,
      ),
      inspectCanvas: false,
      capabilityCatalog: context.value.orchestrationCapabilities,
      remoteTools: remoteTools.value,
      remoteToolSourceRevision: remoteToolSourceRevision.value,
      getCanvasContext: () => context.value,
      getTaskTargetState: (executionContext) => taskTargets.get(executionContext?.responseId),
      locale: i18n.global.locale.value,
    }).tools, {
      toolsName: t('RuleEditor.agent.toolsName'),
      toolsDescription: t('RuleEditor.agent.toolsDescription'),
      getContext: () => context.value,
      includeHelpTool: false,
      resultGuard: {
        maxJsonLength: 48 * 1024,
        maxStringLength: 12000,
        maxArrayLength: 50,
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

  const refreshCatalogContract = (digest: string) => {
    lastCatalogDigest = digest;
    rebuildRuntime();
    catalogVersion.value += 1;
  };

  flushDeferredContextChanges = () => {
    if (pendingCalls.size > 0 || activeClientToolCalls > 0) return;
    if (pendingContextDigest !== undefined) {
      const currentDigest = createRuleEditorContextDigest(context.value);
      if (currentDigest !== lastContextDigest) {
        lastContextDigest = currentDigest;
        contextVersion.value += 1;
      }
      pendingContextDigest = undefined;
    }
    if (pendingCatalogDigest !== undefined) {
      const currentDigest = createRuleEditorCapabilityCatalogDigest(context.value);
      if (currentDigest !== lastCatalogDigest) refreshCatalogContract(currentDigest);
      pendingCatalogDigest = undefined;
    }
  };

  const handleRequestResult = (message: RuleEditorAgentMessage) => {
    const transportRequestId = message.transportRequestId || message.requestId;
    const pending = transportRequestId ? pendingCalls.get(transportRequestId) : undefined;
    if (!pending) {
      return;
    }

    cleanupPendingCall(transportRequestId!, pending);
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
    if (!data || data.channel !== CHANNEL || !pageActive.value) {
      return;
    }
    // 只接受当前 iframe 与预期来源发出的消息，避免同页其它窗口伪造工具注册或工具结果。
    const expectedOrigin = activeFrameOrigin();
    if (!expectedOrigin || event.source !== activeFrameWindow() || event.origin !== expectedOrigin) {
      return;
    }
    if (data.origin && data.origin !== event.origin) {
      return;
    }
    if (data.ruleId && data.ruleId !== options.ruleId.value) {
      return;
    }

    if (data.type === 'rule-editor-agent:ready') {
      if (handshakeRejected || !hasUsableHandshakePayload(data.payload)) {
        rejectInvalidHandshake();
        return;
      }
      context.value = data.payload?.context || context.value;
      lastContextDigest = createRuleEditorContextDigest(context.value);
      lastCatalogDigest = createRuleEditorCapabilityCatalogDigest(context.value);
      pendingContextDigest = undefined;
      pendingCatalogDigest = undefined;
      contextVersion.value += 1;
      return;
    }
    if (data.type === 'rule-editor-agent:register-tools') {
      if (handshakeRejected || !hasUsableHandshakePayload(data.payload)) {
        rejectInvalidHandshake();
        return;
      }
      markReady();
      context.value = data.payload?.context || context.value;
      remoteTools.value = (data.payload?.tools || []).filter((tool: unknown): tool is RemoteRuleEditorToolDefinition => (
        isRecord(tool) && typeof tool.id === 'string' && Boolean(tool.id.trim())
      ));
      remoteToolSourceRevision.value = typeof data.payload?.resourceVersion === 'string'
        ? data.payload.resourceVersion
        : 'unversioned';
      lastContextDigest = createRuleEditorContextDigest(context.value);
      lastCatalogDigest = createRuleEditorCapabilityCatalogDigest(context.value);
      pendingContextDigest = undefined;
      pendingCatalogDigest = undefined;
      contextVersion.value += 1;
      rebuildRuntime();
      catalogVersion.value += 1;
      return;
    }
    if (data.type === 'rule-editor-agent:context-change') {
      const nextContext = data.payload?.context || {};
      const decision = shouldAdvanceRuleEditorContextVersion({
        previousDigest: lastContextDigest,
        nextContext,
        inFlightClientToolCall: pendingCalls.size > 0 || activeClientToolCalls > 0,
      });
      context.value = nextContext;
      if (decision.advance) {
        lastContextDigest = decision.digest;
        contextVersion.value += 1;
        pendingContextDigest = undefined;
      } else if (decision.pendingDigest !== undefined) {
        pendingContextDigest = decision.pendingDigest;
      } else {
        pendingContextDigest = undefined;
      }
      const catalogDigest = createRuleEditorCapabilityCatalogDigest(nextContext);
      if (catalogDigest === lastCatalogDigest) {
        pendingCatalogDigest = undefined;
      } else if (pendingCalls.size > 0 || activeClientToolCalls > 0) {
        pendingCatalogDigest = catalogDigest;
      } else {
        refreshCatalogContract(catalogDigest);
      }
      return;
    }
    if (data.type === 'rule-editor-agent:tool-progress') {
      const transportRequestId = data.transportRequestId || data.requestId;
      const pending = transportRequestId ? pendingCalls.get(transportRequestId) : undefined;
      const progress = data.payload?.progress;
      if (pending?.reportProgress && progress && typeof progress === 'object') {
        pending.reportProgress(progress);
      }
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
      // A frame unload cannot close its parent's independent domain-tool owner.
      clearBridgeTransport('iframe-disposed');
      status.value = 'error';
    }
  };

  const reset = () => {
    pageActive.value = true;
    lifecycleReason.value = 'reset';
    handshakeRejected = false;
    clearHandshakeTimer();
    rejectPendingCalls('reset');
    writeBaselines.clear();
    context.value = {};
    remoteTools.value = [];
    remoteToolSourceRevision.value = 'unversioned';
    lastContextDigest = '';
    lastCatalogDigest = '';
    pendingContextDigest = undefined;
    pendingCatalogDigest = undefined;
    taskTargets.clear();
    replaceRuntime(createEmptyRuntime(), false);
    status.value = 'loading';
    startReadyTimer();
    contextVersion.value += 1;
  };

  const markFrameLoaded = () => {
    lifecycleReason.value = 'frame-loaded';
    handshakeRejected = false;
    status.value = 'loading';
    startReadyTimer();
    requestHandshake();
  };

  const clearBridgeTransport = (reason: RuleEditorToolUnavailableReason) => {
    lifecycleReason.value = reason;
    handshakeRejected = false;
    clearReadyTimer();
    clearHandshakeTimer();
    rejectPendingCalls(reason);
    writeBaselines.clear();
    context.value = {};
    remoteTools.value = [];
    remoteToolSourceRevision.value = 'unversioned';
    lastContextDigest = '';
    lastCatalogDigest = '';
    pendingContextDigest = undefined;
    pendingCatalogDigest = undefined;
    taskTargets.clear();
    replaceRuntime(createEmptyRuntime(), false);
    contextVersion.value += 1;
  };

  const disposeBridge = () => {
    pageActive.value = false;
    clearBridgeTransport('page-disposed');
    status.value = 'idle';
  };

  const clientTools = computed(() => {
    void toolVersion.value;
    return [
      ...runtime.value.clientTools,
      ...sharedTools.clientTools.value,
    ];
  });
  const workflowGuides = computed(() => sharedTools.workflowGuides.value);
  const systemPrompt = computed(() => createRuleEditorAgentProfile({
    executeInternalTool: executeRemoteTool,
    inspectCanvas: false,
    capabilityCatalog: context.value.orchestrationCapabilities,
    remoteTools: remoteTools.value,
    remoteToolSourceRevision: remoteToolSourceRevision.value,
    getCanvasContext: () => context.value,
    getTaskTargetState: (executionContext) => taskTargets.get(executionContext?.responseId),
    locale: i18n.global.locale.value,
  }).prompt);
  const combinedVersion = computed(() => toolVersion.value + catalogVersion.value + sharedTools.version.value);

  const handleClientToolCall = (call: AiClientToolCall) => {
    if (sharedTools.ownsTool(call.toolName)) {
      return sharedTools.handleClientToolCall(call);
    }
    if (!runtimeInitialized) {
      return Promise.resolve(createRuleEditorToolUnavailableResult(t, bridgeDiagnostic()));
    }
    const executionContext = normalizeRuleEditorExecutionContext(call.executionContext);
    const tool = runtime.value.clientTools.find((candidate) => candidate.id === call.toolName || candidate.name === call.toolName);
    let expectedRevision: number | undefined;
    let writeBaselineKey: string | undefined;
    if (tool?.expands?.effect === 'WRITE') {
      trimInactiveWriteBaselines();
      writeBaselineKey = JSON.stringify([
        options.ruleId.value,
        executionContext?.logicalToolCallId ? 'logical' : 'rpc',
        executionContext?.logicalToolCallId || call.id,
      ]);
      let baseline = writeBaselines.get(writeBaselineKey);
      if (!baseline) {
        const inFlightCount = [...writeBaselines.values()].filter(item => item.inFlight).length;
        if (inFlightCount >= MAX_WRITE_BASELINES) {
          return Promise.resolve(writeBaselineCapacityFailure());
        }
        baseline = { revision: normalizeRuleEditorCanvasRevision(context.value.canvasRevision), inFlight: true };
        writeBaselines.set(writeBaselineKey, baseline);
      } else {
        baseline.inFlight = true;
        baseline.expiresAt = undefined;
      }
      expectedRevision = baseline.revision;
    }
    const capturedExecutionContext: RuleEditorToolExecutionContext = { ...executionContext, expectedRevision };
    activeClientToolCalls += 1;
    return Promise.resolve(runtime.value.handleClientToolCall({
      ...call,
      executionContext: capturedExecutionContext,
      requestConfirmation: call.requestConfirmation
        ? async (request) => {
            const settled = await requestRuleEditorLocalTargetConfirmation(
              taskTargets.get(executionContext?.responseId),
              call,
              request,
              call.requestConfirmation!,
            );
            taskTargets.set(executionContext?.responseId, settled.taskTarget);
            return settled.response;
          }
        : undefined,
    })).finally(() => {
      if (writeBaselineKey) {
        const baseline = writeBaselines.get(writeBaselineKey);
        if (baseline) {
          baseline.inFlight = false;
          baseline.expiresAt = Date.now() + TERMINAL_WRITE_BASELINE_TTL;
        }
      }
      cleanupWriteBaselines();
      activeClientToolCalls = Math.max(0, activeClientToolCalls - 1);
      flushDeferredContextChanges();
    });
  };

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
    pageActive.value = false;
    clearBridgeTransport('component-unmounted');
    status.value = 'idle';
  });

  return {
    iframeRef,
    status,
    diagnostic: computed(() => bridgeDiagnostic()),
    context,
    contextVersion,
    version: combinedVersion,
    clientTools,
    clientToolsName: computed(() => runtime.value.clientToolsName),
    clientToolsDescription: computed(() => runtime.value.clientToolsDescription),
    workflowGuides,
    systemPrompt,
    ready: computed(() => {
      void toolVersion.value;
      return status.value === 'ready' && runtime.value.clientTools.length > 0;
    }),
    reset,
    markFrameLoaded,
    disposeBridge,
    executeEditorAction,
    executeEditorUtilityAction,
    executeProposalAction,
    previewNode,
    listNodesForReference,
    handleClientToolCall,
    handleMarkdownLink,
  };
};
