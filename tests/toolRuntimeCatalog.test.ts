import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_CLIENT_TOOL_ROUTING_EXPAND_KEY,
  createAiClientToolCatalogReport,
  createAiClientToolCatalogSnapshot,
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
import { resolveRuleEditorRemoteContract } from '../views/Instance/RuleEditor/toolRuntimeContracts';

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
  assert.deepEqual(routing.produces, ['canvas-changes']);
  assert.deepEqual(routing.outputShapes, ['rule-editor.canvas-changes']);
  assert.equal(definition._meta?.clientToolContract.outputs.length, 1);
  assert.equal(definition._meta?.clientToolContract.outputs[0].name, 'canvas-changes');
  assert.equal(routing.producerPorts?.length, 1);
  assert.deepEqual(routing.resultDeliveries, ['inline']);
  assert.equal(APPLY_CANVAS_PLAN_BINDING_GUIDE.includes('outputBindings must be canvas-changes.'), false);
  assert.match(APPLY_CANVAS_PLAN_BINDING_GUIDE, /Write-plan outputBindings stay canvas-changes/);
  assert.equal(APPLY_CANVAS_PLAN_BINDING_GUIDE.includes('topology-diagram'), false);
  assert.match(APPLY_CANVAS_PLAN_BINDING_GUIDE, /Canvas is the topology/);
  assert.match(APPLY_CANVAS_PLAN_BINDING_GUIDE, /JSON strings are parsed/);
  assert.equal(APPLY_CANVAS_PLAN_BINDING_GUIDE.includes('canvas-actions-result'), true);
  assert.ok(APPLY_CANVAS_PLAN_BINDING_GUIDE.length <= 240, APPLY_CANVAS_PLAN_BINDING_GUIDE.length);

  const report = reportFor([applyTool()]);
  const tool = report.tools[0];
  assert.equal(report.valid, true);
  assert.equal(tool?.routingStatus, 'valid');
  assert.equal(tool?.contractStatus, 'typed');
  assert.equal(report.summary.malformedContract, 0);
  assert.equal(report.issues.some(issue => issue.code === 'result_binding_unexpected'), false);
  assert.equal(report.issues.some(issue => /artifact|audience|delivery/i.test(`${issue.code} ${issue.message}`)), false);
  assert.ok(tool?.outputKinds.includes('state-events'));
  assert.equal(tool?.outputKinds.includes('lookup'), false);
  assert.equal(tool?.outputKinds.includes('artifact'), false);
});

