import type {
  AiClientToolCall,
  AiClientToolConfirmationRequest,
  AiClientToolConfirmationResponse,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import { APPLY_CANVAS_TOOL_ID } from './toolRuntimeContracts';
import { projectRuleEditorCapabilityCatalogReport } from './ruleEditorOrchestrationContracts';

export const RULE_EDITOR_TASK_TARGET_VERSION = 'rule-editor-task-target/v1' as const;

export const normalizeRuleEditorCanvasRevision = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
);

export type RuleEditorTaskCheck = 'topology' | 'configuration' | 'bindings' | 'execution';

export interface RuleEditorTaskTargetState {
  version: typeof RULE_EDITOR_TASK_TARGET_VERSION;
  requiredChecks: RuleEditorTaskCheck[];
}

const TASK_CHECKS: readonly RuleEditorTaskCheck[] = [
  'topology',
  'configuration',
  'bindings',
  'execution',
];

const configuredTargetChecks: RuleEditorTaskCheck[] = ['configuration', 'bindings'];

export const createConfiguredRuleEditorTaskTarget = (): RuleEditorTaskTargetState => ({
  version: RULE_EDITOR_TASK_TARGET_VERSION,
  requiredChecks: [...configuredTargetChecks],
});

export const createCompleteRuleEditorTaskTarget = (): RuleEditorTaskTargetState => ({
  version: RULE_EDITOR_TASK_TARGET_VERSION,
  requiredChecks: ['topology', ...configuredTargetChecks],
});

export const createRuleEditorTaskTargetStore = () => {
  const targets = new Map<string, RuleEditorTaskTargetState>();
  return {
    get: (responseId?: string) => (responseId && targets.get(responseId)) || createCompleteRuleEditorTaskTarget(),
    set: (responseId: string | undefined, target: RuleEditorTaskTargetState) => {
      if (!responseId) return;
      targets.delete(responseId);
      targets.set(responseId, target);
      if (targets.size > 16) targets.delete(targets.keys().next().value!);
    },
    clear: () => targets.clear(),
  };
};

export const normalizeRuleEditorTaskTarget = (value: unknown): RuleEditorTaskTargetState | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== RULE_EDITOR_TASK_TARGET_VERSION || !Array.isArray(candidate.requiredChecks)) {
    return undefined;
  }
  const requiredChecks = candidate.requiredChecks.filter((check): check is RuleEditorTaskCheck => (
    typeof check === 'string' && TASK_CHECKS.includes(check as RuleEditorTaskCheck)
  ));
  if (requiredChecks.length === 0 || requiredChecks.length !== candidate.requiredChecks.length) {
    return undefined;
  }
  return {
    version: RULE_EDITOR_TASK_TARGET_VERSION,
    requiredChecks: [...new Set(requiredChecks)],
  };
};

export const mergeRuleEditorTaskTarget = (
  current: RuleEditorTaskTargetState,
  requested: RuleEditorTaskTargetState,
  allowReduction = false,
): RuleEditorTaskTargetState => {
  if (allowReduction) return requested;
  return {
    version: RULE_EDITOR_TASK_TARGET_VERSION,
    requiredChecks: TASK_CHECKS.filter((check) => (
      current.requiredChecks.includes(check) || requested.requiredChecks.includes(check)
    )),
  };
};

const isRequestedConfiguredTarget = (value: unknown) => value === 'configured';

export interface RuleEditorLocalTargetConfirmation {
  callId: string;
  requestId: string;
  toolId: string;
  requestedTargetState: unknown;
  completionMode?: unknown;
  approved: unknown;
}

export const consumeRuleEditorLocalTargetConfirmation = (
  currentTarget: RuleEditorTaskTargetState,
  confirmation: RuleEditorLocalTargetConfirmation,
): RuleEditorTaskTargetState => {
  if (confirmation.toolId !== APPLY_CANVAS_TOOL_ID
    || confirmation.callId !== confirmation.requestId
    || confirmation.approved !== true) {
    return currentTarget;
  }
  if (confirmation.requestedTargetState === 'configured'
    && confirmation.completionMode === 'partial-draft') {
    return createConfiguredRuleEditorTaskTarget();
  }
  if (confirmation.requestedTargetState !== 'skeleton') return currentTarget;
  return {
    version: RULE_EDITOR_TASK_TARGET_VERSION,
    requiredChecks: ['topology'],
  };
};

