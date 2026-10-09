import {
  createAiClientToolFailureResult,
  type AiClientToolCall,
  type AiClientToolPreparedCall,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
  parseRuleGoal,
  projectCanvasApplyReceipt,
  type CanvasApplyReceipt,
  type RuleEditorCapabilityCatalogItem,
  type RuleEditorOrchestrationProgress,
  type RuleEditorOrchestrationState,
  type RuleGoal,
} from './ruleEditorOrchestrationContracts';

interface PreparedHandle {
  preparedPlanId: string;
  planDigest: string;
  editorSessionId?: string;
  baseRevision?: number;
  requestId?: string;
  previewSummary?: {
    nodeCount?: number;
    linkCount?: number;
    stepCount?: number;
  };
  goal: RuleGoal;
}

interface OrchestrationEntry {
  state: RuleEditorOrchestrationState;
  startedAt: number;
  goalDigest: string;
  handle?: PreparedHandle;
  receipt?: CanvasApplyReceipt;
  terminalAt?: number;
  replayResult?: Record<string, unknown>;
}

export interface RuleEditorOrchestratorOptions {
  executeInternalTool: (
    toolId: string,
    args: Record<string, unknown>,
    executionContext?: AiClientToolCall['executionContext'],
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => Promise<unknown>;
  capabilityCatalog?: readonly RuleEditorCapabilityCatalogItem[];
  locale?: string;
}

const transitions: Record<RuleEditorOrchestrationState, readonly RuleEditorOrchestrationState[]> = {
  // Resolver/compiler/preview are reported by the iframe. Parent transitions only after
  // a real remote result establishes a local lifecycle boundary.
  idle: ['awaiting_confirmation', 'awaiting_input', 'completed', 'partial', 'blocked', 'failed', 'unknown', 'rolled_back', 'not_applied'],
  resolving: ['compiling', 'awaiting_input', 'blocked', 'failed'],
  compiling: ['previewing', 'awaiting_input', 'blocked', 'failed'],
  previewing: ['awaiting_confirmation', 'completed', 'partial', 'blocked', 'failed', 'unknown', 'rolled_back', 'not_applied'],
  awaiting_confirmation: ['applying', 'blocked', 'not_applied'],
  awaiting_input: ['blocked', 'not_applied'],
  applying: ['verifying'],
  verifying: ['completed', 'partial', 'blocked', 'failed', 'unknown', 'rolled_back', 'not_applied'],
  completed: [],
  partial: [],
  blocked: [],
  failed: [],
  unknown: [],
  rolled_back: [],
  not_applied: [],
};

const labels: Record<RuleEditorOrchestrationState, string> = {
  idle: '等待编排',
  resolving: '正在理解目标并读取画布',
  compiling: '正在匹配可用能力并编译计划',
  previewing: '正在预览变更',
  awaiting_confirmation: '等待确认画布变更',
  awaiting_input: '等待补充业务信息',
  applying: '正在提交画布',
  verifying: '正在复验结果',
  completed: '已完成画布编排',
  partial: '画布仅部分完成',
  blocked: '编排被阻止',
  failed: '编排未完成',
  unknown: '画布效果待核验',
  rolled_back: '画布修改已回滚',
  not_applied: '未提交画布修改',
};

const totals: Record<RuleEditorOrchestrationState, number> = {
  idle: 0,
  resolving: 1,
  compiling: 2,
  previewing: 4,
  awaiting_confirmation: 5,
  awaiting_input: 4,
  applying: 6,
  verifying: 7,
  completed: 8,
  partial: 8,
  blocked: 8,
  failed: 8,
  unknown: 7,
  rolled_back: 8,
  not_applied: 8,
};

const MAX_ORCHESTRATION_ENTRIES = 128;

const record = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const text = (value: unknown, max = 128): string | undefined => (
  typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined
);

const safeRevision = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
);

const localizedText = (value: RuleEditorCapabilityCatalogItem['localizedName'], locale?: string): string => {
  if (typeof value === 'string') return value;
  const normalizedLocale = text(locale, 32)?.replace('_', '-').toLowerCase();
  const language = normalizedLocale?.split('-')[0];
  const entries = Object.entries(value);
  return (normalizedLocale
    ? entries.find(([key]) => key.replace('_', '-').toLowerCase() === normalizedLocale)?.[1]
    : undefined)
    || (language
      ? entries.find(([key]) => key.replace('_', '-').toLowerCase().split('-')[0] === language)?.[1]
      : undefined)
    || entries[0]?.[1]
    || '';
};

