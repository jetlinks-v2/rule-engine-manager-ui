import {
  createAiClientToolFailureResult,
  type AiClientToolContractFragment,
  type AiClientToolCall,
  type AiClientToolDefinition,
  type AiClientToolExecutionContext,
  type AiClientToolRuntime,
  withAiClientToolEvidence,
  withAiClientToolContractEvidence,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import { resolveAiClientToolBindingPath } from '@jetlinks-web-core/layout/components/AiChat/clientToolBindingPath';
import {
  resolveRuleEditorConfirmOptions,
  resolveRuleEditorToolDisplayName,
  type RuleEditorRemoteToolDefinition,
} from './confirmOptions';
import {
  APPLY_CANVAS_CONTRACT,
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  APPLY_CANVAS_TOOL_ID,
  PREPARE_CANVAS_TOOL_ID,
  RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  RULE_EDITOR_RESOURCE_VERSION,
  resolveRuleEditorRemoteContract,
} from './toolRuntimeContracts';
import {
  createConfiguredRuleEditorTaskTarget,
  createRuleEditorBridgeRequestId,
  normalizeRuleEditorCanvasRevision,
  type RuleEditorTaskCheck,
  type RuleEditorTaskTargetState,
} from './ruleEditorAgentContext';

export interface RemoteRuleEditorToolDefinition extends RuleEditorRemoteToolDefinition {
  id: string;
  name?: string;
  description?: string;
  inputs?: Array<Record<string, any>>;
  output?: Record<string, any>;
  expands?: Record<string, any>;
  annotations?: Record<string, any>;
  agentVisible?: boolean;
}

export const RULE_EDITOR_REMOTE_ADAPTER_VERSION = 'rule-editor-remote-definition/v1' as const;

export interface RuleEditorToolExecutionContext extends AiClientToolExecutionContext {
  expectedRevision?: number;
  /** Internal v2 orchestration phase; never model-supplied tool arguments. */
  phase?: 'prepare' | 'execute' | 'verify' | 'cancel';
}

const RULE_EDITOR_FLOW_MODES = ['request-response', 'realtime-stream', 'one-way-trigger'] as const;
type RuleEditorFlowMode = typeof RULE_EDITOR_FLOW_MODES[number];
const RULE_EDITOR_COMPLETION_MODES = ['complete-topology', 'partial-draft'] as const;
type RuleEditorCompletionMode = typeof RULE_EDITOR_COMPLETION_MODES[number];

interface RuleEditorCanvasChange extends Record<string, unknown> {
  kind: string;
}

interface RuleEditorTopologySnapshot extends Record<string, unknown> {
  contract: 'rule-editor.topology-snapshot/v1';
  complete: true;
  truncated: boolean;
  nodeCount: number;
  linkCount: number;
  nodes: Array<{
    key: string;
    label: string;
    type: string;
    source: boolean;
    terminal: boolean;
  }>;
  links: Array<{
    source: string;
    target: string;
    sourcePort: number;
  }>;
}

type RuleEditorVerificationStatus = 'pass' | 'fail' | 'unknown' | 'not-required';
type RuleEditorMutationStatus = 'not-applied' | 'applied' | 'rolled-back' | 'unknown';

interface RuleEditorIssue extends Record<string, unknown> {
  code?: string;
  path?: string;
  message?: string;
}

interface RuleEditorCanvasApplyResult extends Record<string, unknown> {
  ok: true;
  success: true;
  contract: 'rule-editor.canvas-apply-result/v1';
  flowMode: RuleEditorFlowMode;
  completion: {
    mode: RuleEditorCompletionMode;
    satisfied: boolean;
    sourceCount: number;
    terminalCount: number;
  };
  mutation?: {
    status: RuleEditorMutationStatus;
    requestId?: string;
    editorSessionId?: string;
    ruleId?: string;
    baseRevision?: number;
    appliedRevision?: number;
    normalizedPlanDigest?: string;
  };
  verification?: Partial<Record<'topology' | 'configuration' | 'bindings' | 'execution', {
    status: RuleEditorVerificationStatus;
    issues?: RuleEditorIssue[];
  }>>;
  taskProgress?: {
    requiredChecks: RuleEditorTaskCheck[];
    satisfied: boolean;
    unresolved: RuleEditorIssue[];
  };
  complete?: boolean;
  resultStatus?: string;
  changes: RuleEditorCanvasChange[];
  topology?: RuleEditorTopologySnapshot;
  presentation?: {
    mermaid: string;
  };
  canvasRevision: number;
  rolledBack: false;
  validation?: {
    issueCount?: number;
    truncated?: boolean;
    issues?: unknown[];
  };
  instruction?: string;
  warnings?: unknown[];
}

const CANVAS_CHANGE_IDENTITY_KEYS = [
  'nodeType',
  'sourceId',
  'targetId',
  'sourcePort',
  'count',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const BROKEN_CANVAS_STEPS_INSTRUCTION = 'steps 必须是结构化数组；请修正类型后重新调用。';
const BROKEN_CANVAS_COMPLETION_INSTRUCTION = 'completion 必须是结构化对象；请修正类型后重新调用。';

const liftStringNodeReference = (value: string): { kind: 'alias'; value: string } => ({
  kind: 'alias',
  value: value.trim(),
});

const coerceCanvasNodeReference = (value: unknown): unknown => (
  typeof value === 'string' && value.trim() ? liftStringNodeReference(value) : value
);

const coerceCanvasNodeReferenceList = (value: unknown): unknown => (
  Array.isArray(value) ? value.map((item) => coerceCanvasNodeReference(item)) : value
);

const stepHasStringNodeRef = (step: unknown): boolean => {
  if (!isRecord(step)) return false;
  return typeof step.source === 'string'
    || typeof step.target === 'string'
    || typeof step.node === 'string'
    || (Array.isArray(step.nodes) && step.nodes.some((item) => typeof item === 'string'))
    || (Array.isArray(step.connections) && step.connections.some((item) => (
      isRecord(item) && (typeof item.source === 'string' || typeof item.target === 'string')
    )));
};

const completionHasStringNodeRef = (completion: unknown): boolean => (
  isRecord(completion)
  && (
    (Array.isArray(completion.sources) && completion.sources.some((item) => typeof item === 'string'))
    || (Array.isArray(completion.terminals) && completion.terminals.some((item) => typeof item === 'string'))
  )
);

const coerceCanvasPlanNodeReferences = (plan: Record<string, any>) => {
  if (isRecord(plan.completion)) {
    if (Array.isArray(plan.completion.sources)) {
      plan.completion.sources = coerceCanvasNodeReferenceList(plan.completion.sources);
    }
    if (Array.isArray(plan.completion.terminals)) {
      plan.completion.terminals = coerceCanvasNodeReferenceList(plan.completion.terminals);
    }
  }
  if (!Array.isArray(plan.steps)) return;
  for (const step of plan.steps) {
    if (!isRecord(step)) continue;
    if (typeof step.node === 'string') step.node = coerceCanvasNodeReference(step.node);
    if (typeof step.source === 'string') step.source = coerceCanvasNodeReference(step.source);
    if (typeof step.target === 'string') step.target = coerceCanvasNodeReference(step.target);
    if (Array.isArray(step.nodes)) {
      step.nodes = coerceCanvasNodeReferenceList(step.nodes);
    }
    if (Array.isArray(step.connections)) {
      step.connections = step.connections.map((connection) => (
        isRecord(connection)
          ? {
            ...connection,
            source: coerceCanvasNodeReference(connection.source),
            target: coerceCanvasNodeReference(connection.target),
          }
          : connection
      ));
    }
    if (Array.isArray(step.configReferences)) {
      step.configReferences = step.configReferences.map((item) => (
        isRecord(item) ? { ...item, ref: coerceCanvasNodeReference(item.ref) } : item
      ));
    }
  }
};

export const coerceApplyCanvasPlanArguments = (
  args: Record<string, any>,
): { ok: true; args: Record<string, any> } | {
  ok: false
  field: string
  instruction?: string
} => {
  if (typeof args.preparedPlanId === 'string' && args.preparedPlanId.trim()) {
    const unsupported = Object.keys(args).find((key) => key !== 'preparedPlanId' && key !== 'planDigest');
    return unsupported
      ? { ok: false, field: unsupported, instruction: 'prepared canvas apply accepts only preparedPlanId and planDigest.' }
      : { ok: true, args };
  }
  if (args.actions !== undefined) {
    return {
      ok: false,
      field: 'actions',
      instruction: 'actions 不是公开画布计划字段；请直接提交结构化计划对象。',
    };
  }
  const hasStringNodeRef = Array.isArray(args.steps) && args.steps.some(stepHasStringNodeRef);
  const hasStringCompletionRef = completionHasStringNodeRef(args.completion);
  if (typeof args.steps === 'string' || (args.steps !== undefined && !Array.isArray(args.steps))) {
    return { ok: false, field: 'steps', instruction: BROKEN_CANVAS_STEPS_INSTRUCTION };
  }
  if (typeof args.completion === 'string' || (args.completion !== undefined && !isRecord(args.completion))) {
    return { ok: false, field: 'completion', instruction: BROKEN_CANVAS_COMPLETION_INSTRUCTION };
  }
  if (!hasStringNodeRef && !hasStringCompletionRef) {
    return { ok: true, args };
  }
  // Published schema already owns plan semantics. Parent only keeps string node references compatible.
  const next: Record<string, any> = { ...args };
  if (Array.isArray(next.steps) && next.steps.some(stepHasStringNodeRef)) {
    next.steps = next.steps.map((step: unknown) => (isRecord(step) ? { ...step } : step));
  }
  if (completionHasStringNodeRef(next.completion)) {
    next.completion = { ...next.completion };
  }
  coerceCanvasPlanNodeReferences(next);
  return { ok: true, args: next };
};

const applyCanvasDescription = (description?: string) => (
  [description?.trim(), APPLY_CANVAS_PLAN_BINDING_GUIDE].filter(Boolean).join(' ')
);

const isRuleEditorFlowMode = (value: unknown): value is RuleEditorFlowMode => (
  typeof value === 'string' && RULE_EDITOR_FLOW_MODES.some((mode) => mode === value)
);

const isCanvasCompletion = (value: unknown): value is RuleEditorCanvasApplyResult['completion'] => {
  if (!isRecord(value)
    || !RULE_EDITOR_COMPLETION_MODES.some((mode) => mode === value.mode)
    || typeof value.satisfied !== 'boolean'
    || !Number.isSafeInteger(value.sourceCount) || Number(value.sourceCount) < 0
    || !Number.isSafeInteger(value.terminalCount) || Number(value.terminalCount) < 0) {
    return false;
  }
  if (value.mode === 'complete-topology') {
    return value.satisfied === true && Number(value.sourceCount) > 0 && Number(value.terminalCount) > 0;
  }
  return value.satisfied === false && value.sourceCount === 0 && value.terminalCount === 0;
};

const isCanvasChange = (value: unknown): value is RuleEditorCanvasChange => (
  isRecord(value) && typeof value.kind === 'string' && Boolean(value.kind)
);

const isVerificationStatus = (value: unknown): value is RuleEditorVerificationStatus => (
  value === 'pass' || value === 'fail' || value === 'unknown' || value === 'not-required'
);

const isBoundedIssue = (value: unknown): value is RuleEditorIssue => (
  isRecord(value)
  && ['code', 'path', 'message'].some((key) => value[key] === undefined || typeof value[key] === 'string')
);

const isCanvasMutation = (value: unknown): value is NonNullable<RuleEditorCanvasApplyResult['mutation']> => (
  isRecord(value)
  && ['not-applied', 'applied', 'rolled-back', 'unknown'].includes(String(value.status))
  && ['requestId', 'editorSessionId', 'ruleId', 'normalizedPlanDigest'].every((key) => (
    value[key] === undefined || typeof value[key] === 'string'
  ))
  && ['baseRevision', 'appliedRevision'].every((key) => (
    value[key] === undefined || (Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)
  ))
);

const isCanvasVerification = (value: unknown): value is NonNullable<RuleEditorCanvasApplyResult['verification']> => (
  isRecord(value)
  && ['topology', 'configuration', 'bindings', 'execution'].every((key) => {
    const check = value[key];
    return check === undefined || (isRecord(check)
      && isVerificationStatus(check.status)
      && (check.issues === undefined || (Array.isArray(check.issues) && check.issues.every(isBoundedIssue))));
  })
);

const isCanvasTaskProgress = (value: unknown): value is NonNullable<RuleEditorCanvasApplyResult['taskProgress']> => (
  isRecord(value)
  && Array.isArray(value.requiredChecks)
  && value.requiredChecks.every((check) => ['topology', 'configuration', 'bindings', 'execution'].includes(String(check)))
  && typeof value.satisfied === 'boolean'
  && Array.isArray(value.unresolved)
  && value.unresolved.every(isBoundedIssue)
);

const isSafeTopologyLabel = (value: string) => (
  value.length <= 160 && !/[\u0000-\u001f\u007f"\\`<>&]/.test(value)
);

const isTopologySnapshot = (value: unknown): value is RuleEditorTopologySnapshot => {
  if (!isRecord(value)
    || value.contract !== 'rule-editor.topology-snapshot/v1'
    || value.complete !== true
    || typeof value.truncated !== 'boolean'
    || !Number.isSafeInteger(value.nodeCount) || Number(value.nodeCount) < 1
    || !Number.isSafeInteger(value.linkCount) || Number(value.linkCount) < 0
    || !Array.isArray(value.nodes)
    || !Array.isArray(value.links)) {
    return false;
  }
  if (value.truncated) {
    return value.nodes.length === 0 && value.links.length === 0;
  }
  if (value.nodeCount !== value.nodes.length || value.linkCount !== value.links.length) return false;
  const nodeKeys = new Set<string>();
  for (const [index, node] of value.nodes.entries()) {
    if (!isRecord(node)
      || node.key !== `n${index + 1}`
      || nodeKeys.has(node.key)
      || typeof node.label !== 'string' || !node.label || !isSafeTopologyLabel(node.label)
      || typeof node.type !== 'string' || node.type.length > 120
      || typeof node.source !== 'boolean'
      || typeof node.terminal !== 'boolean') {
      return false;
    }
    nodeKeys.add(node.key);
  }
  return value.links.every(link => (
    isRecord(link)
    && typeof link.source === 'string' && nodeKeys.has(link.source)
    && typeof link.target === 'string' && nodeKeys.has(link.target)
    && Number.isSafeInteger(link.sourcePort) && Number(link.sourcePort) >= 0
  ));
};

const TOPOLOGY_MERMAID_MAX_LENGTH = 16 * 1024;

const canPublishTopologyDiagram = (topology: unknown): topology is RuleEditorTopologySnapshot => (
  isTopologySnapshot(topology)
  && !topology.truncated
  && topology.nodeCount >= 2
  && topology.linkCount >= 1
);

const isPublishableTopologyMermaid = (mermaid: string) => (
  Boolean(mermaid.trim()) && mermaid.length <= TOPOLOGY_MERMAID_MAX_LENGTH
);

// Used only to reject an unexpected iframe mermaid that does not match the snapshot.
const toVerifiedTopologyMermaid = (topology: RuleEditorTopologySnapshot) => [
  'flowchart LR',
  ...topology.nodes.map(node => `  ${node.key}["${node.label}"]`),
  ...topology.links.map(link => `  ${link.source} --> ${link.target}`),
].join('\n');

const hasValidTopologyPresentation = (value: Record<string, unknown>) => {
  const topology = value.topology;
  const presentation = value.presentation;
  if (topology !== undefined && !isTopologySnapshot(topology)) return false;
  // Missing mermaid is success. Default apply must not create a flowchart obligation.
  if (presentation === undefined) return true;
  if (!isRecord(presentation)
    || typeof presentation.mermaid !== 'string'
    || !isPublishableTopologyMermaid(presentation.mermaid)
    || !canPublishTopologyDiagram(topology)) {
    return false;
  }
  return presentation.mermaid === toVerifiedTopologyMermaid(topology);
};

const isCanvasApplySuccess = (value: unknown): value is RuleEditorCanvasApplyResult => {
  if (!isRecord(value)) return false;
  const completion = isCanvasCompletion(value.completion) ? value.completion : undefined;
  const topologyMatchesCompletion = completion !== undefined && (value.topology === undefined
    || (isTopologySnapshot(value.topology)
      && value.topology.nodes.filter(node => node.source).length === completion.sourceCount
      && value.topology.nodes.filter(node => node.terminal).length === completion.terminalCount));
  return value.ok === true
    && value.success === true
    && value.contract === 'rule-editor.canvas-apply-result/v1'
    && isRuleEditorFlowMode(value.flowMode)
    && isCanvasCompletion(value.completion)
    && Array.isArray(value.changes) && value.changes.every(isCanvasChange)
    && hasValidTopologyPresentation(value)
    && topologyMatchesCompletion
    && (value.completion.mode !== 'partial-draft'
      || (value.topology === undefined && value.presentation === undefined))
    && typeof value.canvasRevision === 'number'
    && Number.isSafeInteger(value.canvasRevision) && value.canvasRevision >= 0
    && value.rolledBack === false
    && (value.mutation === undefined || isCanvasMutation(value.mutation))
    && (value.verification === undefined || isCanvasVerification(value.verification))
    && (value.taskProgress === undefined || isCanvasTaskProgress(value.taskProgress));
};

const toModelFacingCanvasChange = (change: RuleEditorCanvasChange): RuleEditorCanvasChange => {
  const projected: RuleEditorCanvasChange = { kind: change.kind };
  for (const key of CANVAS_CHANGE_IDENTITY_KEYS) {
    if (change[key] !== undefined) projected[key] = change[key];
  }
  return projected;
};

const toModelFacingCompletion = (
  completion: RuleEditorCanvasApplyResult['completion'],
): RuleEditorCanvasApplyResult['completion'] => ({
  mode: completion.mode,
  satisfied: completion.satisfied,
  sourceCount: completion.sourceCount,
  terminalCount: completion.terminalCount,
});

const toModelFacingValidationIssue = (issue: unknown) => {
  if (!isRecord(issue)) return issue;
  const projected: Record<string, unknown> = {};
  if (typeof issue.path === 'string') projected.path = issue.path;
  if (typeof issue.code === 'string') projected.code = issue.code;
  if (typeof issue.message === 'string') projected.message = issue.message;
  if (typeof issue.op === 'string' && issue.op) projected.op = issue.op;
  for (const key of ['validationPath', 'constraint', 'expectedType', 'actualType'] as const) {
    if (typeof issue[key] === 'string') projected[key] = issue[key];
  }
  if (Array.isArray(issue.repairPaths) && issue.repairPaths.every((path) => typeof path === 'string')) {
    projected.repairPaths = issue.repairPaths.slice(0, 8);
  }
  if (typeof issue.sameArgumentsAllowed === 'boolean') {
    projected.sameArgumentsAllowed = issue.sameArgumentsAllowed;
  }
  return Object.keys(projected).length ? projected : undefined;
};

const toModelFacingValidation = (validation: RuleEditorCanvasApplyResult['validation']) => {
  if (!isRecord(validation)) return undefined;
  const projected: NonNullable<RuleEditorCanvasApplyResult['validation']> = {};
  if (typeof validation.issueCount === 'number') projected.issueCount = validation.issueCount;
  if (typeof validation.truncated === 'boolean') projected.truncated = validation.truncated;
  if (Array.isArray(validation.issues)) {
    const issues = validation.issues
      .map(toModelFacingValidationIssue)
      .filter((issue): issue is Exclude<typeof issue, undefined> => issue !== undefined);
    if (issues.length) projected.issues = issues;
  }
  return Object.keys(projected).length ? projected : undefined;
};

const toModelFacingIssue = (issue: RuleEditorIssue): RuleEditorIssue => {
  const projected = toModelFacingValidationIssue(issue);
  return isRecord(projected) ? projected : {};
};

const toModelFacingMutation = (
  mutation: RuleEditorCanvasApplyResult['mutation'],
  canvasRevision: number,
): NonNullable<RuleEditorCanvasApplyResult['mutation']> => {
  const projected: NonNullable<RuleEditorCanvasApplyResult['mutation']> = {
    status: mutation?.status || 'applied',
  };
  for (const key of ['requestId', 'editorSessionId', 'ruleId', 'baseRevision', 'appliedRevision', 'normalizedPlanDigest'] as const) {
    if (mutation?.[key] !== undefined) projected[key] = mutation[key] as never;
  }
  if (projected.appliedRevision === undefined && projected.status === 'applied') {
    projected.appliedRevision = canvasRevision;
  }
  return projected;
};

const toModelFacingVerification = (
  verification: RuleEditorCanvasApplyResult['verification'],
  completion: RuleEditorCanvasApplyResult['completion'],
  stale = false,
): NonNullable<RuleEditorCanvasApplyResult['verification']> => {
  const projected: NonNullable<RuleEditorCanvasApplyResult['verification']> = {};
  const topologyStatus: RuleEditorVerificationStatus = completion.satisfied ? 'pass' : 'unknown';
  for (const key of ['topology', 'configuration', 'bindings', 'execution'] as const) {
    const check = verification?.[key];
    const staleIssue = {
      code: 'verification-stale',
      message: 'Canvas changed after this write receipt; re-read and verify the current state.',
    };
    projected[key] = check
      ? {
          status: stale && check.status !== 'not-required' ? 'unknown' : check.status,
          ...((check.issues?.length || (stale && check.status !== 'not-required'))
            ? {
                issues: [
                  ...(check.issues?.map(toModelFacingIssue) || []),
                  ...(stale && check.status !== 'not-required' ? [staleIssue] : []),
                ],
              }
            : {}),
        }
      : { status: stale ? 'unknown' : key === 'topology' ? topologyStatus : 'unknown' };
  }
  return projected;
};

const isMutationVerificationStale = (
  mutation: RuleEditorCanvasApplyResult['mutation'],
  canvasRevision: number,
) => mutation?.status === 'applied'
  && Number.isSafeInteger(mutation.appliedRevision)
  && Number(mutation.appliedRevision) < canvasRevision;

const LEGACY_TASK_PROGRESS_ISSUE = {
  code: 'task-progress-unavailable',
  message: 'This write receipt has no configuration or binding completion evidence.',
};

const RULE_EDITOR_TASK_CHECK_ORDER: readonly RuleEditorTaskCheck[] = [
  'topology',
  'configuration',
  'bindings',
  'execution',
];

const requiredChecksForCompletion = (
  taskTarget: RuleEditorTaskTargetState,
  completion: RuleEditorCanvasApplyResult['completion'],
) => RULE_EDITOR_TASK_CHECK_ORDER.filter((check) => (
  taskTarget.requiredChecks.includes(check)
  || (completion.mode === 'complete-topology' && check === 'topology')
));

const toModelFacingTaskProgress = (
  taskProgress: RuleEditorCanvasApplyResult['taskProgress'],
  verification: NonNullable<RuleEditorCanvasApplyResult['verification']>,
  taskTarget: RuleEditorTaskTargetState,
  completion: RuleEditorCanvasApplyResult['completion'],
): NonNullable<RuleEditorCanvasApplyResult['taskProgress']> => (
  (() => {
    const requiredChecks = requiredChecksForCompletion(taskTarget, completion);
    const unresolved = taskProgress?.unresolved.map(toModelFacingIssue) || [LEGACY_TASK_PROGRESS_ISSUE];
    for (const check of requiredChecks) {
      if (verification[check]?.status !== 'pass') {
        unresolved.push({
          code: `${check}-not-verified`,
          message: `${check} has not passed for the current target.`,
        });
      }
    }
    const satisfied = requiredChecks.every((check) => verification[check]?.status === 'pass');
    return {
      requiredChecks,
      satisfied,
      unresolved: satisfied ? [] : unresolved,
    };
  })()
);

// Compact model-facing success: write evidence only. The canvas is the topology visualization;
// do not emit mermaid or node labels the model would copy into a second graph.
const toModelFacingCanvasApplyResult = (
  result: RuleEditorCanvasApplyResult,
  taskTarget = createConfiguredRuleEditorTaskTarget(),
): RuleEditorCanvasApplyResult => {
  const mutation = toModelFacingMutation(result.mutation, result.canvasRevision);
  const verification = toModelFacingVerification(
    result.verification,
    result.completion,
    isMutationVerificationStale(mutation, result.canvasRevision),
  );
  const taskProgress = toModelFacingTaskProgress(result.taskProgress, verification, taskTarget, result.completion);
  const projected: RuleEditorCanvasApplyResult = {
    ok: true,
    success: true,
    contract: result.contract,
    flowMode: result.flowMode,
    completion: toModelFacingCompletion(result.completion),
    changes: result.changes.map(toModelFacingCanvasChange),
    canvasRevision: result.canvasRevision,
    rolledBack: false,
    mutation,
    verification,
    taskProgress,
  };
  projected.complete = taskProgress.satisfied;
  if (typeof result.resultStatus === 'string' && result.resultStatus) {
    projected.resultStatus = result.resultStatus;
  }
  const validation = toModelFacingValidation(result.validation);
  if (validation) projected.validation = validation;
  if (typeof result.instruction === 'string' && result.instruction) {
    projected.instruction = result.instruction;
  }
  if (Array.isArray(result.warnings) && result.warnings.length) {
    const warnings = result.warnings
      .map(toModelFacingValidationIssue)
      .filter((issue): issue is Exclude<typeof issue, undefined> => issue !== undefined);
    if (warnings.length) projected.warnings = warnings;
  }
  return projected;
};

export const projectCanonicalCanvasApplyResult = (
  value: unknown,
  taskTarget = createConfiguredRuleEditorTaskTarget(),
): Record<string, unknown> | undefined => (
  isCanvasApplySuccess(value) ? toModelFacingCanvasApplyResult(value, taskTarget) : undefined
);

const DEFAULT_USER_APPLY_SUMMARY = '已把草稿写到当前画布，尚未保存或发布。';
const PARTIAL_DRAFT_APPLY_SUMMARY = '局部草稿已按计划写入，当前草稿范围的必需校验已通过。该结果不声明完整规则拓扑，尚未保存或发布。';

const summarizeIncompleteChecks = (
  taskProgress: NonNullable<RuleEditorCanvasApplyResult['taskProgress']>,
  verification: NonNullable<RuleEditorCanvasApplyResult['verification']>,
) => {
  const names: Record<string, string> = {
    topology: '拓扑',
    configuration: '配置',
    bindings: '绑定',
    execution: '执行验证',
  };
  const unresolved = taskProgress.requiredChecks.filter((check) => verification[check]?.status !== 'pass');
  const labels = unresolved.length
    ? unresolved.map((check) => names[check])
    : ['配置与绑定验证'];
  return `尚未完成：${labels.join('、')}。`;
};

const summarizeCanvasApplyReceipt = (result: RuleEditorCanvasApplyResult): string => {
  const mutationStatus = result.mutation?.status;
  if (mutationStatus === 'rolled-back') return '草稿变更已回滚，尚未保存或发布。';
  if (mutationStatus === 'unknown') return '草稿修改结果尚未确认，尚未确认保存或发布。';
  if (mutationStatus !== 'applied') return '未修改当前草稿。';
  if (!result.taskProgress?.satisfied) {
    return `${DEFAULT_USER_APPLY_SUMMARY}${summarizeIncompleteChecks(result.taskProgress!, result.verification!)}`;
  }
  return result.completion.mode === 'partial-draft'
    ? PARTIAL_DRAFT_APPLY_SUMMARY
    : '规则草稿已按计划写入，当前目标的必需校验已通过，尚未保存或发布。';
};

const withCanvasApplyEvidence = (
  result: RuleEditorCanvasApplyResult,
  source: RuleEditorCanvasApplyResult = result,
) => {
  const taskProgress = result.taskProgress!;
  // User prose is derived only from normalized receipt facts; execution instructions remain model-only.
  const summary = summarizeCanvasApplyReceipt(result);
  const instruction = typeof source.instruction === 'string' ? source.instruction : summary;
  const partial = !taskProgress.satisfied;
  const wrapped = withAiClientToolContractEvidence(result, APPLY_CANVAS_CONTRACT, {
    complete: taskProgress.satisfied,
    requestSatisfied: taskProgress.satisfied,
    truncated: false,
    resultStatus: partial ? 'partial' : 'applied',
    facts: {
      flowMode: source.flowMode,
      completionMode: source.completion.mode,
      topologySatisfied: source.completion.satisfied,
      mutationStatus: result.mutation?.status,
      verification: result.verification,
      taskProgress: result.taskProgress,
      sourceCount: source.completion.sourceCount,
      terminalCount: source.completion.terminalCount,
      canvasRevision: source.canvasRevision,
      rolledBack: source.rolledBack,
      validationIssueCount: source.validation?.issueCount,
      topologyNodeCount: source.topology?.nodeCount,
      topologyLinkCount: source.topology?.linkCount,
    },
    claims: summary
      ? [{
          id: 'suggested-summary',
          label: resolveRuleEditorToolDisplayName({ id: APPLY_CANVAS_TOOL_ID, name: '规则草稿' }),
          role: 'summary',
          value: summary,
          binding: 'canvas-changes',
          visibility: 'user',
        }]
      : undefined,
    outputs: [
      {
        name: 'canvas-changes',
        path: '$.changes',
        recordCount: result.changes.length,
        complete: true,
        truncated: false,
      },
    ],
  });
  return {
    ...wrapped,
    ...(partial ? { partial: true, recoveryAction: 'repair' as const } : {}),
    instruction,
    evidence: Object.assign({}, wrapped.evidence, { instruction }),
  };
};

const toCanvasApplyUnknownResult = (
  taskTarget: RuleEditorTaskTargetState,
  mutation?: RuleEditorCanvasApplyResult['mutation'],
  code = 'rule_editor.canvas_apply.unknown',
  message = 'Canvas apply timed out before the editor confirmed the mutation state.',
) => ({
  ok: false as const,
  success: false as const,
  code,
  message,
  failureDisposition: 'dependency' as const,
  recoveryAction: 'clarify' as const,
  retryable: false,
  complete: false,
  requestSatisfied: false,
  resultStatus: 'unknown',
  mutation: { status: 'unknown' as const, ...(mutation || {}) },
  verification: Object.fromEntries(
    ['topology', 'configuration', 'bindings', 'execution'].map((check) => [check, { status: 'unknown' }]),
  ),
  taskProgress: {
    requiredChecks: [...taskTarget.requiredChecks],
    satisfied: false,
    unresolved: [{
      code: 'mutation-state-unknown',
      message: 'Confirm the editor receipt or current canvas revision before another write.',
    }],
  },
});

const isUnknownWriteMutation = (value: Record<string, unknown>) => (
  isCanvasMutation(value.mutation) && value.mutation.status === 'unknown'
);

const toUnknownWriteFailure = (
  value: Record<string, unknown>,
  taskTarget: RuleEditorTaskTargetState,
) => {
  const { effects: _effects, continuation: _continuation, ...unconfirmed } = value;
  const completion = isCanvasCompletion(value.completion)
    ? value.completion
    : { mode: 'partial-draft' as const, satisfied: false, sourceCount: 0, terminalCount: 0 };
  const verification = isCanvasVerification(value.verification)
    ? toModelFacingVerification(value.verification, completion)
    : toModelFacingVerification(undefined, completion);
  const taskProgress = toModelFacingTaskProgress(
    isCanvasTaskProgress(value.taskProgress) ? value.taskProgress : undefined,
    verification,
    taskTarget,
    completion,
  );
  return {
    ...unconfirmed,
    ok: false as const,
    success: false as const,
    failureDisposition: 'dependency' as const,
    recoveryAction: 'clarify' as const,
    retryable: false,
    complete: false,
    requestSatisfied: false,
    resultStatus: 'unknown',
    mutation: toModelFacingMutation(
      value.mutation as RuleEditorCanvasApplyResult['mutation'],
      Number.isSafeInteger(value.canvasRevision) && Number(value.canvasRevision) >= 0
        ? Number(value.canvasRevision)
        : 0,
    ),
    verification,
    taskProgress: {
      ...taskProgress,
      satisfied: false,
      unresolved: [
        ...taskProgress.unresolved,
        { code: 'mutation-state-unknown', message: 'Read the current canvas before another write.' },
      ],
    },
  };
};

const toModelFacingWriteResult = (
  result: Record<string, unknown>,
  taskTarget: RuleEditorTaskTargetState,
) => {
  const completion = isCanvasCompletion(result.completion)
    ? result.completion
    : { mode: 'partial-draft' as const, satisfied: false, sourceCount: 0, terminalCount: 0 };
  const mutation = toModelFacingMutation(
    isCanvasMutation(result.mutation) ? result.mutation : undefined,
    Number.isSafeInteger(result.canvasRevision) && Number(result.canvasRevision) >= 0
      ? Number(result.canvasRevision)
      : 0,
  );
  const verification = isCanvasVerification(result.verification)
    ? toModelFacingVerification(
        result.verification,
        completion,
        isMutationVerificationStale(mutation, Number(result.canvasRevision) || 0),
      )
    : toModelFacingVerification(undefined, completion);
  const taskProgress = toModelFacingTaskProgress(
    isCanvasTaskProgress(result.taskProgress) ? result.taskProgress : undefined,
    verification,
    taskTarget,
    completion,
  );
  return {
    ...result,
    ok: true as const,
    success: true as const,
    mutation,
    verification,
    taskProgress,
    complete: taskProgress.satisfied,
    requestSatisfied: taskProgress.satisfied,
    resultStatus: taskProgress.satisfied ? 'applied' : 'partial',
  };
};

const withRuleEditorWriteEvidence = (
  result: Record<string, unknown>,
  taskTarget: RuleEditorTaskTargetState,
) => {
  const projected = toModelFacingWriteResult(result, taskTarget);
  const partial = !projected.taskProgress.satisfied;
  const mutation = isCanvasMutation(result.mutation) ? result.mutation : undefined;
  const canvasRevision = normalizeRuleEditorCanvasRevision(result.canvasRevision);
  const writtenNodeIds = [
    result.nodeId,
    ...(Array.isArray(result.nodeIds) ? result.nodeIds : []),
    ...(Array.isArray(result.changes)
      ? result.changes.map((change) => (isRecord(change) ? change.nodeId : undefined))
      : []),
  ].filter((nodeId): nodeId is string => (
    typeof nodeId === 'string'
    && nodeId.length > 0
    && nodeId.length <= 128
    && /^[A-Za-z0-9_.:-]+$/.test(nodeId)
  ));
  const instruction = typeof result.instruction === 'string' ? result.instruction
    : partial
      ? `${DEFAULT_USER_APPLY_SUMMARY}${summarizeIncompleteChecks(projected.taskProgress, projected.verification)}`
      : DEFAULT_USER_APPLY_SUMMARY;
  const wrapped = withAiClientToolEvidence(projected, {
      complete: projected.taskProgress.satisfied,
      requestSatisfied: projected.taskProgress.satisfied,
      truncated: false,
      resultStatus: projected.resultStatus,
      facts: {
        mutationStatus: projected.mutation.status,
        verification: projected.verification,
        taskProgress: projected.taskProgress,
        ...(canvasRevision !== undefined ? { canvasRevision } : {}),
        ...(mutation?.baseRevision !== undefined ? { baseRevision: mutation.baseRevision } : {}),
        ...(mutation?.appliedRevision !== undefined ? { appliedRevision: mutation.appliedRevision } : {}),
        ...(Array.isArray(result.changes) ? { writtenChangeCount: Math.min(result.changes.length, 64) } : {}),
        ...(writtenNodeIds.length ? { writtenNodeIds: [...new Set(writtenNodeIds)].slice(0, 16) } : {}),
      },
    });
  return partial
    ? {
        ...wrapped,
        partial: true,
        recoveryAction: 'repair' as const,
        instruction,
        evidence: Object.assign({}, wrapped.evidence, { instruction }),
      }
    : wrapped;
};

const toInvalidCanvasArgumentRepair = (field: string, actualValue: unknown) => ({
  field: `/${field}`,
  validationPath: `/${field}`,
  constraint: 'type',
  expectedType: field === 'steps' ? 'array' : 'object',
  actualType: Array.isArray(actualValue) ? 'array' : typeof actualValue,
  repairPaths: [`/${field}`],
  sameArgumentsAllowed: false,
});

const REMOTE_RECOVERY_ACTIONS = new Set(['retry', 'repair', 'clarify', 'terminal'] as const);
const UNKNOWN_NODE_CONFIG_ERROR = 'configuration contains unknown or unsupported fields';
const UNKNOWN_NODE_CONFIG_CODE = 'rule_editor.node_config.unknown_fields';
const UNKNOWN_NODE_CONFIG_INSTRUCTION = '这次编辑未写入。只提交节点 owner 已声明的可写配置字段。';
const TYPED_ADMISSION_STAGNATION = 'typed-admission-stagnation';
const UNKNOWN_CONFIG_MAX_ISSUES = 8;
const UNKNOWN_CONFIG_MAX_WRITABLE_KEYS = 16;

const isSafeJsonPointer = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length < 2 || value.length > 256 || !value.startsWith('/')) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character <= '\u001f' || character === '\u007f') return false;
    if (character === '~' && value[index + 1] !== '0' && value[index + 1] !== '1') return false;
  }
  return true;
};

