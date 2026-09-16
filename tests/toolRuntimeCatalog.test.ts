import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_CLIENT_TOOL_ROUTING_EXPAND_KEY,
  createAiClientToolCatalogReport,
  normalizeAiClientToolRoutingMetadata,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  APPLY_CANVAS_TOOL_ID,
  RULE_EDITOR_TYPED_REMOTE_TOOL_IDS,
  orderRuleEditorRemoteTools,
  toRuleEditorClientToolDefinition,
  type RemoteRuleEditorToolDefinition,
} from '../views/Instance/RuleEditor/toolRuntime';

const applyTool = (): RemoteRuleEditorToolDefinition => ({
  id: 'rule_editor_apply_canvas_actions',
  name: 'apply canvas',
  write: true,
  expands: {
    _schema: {
      type: 'object',
      additionalProperties: false,
      required: ['flowMode', 'completion', 'steps'],
      properties: {
        flowMode: { type: 'string' },
        completion: { type: 'object' },
        steps: { type: 'array' },
      },
    },
  },
  inputs: [],
});

const remoteTool = (
  id: string,
  write = false,
): RemoteRuleEditorToolDefinition => ({
  id,
  name: id,
  write,
});

const catalogize = (definition: ReturnType<typeof toRuleEditorClientToolDefinition>) => {
  const routing = normalizeAiClientToolRoutingMetadata(definition);
  return {
    id: definition.id,
    expands: {
      ...(definition.expands || {}),
      ...(routing ? { [AI_CLIENT_TOOL_ROUTING_EXPAND_KEY]: routing } : {}),
    },
    _meta: definition._meta,
  };
};

const reportFor = (
  tools: RemoteRuleEditorToolDefinition[],
) => createAiClientToolCatalogReport(
  tools.map((tool) => catalogize(toRuleEditorClientToolDefinition(tool, async () => ({})))),
  {
    requireRouting: false,
    requireResultBindings: true,
  },
);

test('apply tool stays typed after the real core runtime projects routing into expands', () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({}));
  const routing = normalizeAiClientToolRoutingMetadata(definition);
  assert.ok(routing, 'the producer-owned routing contract must survive core validation');
  assert.equal(routing.exposure, 'auto', 'FLAT must expose the editor primary action without route preselection');
  assert.equal(routing.accepts, undefined);
  assert.deepEqual(routing.intents, ['apply-canvas-plan', 'bind plan output to canvas-changes']);
  assert.equal(routing.help?.quickstartSection, APPLY_CANVAS_PLAN_BINDING_GUIDE);
  assert.deepEqual(routing.produces, ['canvas-changes', 'topology-diagram']);
  assert.deepEqual(routing.resultDeliveries, ['inline']);

  const report = reportFor([applyTool()]);
  const tool = report.tools[0];
  assert.equal(report.valid, true);
  assert.equal(tool?.routingStatus, 'valid');
  assert.equal(tool?.contractStatus, 'typed');
  assert.equal(report.summary.malformedContract, 0);
  assert.equal(report.issues.some(issue => issue.code === 'result_binding_unexpected'), false);
  assert.equal(report.issues.some(issue => /artifact|audience|delivery/i.test(`${issue.code} ${issue.message}`)), false);
  assert.ok(tool?.outputKinds.includes('lookup'));
  assert.equal(tool?.outputKinds.includes('artifact'), false);
});

test('agent-visible read remotes compile as typed without requiring catalog-wide routing', () => {
  assert.deepEqual([...RULE_EDITOR_TYPED_REMOTE_TOOL_IDS], [
    'rule_editor_get_context',
    'rule_editor_get_graph_summary',
    'rule_editor_list_nodes',
    'rule_editor_find_nodes',
    'rule_editor_get_node_detail',
    'rule_editor_get_node_contract',
    'rule_editor_get_tool_manual',
    'rule_editor_get_node_type_manual',
    'rule_editor_search_node_types',
    'rule_editor_get_node_type_detail',
    'rule_editor_execute_node_tool',
    'rule_editor_list_node_templates',
    'rule_editor_focus_node',
    'rule_editor_get_debug_logs',
    'rule_editor_validate_flow',
  ]);

  const report = reportFor(RULE_EDITOR_TYPED_REMOTE_TOOL_IDS.map((id) => remoteTool(id)));
  assert.equal(report.valid, true);
  assert.equal(report.summary.malformedContract, 0);
  assert.equal(report.summary.typed, RULE_EDITOR_TYPED_REMOTE_TOOL_IDS.length);
  RULE_EDITOR_TYPED_REMOTE_TOOL_IDS.forEach((id) => {
    const tool = report.tools.find((item) => item.toolId === id);
    assert.equal(tool?.contractStatus, 'typed', id);
    assert.equal(tool?.routingStatus, 'valid', id);
  });
});