const toPreviewSummary = (value: unknown): PreparedHandle['previewSummary'] => {
  if (!record(value)) return undefined;
  const nodeCount = safeRevision(value.nodeCount);
  const linkCount = safeRevision(value.linkCount);
  const stepCount = safeRevision(value.stepCount);
  return nodeCount !== undefined || linkCount !== undefined || stepCount !== undefined
    ? {
      ...(nodeCount !== undefined ? { nodeCount } : {}),
      ...(linkCount !== undefined ? { linkCount } : {}),
      ...(stepCount !== undefined ? { stepCount } : {}),
    }
    : undefined;
};

const logicalKey = (call: AiClientToolCall) => (
  call.executionContext?.logicalToolCallId || call.id
);

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableJsonValue(value[key])]),
  );
};

const createGoalDigest = (goal: RuleGoal) => JSON.stringify(stableJsonValue(goal));

const preparationFailure = (code: string, message: string, recoveryAction: 'clarify' | 'terminal' = 'terminal') => ({
  ...createAiClientToolFailureResult({
    code,
    message,
    failureDisposition: recoveryAction === 'clarify' ? 'request' : 'tool',
    recoveryAction,
    retryable: false,
  }),
  effectState: 'not-started' as const,
  externalExecutionStarted: false as const,
  receipt: {
    effect: 'not-applied' as const,
    completion: recoveryAction === 'clarify' ? 'awaiting-input' as const : 'blocked' as const,
    effectState: 'not-started' as const,
    externalExecutionStarted: false as const,
  },
});

const toPreparedHandle = (result: unknown, goal: RuleGoal): PreparedHandle | undefined => {
  if (!record(result)) return undefined;
  const preparedPlanId = text(result.preparedPlanId);
  const planDigest = text(result.planDigest);
  if (!preparedPlanId || !planDigest) return undefined;
  const previewSummary = toPreviewSummary(result.previewSummary);
  return {
    preparedPlanId,
    planDigest,
    ...(text(result.editorSessionId) ? { editorSessionId: text(result.editorSessionId) } : {}),
    ...(safeRevision(result.baseRevision) !== undefined ? { baseRevision: safeRevision(result.baseRevision) } : {}),
    ...(text(result.requestId) ? { requestId: text(result.requestId) } : {}),
    ...(previewSummary ? { previewSummary } : {}),
    goal,
  };
};

const toPreparedArguments = (handle: PreparedHandle): Record<string, unknown> => ({
  preparedPlanId: handle.preparedPlanId,
  planDigest: handle.planDigest,
  ...(handle.editorSessionId ? { editorSessionId: handle.editorSessionId } : {}),
  ...(handle.baseRevision !== undefined ? { baseRevision: handle.baseRevision } : {}),
  ...(handle.requestId ? { requestId: handle.requestId } : {}),
});

const withOrchestrationPhase = (
  call: AiClientToolCall,
  requestId: string,
  phase: 'prepare' | 'execute' | 'verify' | 'cancel',
) => ({
  ...(call.executionContext || {}),
  logicalToolCallId: requestId,
  phase,
});

