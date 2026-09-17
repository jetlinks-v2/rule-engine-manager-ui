import {
  createAiClientToolFailureResult,
  type AiClientToolContractFragment,
  type AiClientToolDefinition,
  type AiClientToolExecutionContext,
  type AiClientToolRuntime,
  withAiClientToolContractEvidence,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  resolveRuleEditorConfirmOptions,
  resolveRuleEditorToolDisplayName,
  type RuleEditorRemoteToolDefinition,
} from './confirmOptions';
import {
  APPLY_CANVAS_CONTRACT,
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  APPLY_CANVAS_TOOL_ID,
  TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  TOPOLOGY_DIAGRAM_OUTPUT_NAME,
  resolveRuleEditorRemoteContract,
} from './toolRuntimeContracts';

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

export type RuleEditorToolExecutionContext = AiClientToolExecutionContext;

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
}

const CANVAS_CHANGE_IDENTITY_KEYS = [
  'nodeId',
  'nodeType',
  'sourceId',
  'targetId',
  'sourcePort',
  'count',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const APPLY_CANVAS_JSON_FIELDS = ['steps', 'completion'] as const;
const APPLY_CANVAS_ENVELOPE_KEYS = [
  'actions',
  'allowMultiple',
  'action',
  'label',
  'title',
  'description',
  'summary',
  'ttlSeconds',
  'plan',
] as const;

const isApplyCanvasJsonValue = (
  field: typeof APPLY_CANVAS_JSON_FIELDS[number],
  value: unknown,
) => (field === 'steps' ? Array.isArray(value) : isRecord(value));

const describeApplyCanvasJsonFieldFailure = (field: string): string => (
  field === 'steps'
    ? 'steps must be a structured array, not an unparsable JSON string. The next call must pass a JSON array of operation objects, not a string wrapper.'
    : `${field} must be a structured object, not an unparsable JSON string. The next call must pass a JSON object, not a string wrapper.`
);

// Repair only unescaped controls inside JSON string literals. Do not invent brackets.
// Keep in sync with iframe parseJsonStructured / escapeUnescapedJsonStringControlChars.
const escapeUnescapedJsonStringControlChars = (text: string): string => {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (!inString) {
      if (character === '"') inString = true;
      result += character;
      continue;
    }
    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      result += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      result += character;
      inString = false;
      continue;
    }
    if (character === '\n') {
      result += '\\n';
      continue;
    }
    if (character === '\r') {
      result += '\\r';
      continue;
    }
    if (character === '\t') {
      result += '\\t';
      continue;
    }
    result += character;
  }
  return result;
};

const parseJsonValue = (value: string): unknown | undefined => {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(escapeUnescapedJsonStringControlChars(value));
    } catch {
      return undefined;
    }
  }
};

const parseApplyCanvasJsonField = (
  field: typeof APPLY_CANVAS_JSON_FIELDS[number],
  value: string,
): unknown | undefined => {
  const parsed = parseJsonValue(value);
  return parsed !== undefined && isApplyCanvasJsonValue(field, parsed) ? parsed : undefined;
};

const isCompletionModeString = (value: string): value is RuleEditorCompletionMode => (
  RULE_EDITOR_COMPLETION_MODES.some((mode) => mode === value.trim())
);