test('agent-visible read remotes compile as typed without requiring catalog-wide routing', () => {
  assert.deepEqual([...RULE_EDITOR_TYPED_REMOTE_TOOL_IDS], [
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

test('hidden read remotes still compile typed from leftover adapter contracts', () => {
  const leftoverIds = [
    'rule_editor_get_tool_manual',
    'rule_editor_list_node_templates',
    'rule_editor_focus_node',
    'rule_editor_get_debug_logs',
    'rule_editor_find_nodes',
  ];
  leftoverIds.forEach((id) => {
    assert.equal((RULE_EDITOR_TYPED_REMOTE_TOOL_IDS as readonly string[]).includes(id), false, id);
  });
  const report = reportFor(leftoverIds.map((id) => remoteTool(id)));
  assert.equal(report.valid, true);
  assert.equal(report.summary.typed, leftoverIds.length);
  leftoverIds.forEach((id) => {
    assert.equal(report.tools.find((tool) => tool.toolId === id)?.contractStatus, 'typed', id);
  });
});

test('parent catalog drops remotes with agentVisible false and keeps apply first', () => {
  const tools = orderRuleEditorRemoteTools([
    { id: 'rule_editor_get_tool_manual', agentVisible: false },
    { id: 'rule_editor_connect_nodes_batch', write: true, agentVisible: false },
    { id: 'rule_editor_layout_nodes', write: true, agentVisible: false },
    { id: 'rule_editor_propose_canvas_actions', write: true, agentVisible: false },
    applyTool(),
    remoteTool('rule_editor_get_context'),
    remoteTool('rule_editor_edit_node', true),
  ]);

  assert.deepEqual(tools.map((tool) => tool.id), [
    APPLY_CANVAS_TOOL_ID,
    'rule_editor_get_context',
    'rule_editor_edit_node',
  ]);
  assert.equal(tools[0]?.id, APPLY_CANVAS_TOOL_ID);
  assert.equal(tools.some((tool) => tool.id === 'rule_editor_propose_canvas_actions'), false);
  assert.equal(tools.some((tool) => tool.id === 'rule_editor_apply_canvas_add_nodes'), false);
});

test('session catalog snapshot admits apply by exact id so FLAT business_execution can call it', () => {
  const tools = orderRuleEditorRemoteTools([
    { id: 'rule_editor_propose_canvas_actions', write: true, agentVisible: false },
    applyTool(),
    remoteTool('rule_editor_edit_node', true),
    remoteTool('rule_editor_delete_node', true),
    remoteTool('rule_editor_get_context'),
  ]);
  const snapshot = createAiClientToolCatalogSnapshot(
    tools.map((tool) => toRuleEditorClientToolDefinition(tool, async () => ({}))),
    {
      requireRouting: false,
      requireResultBindings: true,
    },
  );
  const ids = snapshot.wireDefinitions.map((tool) => tool.id);
  assert.equal(ids[0], APPLY_CANVAS_TOOL_ID);
  assert.equal(ids.includes(APPLY_CANVAS_TOOL_ID), true);
  assert.equal(ids.includes('rule_editor_edit_node'), true);
  assert.equal(ids.includes('rule_editor_delete_node'), true);
  assert.equal(ids.includes('rule_editor_propose_canvas_actions'), false);
  const writeIds = [APPLY_CANVAS_TOOL_ID, 'rule_editor_edit_node', 'rule_editor_delete_node'];
  writeIds.forEach((id) => {
    const wire = snapshot.wireDefinitions.find((tool) => tool.id === id) as {
      expands?: { effect?: string };
    };
    assert.equal(wire?.expands?.effect, 'WRITE', id);
    assert.equal(
      snapshot.report.issues.some((issue) => (
        issue.toolId === id && issue.code === 'effect_required_for_side_effect'
      )),
      false,
      id,
    );
  });
  const insertSnapshot = createAiClientToolCatalogSnapshot(
    [toRuleEditorClientToolDefinition(remoteTool('rule_editor_insert_node', true), async () => ({}))],
    {
      requireRouting: false,
      requireResultBindings: true,
    },
  );
  assert.equal(insertSnapshot.wireDefinitions[0]?.id, 'rule_editor_insert_node');
  assert.equal(
    (insertSnapshot.wireDefinitions[0] as { expands?: { effect?: string } })?.expands?.effect,
    'WRITE',
  );
  assert.equal(
    snapshot.report.tools.find((tool) => tool.toolId === APPLY_CANVAS_TOOL_ID)?.effectStatus,
    'legacy',
  );
  assert.equal(
    snapshot.report.tools.find((tool) => tool.toolId === APPLY_CANVAS_TOOL_ID)?.contractStatus,
    'typed',
  );
});

test('catalog has no parallel composition tools and keeps search compositions on the existing search id', () => {
  const tools = orderRuleEditorRemoteTools([
    applyTool(),
    remoteTool('rule_editor_search_node_types'),
    { id: 'rule_editor_find_nodes', agentVisible: false },
    remoteTool('rule_editor_list_nodes'),
  ]);
  assert.equal(tools[0]?.id, APPLY_CANVAS_TOOL_ID);
  assert.equal(tools.some((tool) => tool.id === 'rule_editor_find_nodes'), false);
  assert.equal(tools.some((tool) => /search_compositions|get_composition_detail/.test(String(tool.id))), false);

  const compiled = tools.map((tool) => toRuleEditorClientToolDefinition(tool, async () => ({})));
  assert.equal(compiled[0]?.id, APPLY_CANVAS_TOOL_ID);
  assert.deepEqual(compiled[0]?.routing?.produces, ['canvas-changes']);
  const search = compiled.find((tool) => tool.id === 'rule_editor_search_node_types');
  assert.deepEqual(search?.routing?.produces, ['node-types', 'compositions']);
  assert.equal(
    compiled.some((tool) => tool.id === 'rule_editor_search_compositions' || tool.id === 'rule_editor_get_composition_detail'),
    false,
  );

  const searchContract = resolveRuleEditorRemoteContract('rule_editor_search_node_types');
  assert.deepEqual(
    searchContract?._meta?.resultBindings?.map((binding) => binding.path),
    ['$.nodeTypes', '$.compositions'],
  );

  const report = reportFor(tools);
  assert.equal(report.valid, true);
  assert.equal(report.tools[0]?.toolId, APPLY_CANVAS_TOOL_ID);
  assert.equal(report.tools[0]?.contractStatus, 'typed');
  assert.ok(report.tools[0]?.routingStatus === 'valid');
  assert.equal(report.issues.some((issue) => /search_compositions|get_composition_detail/.test(`${issue.toolId}`)), false);
});