export const createRuleEditorOrchestrator = (options: RuleEditorOrchestratorOptions) => {
  const entries = new Map<string, OrchestrationEntry>();
  const capabilityIds = new Set((options.capabilityCatalog || []).map(item => item.capabilityId));
  const capabilitySummaries = new Map((options.capabilityCatalog || []).map(item => [
    item.capabilityId,
    `${localizedText(item.localizedName, options.locale)}（${item.effect === 'WRITE' ? '写入' : '读取'}）`,
  ]));

  // The confirmation uses only bounded business facts already frozen by prepare.
  const confirmationContent = (handle: PreparedHandle) => {
    const operations = handle.goal.goal.operations;
    const intents = operations.slice(0, 3).map(operation => operation.intent);
    const intentSummary = `${intents.join('、')}${operations.length > intents.length ? `等 ${operations.length} 项` : ''}`;
    const capabilities = [...new Set(operations.map(operation => capabilitySummaries.get(operation.capabilityRef)).filter(Boolean))];
    const parts = [`将执行 ${operations.length} 项业务操作：${intentSummary}`];
    if (capabilities.length) parts.push(`使用能力：${capabilities.join('、')}`);
    if (handle.previewSummary?.nodeCount !== undefined || handle.previewSummary?.linkCount !== undefined) {
      parts.push(`预计画布包含 ${handle.previewSummary.nodeCount ?? 0} 个变更节点、${handle.previewSummary.linkCount ?? 0} 条连线`);
    }
    if (handle.baseRevision !== undefined) parts.push(`基于画布修订 ${handle.baseRevision}`);
    parts.push('仅提交为未保存草稿，不会保存、发布或执行规则');
    return `${parts.join('；')}。`;
  };

  const cleanupEntries = () => {
    const terminalEntries = [...entries.entries()]
      .filter(([, entry]) => entry.terminalAt !== undefined)
      .sort((left, right) => Number(left[1].terminalAt) - Number(right[1].terminalAt));
    while (terminalEntries.length > MAX_ORCHESTRATION_ENTRIES) {
      const oldest = terminalEntries.shift();
      if (oldest) entries.delete(oldest[0]);
    }
  };

  const liveEntryCount = () => [...entries.values()].filter(entry => entry.terminalAt === undefined).length;

  const report = (call: AiClientToolCall, entry: OrchestrationEntry, state: RuleEditorOrchestrationState) => {
    if (entry.state !== state && !transitions[entry.state].includes(state)) {
      throw new Error(`rule editor orchestration illegal transition: ${entry.state} -> ${state}`);
    }
    entry.state = state;
    const progress: RuleEditorOrchestrationProgress = {
      version: 'client-tool-progress/v1',
      stepId: state,
      status: ['blocked', 'failed', 'partial', 'unknown', 'rolled_back', 'not_applied'].includes(state)
        ? 'failed'
        : state === 'awaiting_input'
          ? 'blocked'
          : state === 'idle'
            ? 'pending'
            : state === 'completed'
              ? 'completed'
              : 'running',
      label: labels[state],
      completed: totals[state],
      total: 8,
      ...(state === 'previewing' ? { targets: ['preview:canvas-plan'] } : {}),
      elapsedMs: Math.max(0, Date.now() - entry.startedAt),
    };
    call.reportProgress?.(progress);
  };

  const cancelPrepared = async (
    call: AiClientToolCall,
    key: string,
    preparedArguments: Record<string, unknown>,
  ) => {
    try {
      await options.executeInternalTool(
        RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
        preparedArguments,
        withOrchestrationPhase(call, key, 'cancel'),
        call.reportProgress,
      );
    } catch {
      // Cleanup is best-effort and must never turn into an apply retry.
    }
  };

  const hasConfirmedEffect = (value: unknown) => {
    if (!record(value)) return false;
    if (value.effect === 'applied' || value.effect === 'rolled-back' || value.effect === 'not-applied') {
      return true;
    }
    const mutation = record(value.mutation) ? value.mutation : undefined;
    return mutation?.status === 'applied' || mutation?.status === 'rolled-back' || mutation?.status === 'not-applied';
  };

  const isRevisionConflict = (value: unknown) => {
    if (!record(value)) return false;
    const code = text(value.code, 256);
    if (code?.includes('revision_conflict')) return true;
    return Array.isArray(value.issues) && value.issues.some((issue) => (
      record(issue) && text(issue.code, 256)?.includes('revision-conflict')
    ));
  };

  const settleReceipt = (
    call: AiClientToolCall,
    entry: OrchestrationEntry,
    receipt: CanvasApplyReceipt,
  ) => {
    entry.receipt = receipt;
    const state: RuleEditorOrchestrationState = receipt.effect === 'unknown'
      ? 'unknown'
      : receipt.effect === 'rolled-back'
        ? 'rolled_back'
        : receipt.effect === 'not-applied'
          ? 'not_applied'
          : receipt.completion === 'completed'
            ? 'completed'
            : receipt.completion === 'partial'
              ? 'partial'
              : receipt.completion === 'awaiting-input' || receipt.completion === 'blocked'
                ? 'blocked'
                : 'failed';
    report(call, entry, state);
    const successful = receipt.effect === 'applied';
    const complete = successful && receipt.completion === 'completed';
    const result = {
      ok: successful,
      success: successful,
      complete,
      requestSatisfied: complete,
      ...(successful && !complete ? { partial: true } : {}),
      effect: receipt.effect,
      completion: receipt.completion,
      ...(receipt.effectState ? { effectState: receipt.effectState } : {}),
      ...(receipt.instruction ? { instruction: receipt.instruction } : {}),
      receipt,
      resultStatus: state,
    };
    entry.terminalAt = Date.now();
    entry.replayResult = result;
    return result;
  };

  const prepare = async (
    rawGoal: Record<string, unknown>,
    call: AiClientToolCall,
  ): Promise<AiClientToolPreparedCall | ReturnType<typeof createAiClientToolFailureResult>> => {
    cleanupEntries();
    const goal = parseRuleGoal(rawGoal);
    if (!goal) {
      return preparationFailure('rule_editor.goal.invalid', '规则目标只能描述业务意图，不能包含节点或平台内部配置。', 'clarify');
    }
    if (!capabilityIds.size) {
      return preparationFailure(
        'rule_editor.goal.capability_catalog_unavailable',
        '当前规则编辑器没有提供可验证的业务能力目录，不能提交编排目标。',
      );
    }
    const unavailableCapability = goal.goal.operations.find(operation => !capabilityIds.has(operation.capabilityRef));
    if (unavailableCapability) {
      return preparationFailure(
        'rule_editor.goal.capability_ref_unavailable',
        '规则目标引用了当前能力目录中不存在的 capabilityRef。',
      );
    }
    const key = logicalKey(call);
    const goalDigest = createGoalDigest(goal);
    const existing = entries.get(key);
    if (existing && existing.goalDigest !== goalDigest) {
      return preparationFailure(
        'rule_editor.orchestration.duplicate_mismatch',
        '同一调用标识已绑定到不同的规则目标，不能复用准备结果。',
      );
    }
    if (existing?.replayResult && existing.terminalAt !== undefined) {
      return {
        arguments: existing.handle ? toPreparedArguments(existing.handle) : {},
        skipConfirmation: true,
      };
    }
    if (existing?.handle) {
      return preparationFailure('rule_editor.orchestration.duplicate', '当前规则目标已进入准备状态，不能重新准备同一调用。');
    }
    if (!existing && liveEntryCount() >= MAX_ORCHESTRATION_ENTRIES) {
      return preparationFailure(
        'rule_editor.orchestration.capacity_exhausted',
        '规则编排正在处理过多未完成调用，请等待现有调用结束后再试。',
      );
    }
    const entry: OrchestrationEntry = { state: 'idle', startedAt: Date.now(), goalDigest };
    entries.set(key, entry);
    try {
      if (call.signal?.aborted) {
        report(call, entry, 'blocked');
        entry.terminalAt = Date.now();
        const failure = preparationFailure('rule_editor.orchestration.cancelled', '已取消本次规则编排。');
        entry.replayResult = failure;
        return failure;
      }
      const prepared = await options.executeInternalTool(
        RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
        { ...goal },
        withOrchestrationPhase(call, key, 'prepare'),
        call.reportProgress,
        call.signal,
      );
      const handle = toPreparedHandle(prepared, goal);
      if (call.signal?.aborted) {
        await cancelPrepared(call, key, handle ? toPreparedArguments(handle) : {});
        report(call, entry, 'blocked');
        entry.terminalAt = Date.now();
        const failure = preparationFailure('rule_editor.orchestration.cancelled', '已取消本次规则编排。');
        entry.replayResult = failure;
        return failure;
      }
      if (record(prepared) && (prepared.ok === false || prepared.success === false)) {
        const userInputRequired = prepared.userInputRequired === true;
        report(call, entry, userInputRequired ? 'awaiting_input' : 'blocked');
        const receipt = projectCanvasApplyReceipt({
          ...prepared,
          effect: 'not-applied',
          completion: userInputRequired ? 'awaiting-input' : 'blocked',
          effectState: 'not-started',
          externalExecutionStarted: false,
        });
        const failure = {
          ...prepared,
          ok: false,
          success: false,
          userInputRequired,
          completion: userInputRequired ? 'awaiting-input' : 'blocked',
          effectState: 'not-started',
          externalExecutionStarted: false,
          receipt,
        } as Record<string, unknown>;
        if (!userInputRequired) {
          delete failure.choices;
          delete failure.questions;
        }
        entry.receipt = receipt;
        entry.terminalAt = Date.now();
        entry.replayResult = failure;
        return failure as ReturnType<typeof createAiClientToolFailureResult>;
      }
      if (!handle) {
        report(call, entry, 'failed');
        entry.terminalAt = Date.now();
        const failure = preparationFailure('rule_editor.orchestration.invalid_prepare_result', '规则编辑器没有返回可验证的准备结果。');
        entry.replayResult = failure;
        return failure;
      }
      entry.handle = handle;
      report(call, entry, 'awaiting_confirmation');
      return {
        arguments: toPreparedArguments(handle),
        confirmation: {
          title: '确认修改规则画布',
          content: confirmationContent(handle),
        },
        cancel: async () => {
          if (entry.terminalAt !== undefined) return;
          await cancelPrepared(call, key, toPreparedArguments(handle));
          settleReceipt(call, entry, {
            effect: 'not-applied',
            completion: 'blocked',
            planDigest: handle.planDigest,
            baseRevision: handle.baseRevision,
            effectState: 'not-started',
            externalExecutionStarted: false,
          });
        },
      };
    } catch (error) {
      report(call, entry, 'failed');
      entry.terminalAt = Date.now();
      const failure = preparationFailure(
        'rule_editor.orchestration.prepare_failed',
        error instanceof Error ? error.message : '规则编排准备失败。',
      );
      entry.replayResult = failure;
      return failure;
    }
  };

  const execute = async (args: Record<string, unknown>, call: AiClientToolCall) => {
    cleanupEntries();
    const key = logicalKey(call);
    const entry = entries.get(key);
    if (entry?.replayResult) return entry.replayResult;
    const handle = entry?.handle;
    if (!entry || !handle || entry.state === 'blocked' || entry.state === 'failed') {
      return preparationFailure('rule_editor.orchestration.handle_missing', '当前规则目标没有可执行的准备结果。');
    }
    const preparedArguments = toPreparedArguments(handle);
    if (args.preparedPlanId !== handle.preparedPlanId || args.planDigest !== handle.planDigest || call.signal?.aborted) {
      await cancelPrepared(call, key, preparedArguments);
      return settleReceipt(call, entry, projectCanvasApplyReceipt({
        effect: 'not-applied', completion: 'blocked', effectState: 'not-started', externalExecutionStarted: false,
      }));
    }
    try {
      report(call, entry, 'applying');
      const applied = await options.executeInternalTool(
        RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
        preparedArguments,
        withOrchestrationPhase(call, key, 'execute'),
        call.reportProgress,
        call.signal,
      );
      report(call, entry, 'verifying');
      if (isRevisionConflict(applied)) {
        await cancelPrepared(call, key, preparedArguments);
      }
      return settleReceipt(call, entry, projectCanvasApplyReceipt(applied));
    } catch (error) {
      report(call, entry, 'verifying');
      try {
        const verified = await options.executeInternalTool(
          RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
          preparedArguments,
          withOrchestrationPhase(call, key, 'verify'),
          call.reportProgress,
          call.signal?.aborted ? undefined : call.signal,
        );
        if (hasConfirmedEffect(verified)) {
          return settleReceipt(call, entry, projectCanvasApplyReceipt(verified));
        }
      } catch {
        // Read-only verification is attempted once; unknown effects are never replayed.
      }
      report(call, entry, 'unknown');
      const receipt: CanvasApplyReceipt = {
        effect: 'unknown', completion: 'failed', planDigest: handle.planDigest, baseRevision: handle.baseRevision,
        effectState: 'unknown',
        unmet: [{ code: 'effect-unknown', message: '提交结果没有得到确认，必须先读取画布再决定下一步。' }],
      };
      const result = {
        ...settleReceipt(call, entry, receipt),
        error: error instanceof Error ? error.message : undefined,
      };
      entry.replayResult = result;
      return result;
    }
  };

  return { prepare, execute };
};