const isSafeUnknownConfigIdentifier = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= 128
  && /^[A-Za-z0-9_.:-]+$/.test(value)
);

const toUnknownConfigFieldPath = (value: unknown) => (
  isSafeUnknownConfigIdentifier(value) ? `/config/${value}` : undefined
);

const toModelFacingUnknownConfigIssue = (
  value: unknown,
  defaults: { owner?: string; writableKeys: string[] },
) => {
  if (!isRecord(value) || !isSafeJsonPointer(value.path)) return undefined;
  const owner = isSafeUnknownConfigIdentifier(value.owner) ? value.owner : defaults.owner;
  const writableKeys = Array.isArray(value.writableKeys)
    ? value.writableKeys.filter(isSafeUnknownConfigIdentifier).slice(0, UNKNOWN_CONFIG_MAX_WRITABLE_KEYS)
    : defaults.writableKeys;
  return {
    path: value.path,
    code: 'unknown-config-field',
    message: 'configuration field is not declared writable by the node owner',
    ...(owner ? { owner } : {}),
    ...(writableKeys.length ? { writableKeys } : {}),
  };
};

const toBoundedUnknownConfigProjection = (value: Record<string, unknown>) => {
  const owner = isSafeUnknownConfigIdentifier(value.owner) ? value.owner : undefined;
  const writableKeys = Array.isArray(value.writableKeys)
    ? value.writableKeys.filter(isSafeUnknownConfigIdentifier).slice(0, UNKNOWN_CONFIG_MAX_WRITABLE_KEYS)
    : [];
  const unknownFields = Array.isArray(value.unknownFields)
    ? value.unknownFields.filter(isSafeUnknownConfigIdentifier).slice(0, UNKNOWN_CONFIG_MAX_ISSUES)
    : [];
  const issueDefaults = { owner, writableKeys };
  const issues = [
    ...(Array.isArray(value.issues)
      ? value.issues.map((issue) => (
          isRecord(issue) && issue.code === 'unknown-config-field'
            ? toModelFacingUnknownConfigIssue(issue, issueDefaults)
            : undefined
        ))
      : []),
    ...unknownFields.map((field) => toModelFacingUnknownConfigIssue({ path: toUnknownConfigFieldPath(field) }, issueDefaults)),
  ].filter((issue): issue is NonNullable<typeof issue> => issue !== undefined)
    .filter((issue, index, entries) => entries.findIndex((entry) => entry.path === issue.path) === index)
    .slice(0, UNKNOWN_CONFIG_MAX_ISSUES);
  const repairPaths = issues.map((issue) => issue.path);
  const canvasPlanIssue = repairPaths.some((path) => path.startsWith('/steps/'));
  return {
    ...(value.livenessSignal === TYPED_ADMISSION_STAGNATION
      ? { livenessSignal: TYPED_ADMISSION_STAGNATION }
      : {}),
    ...(owner ? { owner } : {}),
    ...(writableKeys.length ? { writableKeys } : {}),
    ...(unknownFields.length ? { unknownFields } : {}),
    ...(issues.length ? { issues } : {}),
    ...(repairPaths.length ? {
      repair: {
        field: repairPaths[0],
        repairPaths,
        preserveArguments: canvasPlanIssue ? ['flowMode', 'completion', 'steps'] : ['nodeId', 'config'],
        maxAttempts: 1,
      },
    } : {}),
  };
};

