import {
  createAiClientToolFailureResult,
  defineAiClientToolContract,
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

export interface RemoteRuleEditorToolDefinition extends RuleEditorRemoteToolDefinition {
  id: string;
  name?: string;
  description?: string;
  inputs?: Array<Record<string, any>>;
  output?: Record<string, any>;
  expands?: Record<string, any>;
  annotations?: Record<string, any>;
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
  changes: RuleEditorCanvasChange[];
  topology?: RuleEditorTopologySnapshot;
  presentation?: {
    mermaid: string;
  };
  canvasRevision: number;
  rolledBack: false;
  validation?: {
    issueCount?: number;
    [key: string]: unknown;
  };
}

const APPLY_CANVAS_TOOL_ID = 'rule_editor_apply_canvas_actions';

const APPLY_CANVAS_CONTRACT = defineAiClientToolContract({
  routingKind: 'action',
  routing: {
    capabilities: ['rule-editor.canvas.apply'],
    accepts: ['rule-editor.canvas-plan'],
    intents: ['apply-canvas-plan'],
    evidencePolicy: 'required',
    validationHints: ['canvas-changes-exist', 'canvas-revision-advanced', 'topology-completion-satisfied'],
    cost: 'medium',
    exposure: 'deferred',
  },
  outputs: [{
    kind: 'state-events',
    name: 'canvas-changes',
    shape: 'rule-editor.canvas-change[]',
    path: '$.changes',
  }, {
    kind: 'artifact',
    name: 'topology-diagram',
    shape: 'diagram.flowchart',
    path: '$.presentation.mermaid',
    mediaType: 'application/vnd.mermaid',
    delivery: 'inline',
  }],
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

// The diagram is presentation of this exact verified snapshot, never a second model-authored graph.
const toVerifiedTopologyMermaid = (topology: RuleEditorTopologySnapshot) => [
  'flowchart LR',
  ...topology.nodes.map(node => `  ${node.key}["${node.label}"]`),
  ...topology.links.map(link => `  ${link.source} --> ${link.target}`),
].join('\n');

const hasValidTopologyPresentation = (value: Record<string, unknown>) => {
  const topology = value.topology;
  const presentation = value.presentation;
  if (topology !== undefined && !isTopologySnapshot(topology)) return false;
  if (presentation === undefined) return true;
  if (!isRecord(presentation)
    || typeof presentation.mermaid !== 'string'
    || !presentation.mermaid.trim()
    || presentation.mermaid.length > 16 * 1024
    || !isTopologySnapshot(topology)
    || topology.truncated
    || topology.nodeCount < 2
    || topology.linkCount < 1) {
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
        name: 'topology-diagram',
        path: '$.presentation.mermaid',
        mediaType: 'application/vnd.mermaid',
        recordCount: 1,
        complete: true,
        truncated: false,
      }] : []),
    ],
  })
);

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
  const remoteExpands = isRecord(tool.expands) ? tool.expands : undefined;
  const rootSchemaOwnsContract = isRecord(remoteExpands?._schema);
  return {
    id: tool.id,
    name: resolveRuleEditorToolDisplayName(tool),
    description: tool.description,
    ...(isApplyCanvasTool ? APPLY_CANVAS_CONTRACT : {}),
    inputs: normalizeToolInputs(tool, rootSchemaOwnsContract),
    output: tool.output || { type: 'object' },
    ...(remoteExpands ? { expands: remoteExpands } : {}),
    annotations: {
      readOnlyHint: tool.write !== true,
      ...(tool.annotations || {}),
    },
    confirm: resolveRuleEditorConfirmOptions(tool),
    _meta: {
      ...(isApplyCanvasTool ? APPLY_CANVAS_CONTRACT._meta : {}),
      clientToolAdapter: {
        version: RULE_EDITOR_REMOTE_ADAPTER_VERSION,
        source: 'rule-editor-iframe',
        sourceRevision: String(sourceRevision || 'unversioned'),
      },
    },
    execute: async (args, _context, call) => {
      const result: unknown = await execute(
        tool.id,
        args,
        call?.executionContext,
      );
      if (!isApplyCanvasTool || (isRecord(result) && (result.success === false || result.ok === false))) {
        return result;
      }
      if (isCanvasApplySuccess(result)) {
        return withCanvasApplyEvidence(result);
      }
      return {
        ok: false,
        ...createAiClientToolFailureResult({
          code: 'rule_editor.canvas_plan.invalid_result',
          message: 'canvas plan returned a non-canonical result',
          failureDisposition: 'tool',
          recoveryAction: 'terminal',
          retryable: false,
        }),
      };
    },
  };
};