const readApplyPlanSource = (value: unknown): Record<string, any> | undefined => {
  if (!isRecord(value)) return undefined;
  return isRecord(value.plan) && !Array.isArray(value.plan)
    ? value.plan as Record<string, any>
    : value as Record<string, any>;
};

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
): { ok: true; args: Record<string, any> } | { ok: false; field: string } => {
  const needsUnwrap = (args.flowMode == null || args.steps == null)
    && (args.actions != null || args.action != null);
  const hasStringField = APPLY_CANVAS_JSON_FIELDS.some((field) => typeof args[field] === 'string')
    || typeof args.actions === 'string';
  const hasEnvelope = APPLY_CANVAS_ENVELOPE_KEYS.some((key) => key in args);
  const hasStringNodeRef = Array.isArray(args.steps) && args.steps.some(stepHasStringNodeRef);
  const hasStringCompletionRef = completionHasStringNodeRef(args.completion);
  if (!needsUnwrap && !hasStringField && !hasEnvelope && !hasStringNodeRef && !hasStringCompletionRef) {
    return { ok: true, args };
  }

  const next: Record<string, any> = { ...args };
  if (next.flowMode == null || next.steps == null) {
    let actionsValue = next.actions ?? next.action;
    if (typeof actionsValue === 'string') {
      const parsed = parseJsonValue(actionsValue);
      if (parsed === undefined) return { ok: false, field: 'actions' };
      actionsValue = parsed;
    }
    const action = Array.isArray(actionsValue) ? actionsValue[0] : actionsValue;
    const source = readApplyPlanSource(action);
    if (source) {
      if (next.flowMode == null && source.flowMode != null) next.flowMode = source.flowMode;
      if (next.completion == null && source.completion != null) next.completion = source.completion;
      if (next.steps == null && source.steps != null) next.steps = source.steps;
      if (next.rollbackOnValidationError == null && source.rollbackOnValidationError != null) {
        next.rollbackOnValidationError = source.rollbackOnValidationError;
      }
    }
  }

  for (const field of APPLY_CANVAS_JSON_FIELDS) {
    const value = next[field];
    if (typeof value !== 'string') continue;
    if (field === 'completion' && isCompletionModeString(value)) {
      next[field] = { mode: value.trim() };
      continue;
    }
    const parsed = parseApplyCanvasJsonField(field, value);
    if (parsed === undefined) {
      return { ok: false, field };
    }
    next[field] = parsed;
  }

  for (const key of APPLY_CANVAS_ENVELOPE_KEYS) {
    delete next[key];
  }
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

// The diagram is presentation of this exact verified snapshot, never a second model-authored graph.
const toVerifiedTopologyMermaid = (topology: RuleEditorTopologySnapshot) => [
  'flowchart LR',
  ...topology.nodes.map(node => `  ${node.key}["${node.label}"]`),
  ...topology.links.map(link => `  ${link.source} --> ${link.target}`),
].join('\n');

// Iframe executor stays topology-only. Parent synthesizes mermaid from that snapshot so the
// declared topology-diagram binding exists for terminal evidence. Never overwrite iframe mermaid.
const attachVerifiedTopologyPresentation = (value: unknown): unknown => {
  if (!isRecord(value) || value.presentation !== undefined) {
    return value;
  }
  const topology = value.topology;
  const completion = value.completion;
  if (!canPublishTopologyDiagram(topology)
    || !isRecord(completion)
    || completion.mode !== 'complete-topology'
    || completion.satisfied !== true) {
    return value;
  }
  const mermaid = toVerifiedTopologyMermaid(topology);
  if (!isPublishableTopologyMermaid(mermaid)) {
    return value;
  }
  return {
    ...value,
    presentation: {
      mermaid,
    },
  };
};

const hasValidTopologyPresentation = (value: Record<string, unknown>) => {
  const topology = value.topology;
  const presentation = value.presentation;
  if (topology !== undefined && !isTopologySnapshot(topology)) return false;
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
  return value.ok === true
    && value.success === true
    && value.contract === 'rule-editor.canvas-apply-result/v1'
    && isRuleEditorFlowMode(value.flowMode)
    && isCanvasCompletion(value.completion)
    && Array.isArray(value.changes) && value.changes.every(isCanvasChange)
    && hasValidTopologyPresentation(value)
    && (value.topology === undefined
      || (value.topology.nodes.filter(node => node.source).length === value.completion.sourceCount
        && value.topology.nodes.filter(node => node.terminal).length === value.completion.terminalCount))
    && (value.completion.mode !== 'partial-draft'
      || (value.topology === undefined && value.presentation === undefined))
    && typeof value.canvasRevision === 'number'
    && Number.isSafeInteger(value.canvasRevision) && value.canvasRevision >= 0
    && value.rolledBack === false;
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

const toModelFacingTopology = (
  topology: RuleEditorTopologySnapshot,
): RuleEditorTopologySnapshot => ({
  contract: 'rule-editor.topology-snapshot/v1',
  complete: true,
  truncated: topology.truncated,
  nodeCount: topology.nodeCount,
  linkCount: topology.linkCount,
  nodes: topology.nodes.map(node => ({
    key: node.key,
    label: node.label,
    type: node.type,
    source: node.source,
    terminal: node.terminal,
  })),
  links: topology.links.map(link => ({
    source: link.source,
    target: link.target,
    sourcePort: link.sourcePort,
  })),
});

const toModelFacingValidationIssue = (issue: unknown) => {
  if (!isRecord(issue)) return issue;
  const projected: Record<string, unknown> = {};
  if (typeof issue.path === 'string') projected.path = issue.path;
  if (typeof issue.code === 'string') projected.code = issue.code;
  if (typeof issue.message === 'string') projected.message = issue.message;
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

// Compact model-facing success: keep write evidence, drop executor dumps that poison COMPOSITE.
const toModelFacingCanvasApplyResult = (
  result: RuleEditorCanvasApplyResult,
): RuleEditorCanvasApplyResult => {
  const projected: RuleEditorCanvasApplyResult = {
    ok: true,
    success: true,
    contract: result.contract,
    flowMode: result.flowMode,
    completion: toModelFacingCompletion(result.completion),
    changes: result.changes.map(toModelFacingCanvasChange),
    canvasRevision: result.canvasRevision,
    rolledBack: false,
  };
  if (typeof result.complete === 'boolean') projected.complete = result.complete;
  if (typeof result.resultStatus === 'string' && result.resultStatus) {
    projected.resultStatus = result.resultStatus;
  }
  if (result.topology !== undefined) projected.topology = toModelFacingTopology(result.topology);
  if (result.presentation !== undefined) {
    projected.presentation = { mermaid: result.presentation.mermaid };
  }
  const validation = toModelFacingValidation(result.validation);
  if (validation) projected.validation = validation;
  if (typeof result.instruction === 'string' && result.instruction) {
    projected.instruction = result.instruction;
  }
  return projected;
};

const withCanvasApplyEvidence = (result: RuleEditorCanvasApplyResult) => (
  withAiClientToolContractEvidence(result, APPLY_CANVAS_CONTRACT, {
    complete: result.completion.satisfied,
    truncated: false,
    resultStatus: result.completion.satisfied ? 'applied' : 'partial',
    facts: {
      flowMode: result.flowMode,
      completionMode: result.completion.mode,
      topologySatisfied: result.completion.satisfied,
      sourceCount: result.completion.sourceCount,
      terminalCount: result.completion.terminalCount,
      canvasRevision: result.canvasRevision,
      rolledBack: result.rolledBack,
      validationIssueCount: result.validation?.issueCount,
      topologyNodeCount: result.topology?.nodeCount,
      topologyLinkCount: result.topology?.linkCount,
      topologyDiagramAvailable: Boolean(result.presentation?.mermaid),
    },
    outputs: [
      {
        name: 'canvas-changes',
        path: '$.changes',
        recordCount: result.changes.length,
        complete: true,
        truncated: false,
      },
      ...(result.presentation?.mermaid ? [{
        name: TOPOLOGY_DIAGRAM_OUTPUT_NAME,
        path: '$.presentation.mermaid',
        mediaType: TOPOLOGY_DIAGRAM_MEDIA_TYPE,
        recordCount: 1,
        complete: true,
        truncated: false,
      }] : []),
    ],
  })
);

const REMOTE_RECOVERY_ACTIONS = new Set(['retry', 'repair', 'clarify', 'terminal'] as const);

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

const toRemoteFailureResult = (value: Record<string, unknown>) => {
  if (isCanonicalFailure(value)) return value;
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
    complete: result.complete === true ? !truncated : !truncated && !hasUnprovenRecordWindow,
  };
};

const collectRemoteOutputStates = (
  result: Record<string, unknown>,
  contract: AiClientToolContractFragment,
) => {
  const coverage = resolveRemoteCoverage(result, contract);
  return contract._meta.clientToolContract.outputs.flatMap((output) => (
    output.path
      ? [{
          name: output.name,
          path: output.path,
          ...(output.mediaType ? { mediaType: output.mediaType } : {}),
          complete: output.kind === 'record-set' ? coverage.complete : !coverage.truncated,
          truncated: output.kind === 'record-set' ? coverage.truncated : result.truncated === true,
        }]
      : []
  ));
};

const withRemoteContractResult = (
  result: unknown,
  contract: AiClientToolContractFragment,
) => {
  if (!isRecord(result)) {
    return toRemoteToolFailure(
      'rule_editor.remote.invalid_result',
      'rule editor tool returned a non-canonical result',
    );
  }
  if (result.success === false || result.ok === false) {
    return toRemoteFailureResult(result);
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

export const createEmptyRuleEditorToolRuntime = (
  t: (key: string, args?: unknown[]) => string,
): AiClientToolRuntime => ({
  clientTools: [],
  clientToolsVersion: 0,
  clientToolsName: t('RuleEditor.agent.toolsName'),
  clientToolsDescription: t('RuleEditor.agent.toolsDescription'),
  handleClientToolCall: async () => {
    throw new Error(t('RuleEditor.bridge.error.notReady'));
  },
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
  ) => Promise<any>,
  sourceRevision = 'unversioned',
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
      },
    },
    execute: async (args, _context, call) => {
      try {
        let executeArgs = args;
        if (isApplyCanvasTool) {
          const coerced = coerceApplyCanvasPlanArguments(args);
          if (!coerced.ok) {
            return toRemoteToolFailure(
              'rule_editor.canvas_plan.invalid_arguments',
              describeApplyCanvasJsonFieldFailure(coerced.field),
              'repair',
              { field: `/${coerced.field}` },
              'request',
            );
          }
          executeArgs = coerced.args;
        }
        const result: unknown = await execute(
          tool.id,
          executeArgs,
          call?.executionContext,
        );
        if (isApplyCanvasTool) {
          if (isRecord(result) && (result.success === false || result.ok === false)) {
            return toRemoteFailureResult(result);
          }
          const withPresentation = attachVerifiedTopologyPresentation(result);
          if (isCanvasApplySuccess(withPresentation)) {
            return withCanvasApplyEvidence(toModelFacingCanvasApplyResult(withPresentation));
          }
          return toRemoteToolFailure(
            'rule_editor.canvas_plan.invalid_result',
            'canvas plan returned a non-canonical result',
          );
        }
        if (!remoteContract) {
          return result;
        }
        return withRemoteContractResult(result, remoteContract);
      } catch (error) {
        if (!remoteContract && !isApplyCanvasTool) throw error;
        return toRemoteToolFailure(
          'rule_editor.remote.failed',
          error instanceof Error && error.message
            ? error.message
            : 'rule editor tool failed',
        );
      }
    },
  };
};

export {
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  APPLY_CANVAS_TOOL_ID,
  RULE_EDITOR_TYPED_REMOTE_TOOL_IDS,
  TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  TOPOLOGY_DIAGRAM_OUTPUT_NAME,
  TOPOLOGY_DIAGRAM_SHAPE,
  orderRuleEditorRemoteTools,
} from './toolRuntimeContracts';