const toRemoteToolFailure = (
  code: string,
  message: string,
  recoveryAction: 'retry' | 'repair' | 'clarify' | 'terminal' = 'terminal',
  repair?: Record<string, unknown>,
  failureDisposition: 'request' | 'tool' | 'dependency' = 'tool',
) => ({
  ok: false as const,
  ...createAiClientToolFailureResult({
    code,
    message,
    failureDisposition,
    recoveryAction,
    retryable: recoveryAction === 'retry',
    ...(repair ? { repair } : {}),
  }),
});

const isCanonicalFailure = (value: Record<string, unknown>) => (
  typeof value.code === 'string'
  && Boolean(value.code)
  && typeof value.failureDisposition === 'string'
);

const isUnknownNodeConfigPreflight = (value: Record<string, unknown>) => {
  if (Array.isArray(value.unknownFields) && value.unknownFields.length > 0) return true;
  if (Array.isArray(value.issues) && value.issues.some((issue) => (
    isRecord(issue) && issue.code === 'unknown-config-field'
  ))) return true;
  const text = [
    typeof value.error === 'string' ? value.error : '',
    typeof value.message === 'string' ? value.message : '',
    typeof value.code === 'string' ? value.code : '',
  ].join('\n');
  return text.includes(UNKNOWN_NODE_CONFIG_ERROR) || text.includes(UNKNOWN_NODE_CONFIG_CODE);
};

