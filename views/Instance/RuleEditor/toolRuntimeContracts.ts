import {
  defineAiClientToolContract,
  type AiClientToolContractFragment,
  type AiClientToolOutputContract,
  type AiClientToolRoutingKind,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';

export const APPLY_CANVAS_TOOL_ID = 'rule_editor_apply_canvas_actions';

// Kept for the optional explicit flowchart renderer. Default apply success must not
// produce this output: the canvas is the visualization, and a preferred card creates
// TERMINAL_EVIDENCE_PAUSED when the user did not ask for a chat flowchart.
export const TOPOLOGY_DIAGRAM_OUTPUT_NAME = 'topology-diagram';
export const TOPOLOGY_DIAGRAM_SHAPE = 'presentation.flowchart';
export const TOPOLOGY_DIAGRAM_MEDIA_TYPE = 'text/vnd.mermaid';

export const APPLY_CANVAS_PLAN_BINDING_GUIDE = [
  'One complete-topology apply with every connect.',
  'Write-plan outputBindings stay canvas-changes.',
  'Canvas is the topology; no flowchart card, canvas-actions-result, Mermaid/AnswerSpec, or fs:// handles.',
  'Prefer objects; JSON strings are parsed.',
].join(' ');

export const orderRuleEditorRemoteTools = <T extends { id?: string; agentVisible?: boolean }>(
  tools: readonly T[],
): T[] => [...tools.filter((tool) => Boolean(tool?.id) && tool.agentVisible !== false)].sort((left, right) => {
  const leftApply = left.id === APPLY_CANVAS_TOOL_ID;
  const rightApply = right.id === APPLY_CANVAS_TOOL_ID;
  if (leftApply === rightApply) return 0;
  return leftApply ? -1 : 1;
});

const modelJson = {
  type: 'structured-data' as const,
  mediaType: 'application/json',
  audience: 'model-evidence' as const,
  delivery: 'inline' as const,
};

const lookupOutput = (
  name: string,
  shape: string,
  path: string,
): AiClientToolOutputContract => ({
  kind: 'lookup',
  ...modelJson,
  name,
  shape,
  path,
});

const recordSetOutput = (
  name: string,
  shape: string,
  path: string,
): AiClientToolOutputContract => ({
  kind: 'record-set',
  ...modelJson,
  name,
  shape,
  path,
  recordPath: '$',
});

const remoteContract = (
  routingKind: AiClientToolRoutingKind,
  capability: string,
  outputs: readonly AiClientToolOutputContract[],
): AiClientToolContractFragment => defineAiClientToolContract({
  routingKind,
  routing: {
    capabilities: [capability],
    evidencePolicy: 'optional',
    validationHints: ['structured-output-exists'],
  },
  outputs,
});

export const APPLY_CANVAS_CONTRACT = defineAiClientToolContract({
  routingKind: 'action',
  routing: {
    capabilities: ['rule-editor.canvas.apply'],
    intents: ['apply-canvas-plan', 'bind plan output to canvas-changes'],
    evidencePolicy: 'required',
    validationHints: ['canvas-changes-exist', 'canvas-revision-advanced', 'topology-completion-satisfied'],
    cost: 'medium',
    // FLAT only exposes a deferred tool after a high-confidence route. Atomic canvas apply is the
    // editor's primary action, so it must remain directly available even when routing is inconclusive.
    exposure: 'auto',
    help: {
      quickstartSection: APPLY_CANVAS_PLAN_BINDING_GUIDE,
    },
  },
  outputs: [{
    kind: 'state-events',
    type: 'state',
    name: 'canvas-changes',
    shape: 'rule-editor.canvas-changes',
    path: '$.changes',
    mediaType: 'application/json',
    audience: 'model-evidence',
    delivery: 'inline',
  }],
});

export const RULE_EDITOR_TYPED_REMOTE_CONTRACTS: Record<string, AiClientToolContractFragment> = {
  rule_editor_get_context: remoteContract(
    'discovery',
    'rule-editor.canvas.context.read',
    [lookupOutput('canvas-context', 'rule-editor.canvas-context', '$.ruleId')],
  ),
  rule_editor_get_graph_summary: remoteContract(
    'discovery',
    'rule-editor.canvas.graph.read',
    [lookupOutput('graph-summary', 'rule-editor.graph-summary', '$.context')],
  ),
  rule_editor_list_nodes: remoteContract(
    'records',
    'rule-editor.canvas.nodes.list',
    [recordSetOutput('canvas-nodes', 'rule-editor.nodes', '$.nodes')],
  ),
  rule_editor_find_nodes: remoteContract(
    'records',
    'rule-editor.canvas.nodes.find',
    [recordSetOutput('canvas-nodes', 'rule-editor.nodes', '$.nodes')],
  ),
  rule_editor_get_node_detail: remoteContract(
    'detail',
    'rule-editor.node.detail.read',
    [lookupOutput('node-detail', 'rule-editor.node-detail', '$.node')],
  ),
  rule_editor_get_node_contract: remoteContract(
    'detail',
    'rule-editor.node.contract.read',
    [lookupOutput('node-contract', 'rule-editor.node-contract', '$.node')],
  ),
  rule_editor_get_tool_manual: remoteContract(
    'detail',
    'rule-editor.tool.manual.read',
    [lookupOutput('tool-manuals', 'rule-editor.tool-manuals', '$.manuals')],
  ),
  rule_editor_get_node_type_manual: remoteContract(
    'detail',
    'rule-editor.node-type.manual.read',
    [lookupOutput('node-type-manuals', 'rule-editor.node-type-manuals', '$.manuals')],
  ),
  rule_editor_search_node_types: remoteContract(
    'records',
    'rule-editor.node-type.search',
    [
      recordSetOutput('node-types', 'rule-editor.node-types', '$.nodeTypes'),
      recordSetOutput('compositions', 'rule-editor.compositions', '$.compositions'),
    ],
  ),
  rule_editor_get_node_type_detail: remoteContract(
    'detail',
    'rule-editor.node-type.detail.read',
    [lookupOutput('node-type-detail', 'rule-editor.node-type-detail', '$.type')],
  ),
  rule_editor_execute_node_tool: remoteContract(
    'detail',
    'rule-editor.node-tool.execute',
    [lookupOutput('node-tool-result', 'rule-editor.node-tool-result', '$.tool')],
  ),
  rule_editor_list_node_templates: remoteContract(
    'records',
    'rule-editor.node-template.list',
    [recordSetOutput('node-templates', 'rule-editor.node-templates', '$.templates')],
  ),
  rule_editor_focus_node: remoteContract(
    'navigation',
    'rule-editor.canvas.node.focus',
    [{
      kind: 'state-events',
      type: 'state',
      name: 'focused-node',
      shape: 'rule-editor.focused-node',
      path: '$.node',
      mediaType: 'application/json',
      audience: 'model-evidence',
      delivery: 'inline',
    }],
  ),
  rule_editor_get_debug_logs: remoteContract(
    'records',
    'rule-editor.debug.logs.read',
    [recordSetOutput('debug-logs', 'rule-editor.debug-logs', '$.logs')],
  ),
  rule_editor_validate_flow: remoteContract(
    'records',
    'rule-editor.canvas.validate',
    [recordSetOutput('flow-issues', 'rule-editor.flow-issues', '$.issues')],
  ),
};

export const RULE_EDITOR_TYPED_REMOTE_TOOL_IDS = Object.freeze([
  'rule_editor_get_context',
  'rule_editor_get_graph_summary',
  'rule_editor_list_nodes',
  'rule_editor_get_node_detail',
  'rule_editor_get_node_contract',
  'rule_editor_get_node_type_manual',
  'rule_editor_search_node_types',
  'rule_editor_get_node_type_detail',
  'rule_editor_execute_node_tool',
  'rule_editor_validate_flow',
]);

export const resolveRuleEditorRemoteContract = (toolId: string) => (
  toolId === APPLY_CANVAS_TOOL_ID
    ? APPLY_CANVAS_CONTRACT
    : RULE_EDITOR_TYPED_REMOTE_CONTRACTS[toolId]
);