export const requestRuleEditorLocalTargetConfirmation = async (
  currentTarget: RuleEditorTaskTargetState,
  call: Pick<AiClientToolCall, 'id' | 'arguments'>,
  request: AiClientToolConfirmationRequest,
  requestConfirmation: (
    request: AiClientToolConfirmationRequest,
  ) => Promise<AiClientToolConfirmationResponse | void> | AiClientToolConfirmationResponse | void,
) => {
  const response = await requestConfirmation(request);
  return {
    response,
    taskTarget: consumeRuleEditorLocalTargetConfirmation(currentTarget, {
      callId: call.id,
      requestId: request.id,
      toolId: request.toolId,
      requestedTargetState: call.arguments?.targetState,
      completionMode: call.arguments?.completion?.mode,
      approved: response?.approved,
    }),
  };
};

export const resolveRuleEditorTaskTargetFromExecution = (
  currentTarget: RuleEditorTaskTargetState,
  args: Record<string, any>,
) => {
  const { targetState: requestedTargetState, ...toolArguments } = args;
  let taskTarget = currentTarget;
  if (isRequestedConfiguredTarget(requestedTargetState)) {
    taskTarget = mergeRuleEditorTaskTarget(taskTarget, createConfiguredRuleEditorTaskTarget());
  }
  return { taskTarget, toolArguments };
};

let bridgeRequestSequence = 0;

export const createRuleEditorBridgeRequestId = (
  logicalToolCallId?: string,
  phase?: string,
) => {
  bridgeRequestSequence = (bridgeRequestSequence + 1) % Number.MAX_SAFE_INTEGER;
  const logicalPart = logicalToolCallId?.trim() || 'anonymous';
  const phasePart = phase?.trim() || 'request';
  return `rule-editor-${phasePart}-${logicalPart}-${Date.now().toString(36)}-${bridgeRequestSequence.toString(36)}`;
};

export const createRuleEditorContextDigest = (value: unknown): string => {
  try {
    const context = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    // Keep revision and verification facts observable without copying the graph or node scripts.
    return JSON.stringify({
      ruleId: context.ruleId,
      workspaceId: context.workspaceId,
      canvasRevision: context.canvasRevision,
      dirty: context.dirty,
      nodeCount: context.nodeCount,
      linkCount: context.linkCount,
      selectedNodeIds: context.selectedNodeIds,
      configurationRevision: context.configurationRevision,
      configurationDigest: context.configurationDigest,
      completionChecks: context.completionChecks,
      verification: context.verification,
      taskProgress: context.taskProgress,
      validation: context.validation,
      orchestrationCapabilities: projectRuleEditorCapabilityCatalogReport(
        Array.isArray(context.orchestrationCapabilities) ? context.orchestrationCapabilities : undefined,
      ).items,
    });
  } catch {
    return '';
  }
};

export const createRuleEditorCapabilityCatalogDigest = (value: unknown): string => {
  try {
    const context = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    return JSON.stringify(projectRuleEditorCapabilityCatalogReport(
      Array.isArray(context.orchestrationCapabilities) ? context.orchestrationCapabilities : undefined,
    ).items);
  } catch {
    return '';
  }
};

export const shouldAdvanceRuleEditorContextVersion = (options: {
  previousDigest: string;
  nextContext: unknown;
  inFlightClientToolCall: boolean;
}): { advance: boolean; digest: string; pendingDigest?: string } => {
  const digest = createRuleEditorContextDigest(options.nextContext);
  if (digest === options.previousDigest) {
    return { advance: false, digest };
  }
  if (options.inFlightClientToolCall) {
    return { advance: false, digest: options.previousDigest, pendingDigest: digest };
  }
  return { advance: true, digest };
};