const toRemoteFailureResult = (
  value: Record<string, unknown>,
  readRemote = false,
  taskTarget = createConfiguredRuleEditorTaskTarget(),
) => {
  if (isUnknownWriteMutation(value)) return toUnknownWriteFailure(value, taskTarget);
  if (!isUnknownNodeConfigPreflight(value) && isCanonicalFailure(value)) {
    if (!readRemote) return value;
    if (value.failureDisposition === 'request' || value.failureDisposition === 'dependency') {
      return value;
    }
  }
  const unknownConfigPreflight = isUnknownNodeConfigPreflight(value);
  if (unknownConfigPreflight) {
    const projection = toBoundedUnknownConfigProjection(value);
    const wrapped = toRemoteToolFailure(
      UNKNOWN_NODE_CONFIG_CODE,
      UNKNOWN_NODE_CONFIG_ERROR,
      'repair',
      projection.repair,
      'request',
    );
    return {
      ...wrapped,
      ...projection,
      error: UNKNOWN_NODE_CONFIG_ERROR,
      instruction: UNKNOWN_NODE_CONFIG_INSTRUCTION,
    };
  }
  if (readRemote) {
    const wrapped = toRemoteToolFailure(
      typeof value.code === 'string' && value.code
        ? value.code
        : 'rule_editor.remote.failed',
      typeof value.message === 'string' && value.message
        ? value.message
        : typeof value.error === 'string' && value.error
          ? value.error
          : 'rule editor tool failed',
      'repair',
      isRecord(value.repair) ? value.repair : undefined,
      'request',
    );
    return {
      ...wrapped,
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
      ...(typeof value.instruction === 'string' && value.instruction ? { instruction: value.instruction } : {}),
    };
  }
  const recoveryAction = typeof value.recoveryAction === 'string'
    && REMOTE_RECOVERY_ACTIONS.has(value.recoveryAction as 'retry')
    ? value.recoveryAction as 'retry' | 'repair' | 'clarify' | 'terminal'
    : 'terminal';
  return toRemoteToolFailure(
    typeof value.code === 'string' && value.code
      ? value.code
      : 'rule_editor.remote.failed',
    typeof value.message === 'string' && value.message
      ? value.message
      : typeof value.error === 'string' && value.error
        ? value.error
        : 'rule editor tool failed',
    recoveryAction,
    isRecord(value.repair) ? value.repair : undefined,
    'tool',
  );
};