test('mixed read remotes keep apply first with canvas-changes after compile and catalogize', () => {
  const tools = orderRuleEditorRemoteTools([
    remoteTool('rule_editor_get_context'),
    remoteTool('rule_editor_list_nodes'),
    applyTool(),
    remoteTool('rule_editor_get_graph_summary'),
    remoteTool('rule_editor_validate_flow'),
  ]);

  assert.equal(tools[0]?.id, APPLY_CANVAS_TOOL_ID);
  assert.deepEqual(tools.slice(1).map((tool) => tool.id), [
    'rule_editor_get_context',
    'rule_editor_list_nodes',
    'rule_editor_get_graph_summary',
    'rule_editor_validate_flow',
  ]);

  const compiled = tools.map((tool) => toRuleEditorClientToolDefinition(tool, async () => ({})));
  assert.equal(compiled[0]?.id, APPLY_CANVAS_TOOL_ID);
  assert.equal(compiled[0]?.routing?.exposure, 'auto');
  assert.ok(compiled[0]?.routing?.produces?.includes('canvas-changes'));
  assert.equal(compiled[0]?.routing?.produces?.includes('canvas-actions-result'), false);
  assert.equal(compiled[0]?.routing?.help?.quickstartSection, APPLY_CANVAS_PLAN_BINDING_GUIDE);

  const report = reportFor(tools);
  assert.equal(report.valid, true);
  assert.equal(report.tools[0]?.toolId, APPLY_CANVAS_TOOL_ID);
  assert.equal(report.tools[0]?.contractStatus, 'typed');
  assert.equal(report.tools[0]?.routingStatus, 'valid');
  assert.equal(report.summary.typed, 5);
  assert.equal(report.summary.malformedContract, 0);
});

test('mixed remotes keep apply first even when hidden writes stay in the iframe list', () => {
  const tools = orderRuleEditorRemoteTools([
    remoteTool('rule_editor_insert_node', true),
    remoteTool('rule_editor_get_context'),
    applyTool(),
    remoteTool('rule_editor_edit_node', true),
    remoteTool('rule_editor_validate_flow'),
  ]);

  assert.deepEqual(tools.map((tool) => tool.id), [
    APPLY_CANVAS_TOOL_ID,
    'rule_editor_insert_node',
    'rule_editor_get_context',
    'rule_editor_edit_node',
    'rule_editor_validate_flow',
  ]);

  const compiled = tools.map((tool) => toRuleEditorClientToolDefinition(tool, async () => ({})));
  assert.equal(compiled[0]?.routing?.exposure, 'auto');
  assert.ok(compiled[0]?.routing?.produces?.includes('canvas-changes'));
  assert.equal(compiled[1]?.routing, undefined);
  assert.equal(compiled[3]?.routing, undefined);

  const report = reportFor(tools);
  assert.equal(report.tools[0]?.toolId, APPLY_CANVAS_TOOL_ID);
  assert.equal(report.tools[0]?.contractStatus, 'typed');
  assert.equal(report.tools.find((tool) => tool.toolId === 'rule_editor_insert_node')?.contractStatus, 'legacy');
  assert.equal(report.summary.typed, 3);
});

test('hidden write and proposal tools remain legacy when requireRouting stays off', () => {
  const report = reportFor([
    remoteTool('rule_editor_insert_node', true),
    remoteTool('rule_editor_edit_node', true),
    remoteTool('rule_editor_delete_node', true),
    remoteTool('rule_editor_connect_nodes', true),
    remoteTool('rule_editor_layout_nodes', true),
    remoteTool('rule_editor_propose_canvas_actions', true),
  ]);

  assert.equal(report.valid, true);
  assert.equal(report.summary.typed, 0);
  report.tools.forEach((tool) => {
    assert.equal(tool.contractStatus, 'legacy', tool.toolId);
  });
});