const resolveRemoteCoverage = (
  result: Record<string, unknown>,
  contract: AiClientToolContractFragment,
) => {
  const hasUnprovenRecordWindow = contract._meta.clientToolContract.outputs.some((output) => (
    output.kind === 'record-set' && result.complete !== true && result.truncated !== false
  ));
  const truncated = result.truncated === true || hasUnprovenRecordWindow;
  return {
    truncated,
    complete: result.complete !== false && !truncated && !hasUnprovenRecordWindow,
  };
};

const collectRemoteOutputStates = (
  result: Record<string, unknown>,
  contract: AiClientToolContractFragment,
) => {
  const coverage = resolveRemoteCoverage(result, contract);
  return contract._meta.clientToolContract.outputs.flatMap((output) => (
    // Optional result branches must not create evidence for absent payloads.
    output.path && resolveAiClientToolBindingPath(result, output.path).resolved
      ? [{
          name: output.name,
          path: output.path,
          ...(output.mediaType ? { mediaType: output.mediaType } : {}),
          complete: coverage.complete,
          truncated: output.kind === 'record-set' ? coverage.truncated : result.truncated === true,
        }]
      : []
  ));
};

const withRemoteContractResult = (
  result: unknown,
  contract: AiClientToolContractFragment,
  readRemote = true,
) => {
  if (!isRecord(result)) {
    if (!readRemote) {
      return toRemoteToolFailure(
        'rule_editor.remote.invalid_result',
        'rule editor tool returned a non-canonical result',
      );
    }
    return toRemoteToolFailure(
      'rule_editor.remote.invalid_result',
      'rule editor tool returned a non-canonical result',
      'repair',
      undefined,
      'request',
    );
  }
  if (result.success === false || result.ok === false) {
    return toRemoteFailureResult(result, readRemote);
  }
  const coverage = resolveRemoteCoverage(result, contract);
  return withAiClientToolContractEvidence(result, contract, {
    complete: coverage.complete,
    truncated: coverage.truncated,
    outputs: collectRemoteOutputStates(result, contract),
  });
};

const normalizeToolInputs = (
  tool: RemoteRuleEditorToolDefinition,
  rootSchemaOwnsContract = false,
) => (
  Array.isArray(tool.inputs) ? tool.inputs : []
).map((input) => {
  const expands = isRecord(input.expands) ? { ...input.expands } : undefined;
  if (rootSchemaOwnsContract && expands) {
    // The bridge keeps per-input _schema for rolling upgrades. New sessions publish the canonical
    // function-level schema once, avoiding duplicate large unions in the model tool declaration.
    delete expands._schema;
  }
  return {
    ...input,
    ...(expands && Object.keys(expands).length ? { expands } : { expands: undefined }),
    id: String(input.id || input.name || ''),
    name: input.name || input.id,
    valueType: input.valueType || { type: 'string' },
  };
}).filter((input) => input.id);

export type RuleEditorToolUnavailableReason =
  | 'not-initialized' | 'reset' | 'frame-loaded' | 'iframe-disposed'
  | 'page-disposed' | 'component-unmounted' | 'invalid-handshake' | 'ready-timeout'
  | 'frame-missing' | 'origin-unavailable' | 'post-message-failed'
  | 'page-inactive' | 'providers-loading' | 'provider-load-failed' | 'tool-not-available';

export interface RuleEditorToolUnavailableDiagnostic {
  transport: 'iframe' | 'shared';
  reason: RuleEditorToolUnavailableReason;
  lifecycleReason?: RuleEditorToolUnavailableReason;
  status?: 'idle' | 'loading' | 'ready' | 'error';
  frameAvailable?: boolean;
  originAvailable?: boolean;
}

/** Local transport teardown carries its cause without exposing a payload or claiming zero writes. */
export class RuleEditorBridgeUnavailableError extends Error {
  constructor(
    message: string,
    readonly diagnostic: RuleEditorToolUnavailableDiagnostic,
    readonly externalExecutionStarted = false,
  ) {
    super(message);
    this.name = 'RuleEditorBridgeUnavailableError';
  }
}

/** An unavailable owner is terminal for this call; dispatched requests keep their effect unknown. */
export const createRuleEditorToolUnavailableResult = (
  t: (key: string, args?: unknown[]) => string,
  diagnostic: RuleEditorToolUnavailableDiagnostic,
  externalExecutionStarted = false,
) => {
  const effect = externalExecutionStarted ? 'unknown' as const : 'not-applied' as const;
  const effectState = externalExecutionStarted ? 'unknown' as const : 'not-started' as const;
  return {
    ok: false as const,
    ...createAiClientToolFailureResult({
      code: diagnostic.transport === 'shared' ? 'rule_editor.shared_tool.unavailable' : 'rule_editor.bridge.unavailable',
      message: t('RuleEditor.bridge.error.notReady'),
      failureDisposition: 'dependency',
      recoveryAction: 'terminal',
      retryable: false,
      details: { bridge: { ...diagnostic } },
    }),
    effect,
    effectState,
    externalExecutionStarted,
    resultStatus: externalExecutionStarted ? 'unknown' as const : 'blocked' as const,
    receipt: { effect, completion: 'blocked' as const, effectState, externalExecutionStarted },
  };
};

export const createEmptyRuleEditorToolRuntime = (
  t: (key: string, args?: unknown[]) => string,
): AiClientToolRuntime => ({
  clientTools: [],
  clientToolsVersion: 0,
  clientToolsName: t('RuleEditor.agent.toolsName'),
  clientToolsDescription: t('RuleEditor.agent.toolsDescription'),
  handleClientToolCall: async () => createRuleEditorToolUnavailableResult(t, {
    transport: 'iframe', reason: 'not-initialized', status: 'idle',
  }),
  getToolHelp: () => '',
  getAllToolHelp: () => '',
  refreshClientTools: () => undefined,
  subscribeClientTools: () => () => undefined,
  dispose: () => undefined,
});

export const toRuleEditorClientToolDefinition = (
  tool: RemoteRuleEditorToolDefinition,
  execute: (
    toolId: string,
    args: Record<string, any>,
    executionContext?: RuleEditorToolExecutionContext,
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => Promise<any>,
  sourceRevision = 'unversioned',
  getCanvasContext?: () => unknown,
  getTaskTargetState?: (executionContext?: RuleEditorToolExecutionContext) => RuleEditorTaskTargetState,
): AiClientToolDefinition<Record<string, any>> => {
  const isApplyCanvasTool = tool.id === APPLY_CANVAS_TOOL_ID;
  const remoteContract = resolveRuleEditorRemoteContract(tool.id);
  const remoteExpands = isRecord(tool.expands) ? { ...tool.expands } : {};
  if (tool.write === true) {
    // Non-read-only remotes must publish typed effect, or AgentConversation isolates them
    // from session.init.tools and FLAT business_execution returns model_unknown_tool.
    remoteExpands.effect = 'WRITE';
  }
  const rootSchemaOwnsContract = isRecord(remoteExpands._schema);
  const publishedExpands = Object.keys(remoteExpands).length ? remoteExpands : undefined;
  return {
    id: tool.id,
    name: resolveRuleEditorToolDisplayName(tool),
    progressText: resolveRuleEditorToolDisplayName(tool),
    description: isApplyCanvasTool ? applyCanvasDescription(tool.description) : tool.description,
    ...(remoteContract || {}),
    inputs: normalizeToolInputs(tool, rootSchemaOwnsContract),
    output: tool.output || { type: 'object' },
    ...(publishedExpands ? { expands: publishedExpands } : {}),
    annotations: {
      readOnlyHint: tool.write !== true,
      ...(tool.annotations || {}),
    },
    confirm: resolveRuleEditorConfirmOptions(tool),
    _meta: {
      ...(remoteContract?._meta || {}),
      clientToolAdapter: {
        version: RULE_EDITOR_REMOTE_ADAPTER_VERSION,
        source: 'rule-editor-iframe',
        sourceRevision: String(sourceRevision || 'unversioned'),
        resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
        contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
      },
    },
    execute: async (args, _context, call) => {
      try {
        let executeArgs = args;
        if (isApplyCanvasTool) {
          const coerced = coerceApplyCanvasPlanArguments(args);
          if (!coerced.ok) {
            const repair = toInvalidCanvasArgumentRepair(coerced.field, args[coerced.field]);
            const failure = toRemoteToolFailure(
              'rule_editor.canvas_plan.invalid_arguments',
              coerced.instruction || 'canvas plan arguments are invalid',
              'repair',
              repair,
              'request',
            );
            return {
              ...failure,
              ...repair,
              ...(coerced.instruction ? { instruction: coerced.instruction } : {}),
            };
          }
          executeArgs = coerced.args;
        }
        const result: unknown = await execute(
          tool.id,
          executeArgs,
          call?.executionContext,
          call?.reportProgress,
          call?.signal,
        );
        if (isApplyCanvasTool) {
          if (isRecord(result) && (result.success === false || result.ok === false)) {
            return toRemoteFailureResult(
              result,
              false,
              getTaskTargetState?.(call?.executionContext) || createConfiguredRuleEditorTaskTarget(),
            );
          }
          if (isCanvasApplySuccess(result)) {
            return withCanvasApplyEvidence(
              toModelFacingCanvasApplyResult(result, getTaskTargetState?.(call?.executionContext)),
              result,
            );
          }
          return toRemoteToolFailure(
            'rule_editor.canvas_plan.invalid_result',
            'canvas plan returned a non-canonical result',
          );
        }
        if (tool.write === true && isRecord(result)) {
          if (result.success === false || result.ok === false) {
            return toRemoteFailureResult(
              result,
              false,
              getTaskTargetState?.(call?.executionContext) || createConfiguredRuleEditorTaskTarget(),
            );
          }
          return withRuleEditorWriteEvidence(
            result,
            getTaskTargetState?.(call?.executionContext) || createConfiguredRuleEditorTaskTarget(),
          );
        }
        if (!remoteContract) {
          return result;
        }
        return withRemoteContractResult(result, remoteContract, tool.write !== true);
      } catch (error) {
        if (tool.write === true) {
          const executionContext: RuleEditorToolExecutionContext | undefined = call?.executionContext;
          const baseRevision = normalizeRuleEditorCanvasRevision(executionContext?.expectedRevision);
          return toCanvasApplyUnknownResult(
            getTaskTargetState?.(call?.executionContext) || createConfiguredRuleEditorTaskTarget(),
            {
              status: 'unknown',
              ...(call?.executionContext?.logicalToolCallId
                ? { requestId: createRuleEditorBridgeRequestId(call.executionContext.logicalToolCallId) }
                : {}),
              ...(baseRevision !== undefined ? { baseRevision } : {}),
            },
            isApplyCanvasTool ? 'rule_editor.canvas_apply.unknown' : 'rule_editor.canvas_write.unknown',
            error instanceof Error && error.message
              ? error.message
              : 'Canvas write did not confirm the mutation state.',
          );
        }
        return toRemoteToolFailure(
          'rule_editor.remote.failed',
          error instanceof Error && error.message
            ? error.message
            : 'rule editor tool failed',
          'repair',
          undefined,
          'request',
        );
      }
    },
  };
};

export {
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  APPLY_CANVAS_TOOL_ID,
  PREPARE_CANVAS_TOOL_ID,
  RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  RULE_EDITOR_RESOURCE_VERSION,
  RULE_EDITOR_TYPED_REMOTE_TOOL_IDS,
  TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  TOPOLOGY_DIAGRAM_OUTPUT_NAME,
  TOPOLOGY_DIAGRAM_SHAPE,
  orderRuleEditorRemoteTools,
} from './toolRuntimeContracts';
