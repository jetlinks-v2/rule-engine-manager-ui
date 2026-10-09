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
  PREPARE_CANVAS_TOOL_ID,
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

const prepareTool = (): RemoteRuleEditorToolDefinition => ({
  id: PREPARE_CANVAS_TOOL_ID,
  name: 'prepare canvas',
  write: false,
  expands: { _schema: { type: 'object', additionalProperties: false, properties: {} } },
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
  assert.deepEqual(routing.intents, ['apply-prepared-canvas-plan', 'bind plan output to canvas-changes']);
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
  assert.match(APPLY_CANVAS_PLAN_BINDING_GUIDE, /never stringify steps/);
  assert.equal(APPLY_CANVAS_PLAN_BINDING_GUIDE.includes('canvas-actions-result'), false);
  assert.equal(APPLY_CANVAS_PLAN_BINDING_GUIDE.includes('://'), false);
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
    PREPARE_CANVAS_TOOL_ID,
    'rule_editor_get_context',
    'rule_editor_get_graph_summary',
    'rule_editor_list_nodes',
    'rule_editor_get_node_detail',
    'rule_editor_get_node_contract',
    'rule_editor_get_node_type_catalog',
    'rule_editor_get_node_type_manual',
    'rule_editor_search_node_types',
    'rule_editor_get_node_type_detail',
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

test('node type and composition detail bind their actual result through the real core adapter', async () => {
  const remote = {
    id: 'rule_editor_get_node_type_detail',
    name: 'node type detail',
    write: false,
    inputs: [
      { id: 'type', required: true, valueType: 'string' },
      { id: 'compositionId', valueType: 'string' },
      { id: 'keyword', valueType: 'string' },
    ],
  } satisfies RemoteRuleEditorToolDefinition;
  assert.equal(reportFor([remote]).valid, true);
  for (const payload of [
    { ok: true, type: 'source', fields: [], contracts: { output: { kind: 'object' } } },
    { ok: true, composition: { id: 'source>sink', members: [{ type: 'source' }, { type: 'sink' }], slots: {} } },
  ]) {
    const calls: Array<{ id: string; args: Record<string, unknown> }> = [];
    const definition = toRuleEditorClientToolDefinition(remote, async (id, args) => {
      calls.push({ id, args });
      return payload;
    });
    assert.deepEqual(definition.inputs?.map(input => input.id), ['type', 'compositionId', 'keyword']);
    const args = { type: 'source', ...(payload.composition ? { compositionId: payload.composition.id } : {}) };
    const result = await definition.execute(args, {}, {} as any);
    assert.deepEqual(calls, [{ id: remote.id, args }]);
    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.outputBindings[0].name, 'node-type-detail');
    assert.equal(result.outputBindings[0].path, '$');
    assert.equal(result.outputBindings[0].complete, true);
    if (payload.composition) {
      assert.deepEqual(result.composition, payload.composition);
      assert.equal(Object.hasOwn(result, 'type'), false);
    } else {
      assert.equal(result.type, payload.type);
    }
  }
});

test('bounded discovery separates fulfilled requests from non-exhaustive population evidence', async () => {
  for (const [id, payload] of [
    ['rule_editor_search_node_types', { nodeTypes: [{ type: 'owner' }], compositions: [], total: 20 }],
    ['rule_editor_get_node_type_catalog', { items: [{ label: 'operation', insertText: 'operation(value)' }], nextCursor: '2', total: 3 }],
  ] as const) {
    const result = await toRuleEditorClientToolDefinition({ id, write: false }, async () => ({
      ok: true, ...payload, requestSatisfied: true, exhaustive: false, displayTruncated: false, truncated: true,
    })).execute({}, {}, {} as any);
    assert.equal(result.success, true);
    assert.equal(result.complete, true);
    assert.equal(result.requestSatisfied, true);
    assert.equal(result.exhaustive, false);
    assert.equal(result.truncated, false, 'the canonical mirror describes display, not remaining pages');
    assert.equal(result.completeness, 'partial');
    assert.equal(result.evidence.supportsAbsenceClaim, false);
    for (const binding of result.outputBindings) {
      assert.equal(binding.requestSatisfied, true);
      assert.equal(binding.complete, true);
      assert.equal(binding.exhaustive, false);
      assert.equal(binding.completeness, 'partial');
      assert.equal(binding.displayTruncated, false);
    }
    assert.equal(result.total, payload.total);
  }
  const suffix = await toRuleEditorClientToolDefinition({ id: 'rule_editor_get_node_type_catalog', write: false }, async () => ({
    ok: true, items: [{ label: 'last' }], cursor: 2, requestSatisfied: true, exhaustive: false, truncated: false, displayTruncated: false,
  })).execute({}, {}, {} as any);
  assert.equal(suffix.complete, true);
  assert.equal(suffix.exhaustive, false, 'a last page does not prove full population coverage');
  const unproven = await toRuleEditorClientToolDefinition({ id: 'rule_editor_get_node_type_catalog', write: false }, async () => ({
    ok: true, items: [{ label: 'window' }], exhaustive: false,
  })).execute({}, {}, {} as any);
  assert.equal(unproven.complete, false, 'coverage alone does not prove that the request was fulfilled');
  const clipped = await toRuleEditorClientToolDefinition({ id: 'rule_editor_get_node_type_catalog', write: false }, async () => ({
    ok: true, items: [{ label: 'operation', truncated: true }], requestSatisfied: false,
    exhaustive: false, displayTruncated: true, truncated: true,
  })).execute({}, {}, {} as any);
  assert.equal(clipped.complete, false);
  assert.equal(clipped.displayTruncated, true);
  assert.equal(clipped.outputBindings[0].exhaustive, false);
});

test('owner resource bindings cover selected bodies and directories without changing legacy paths', async () => {
  const manualTool = { id: 'rule_editor_get_node_type_manual', write: false };
  const full = await toRuleEditorClientToolDefinition(manualTool, async () => ({
    ok: true, manual: { id: 'owner', content: 'Owner signature and constraints.', truncated: false },
    manuals: [{ id: 'owner' }], requestSatisfied: true, exhaustive: true, displayTruncated: false,
  })).execute({}, {}, {} as any);
  assert.deepEqual(full.outputBindings.map(binding => [binding.name, binding.path]), [
    ['node-type-manuals', '$.manuals'], ['manual-body', '$.manual'],
  ]);
  assert.equal(full.complete, true);
  const old = await toRuleEditorClientToolDefinition(manualTool, async () => ({
    ok: true, manual: { id: 'owner', content: 'Legacy selected body.', truncated: false }, manuals: [{ id: 'owner' }, { id: 'other' }],
  })).execute({}, {}, {} as any);
  assert.equal(old.complete, true);
  assert.equal(old.outputBindings.find(binding => binding.name === 'manual-body')?.path, '$.manual');
  const manualDirectory = await toRuleEditorClientToolDefinition(manualTool, async () => ({
    ok: true, manuals: [{ id: 'owner' }], requestSatisfied: true, exhaustive: true, displayTruncated: false,
  })).execute({}, {}, {} as any);
  assert.deepEqual(manualDirectory.outputBindings.map(binding => binding.path), ['$.manuals']);
  const catalogDirectory = await toRuleEditorClientToolDefinition({ id: 'rule_editor_get_node_type_catalog', write: false }, async () => ({
    ok: true, catalogs: [{ id: 'language' }], requestSatisfied: true, exhaustive: true, displayTruncated: false,
  })).execute({}, {}, {} as any);
  assert.equal(catalogDirectory.outputBindings, undefined, 'a directory is not a function record-set');
  assert.equal(catalogDirectory.complete, true);
});

test('body truncation and explicit incompleteness cannot be promoted by optimistic discovery flags', async () => {
  for (const payload of [
    { manual: { id: 'owner', content: 'Clipped body.', truncated: true } },
    { manual: { id: 'owner', content: 'Clipped fields.' }, fieldsTruncated: true },
    { manual: { id: 'owner', content: 'Incomplete response.' }, complete: false, exhaustive: false },
  ]) {
    const result = await toRuleEditorClientToolDefinition({ id: 'rule_editor_get_node_type_manual', write: false }, async () => ({
      ok: true, requestSatisfied: true, exhaustive: true, displayTruncated: false, ...payload,
    })).execute({}, {}, {} as any);
    assert.equal(result.complete, false);
    assert.equal(result.requestSatisfied, false);
    assert.equal(result.exhaustive, false);
    assert.equal(result.outputBindings[0].complete, false);
  }
  const legacy = await toRuleEditorClientToolDefinition({ id: 'rule_editor_get_node_type_manual', write: false }, async () => ({
    ok: true, manual: { id: 'owner', content: 'Legacy clipped body.', truncated: true }, manuals: [{ id: 'owner' }],
  })).execute({}, {}, {} as any);
  assert.equal(legacy.complete, false);
  assert.equal(legacy.truncated, true);
  const failed = await toRuleEditorClientToolDefinition({ id: 'rule_editor_search_node_types', write: false }, async () => ({
    ok: false, error: 'Owner unavailable', requestSatisfied: true, exhaustive: true,
  })).execute({}, {}, {} as any);
  assert.equal(failed.success, false);
  assert.equal(failed.requestSatisfied, undefined);
});

test('remote search evidence binds only real result branches and never turns failures into success', async () => {
  const remote = remoteTool('rule_editor_search_node_types');
  for (const payload of [
    {ok: true, total: 20, nodeTypes: [{type: 'source'}], complete: false, truncated: true},
    {ok: true, total: 20, nodeTypes: [{type: 'source'}], complete: false, truncated: false},
    {ok: true, total: 0, nodeTypes: [], compositions: [], complete: true, truncated: false},
  ]) {
    const definition = toRuleEditorClientToolDefinition(remote, async () => payload);
    const result = await definition.execute({}, {}, {} as any);
    assert.equal(result.complete, payload.complete);
    assert.equal(result.truncated, payload.truncated);
    assert.deepEqual(result.outputBindings.map((binding: {path: string}) => binding.path),
      'compositions' in payload ? ['$.nodeTypes', '$.compositions'] : ['$.nodeTypes']);
    assert.deepEqual(result.nodeTypes, payload.nodeTypes);
  }
  const failure = {ok: false, success: false, error: 'search unavailable'};
  const definition = toRuleEditorClientToolDefinition(remote, async () => failure);
  const result = await definition.execute({}, {}, {} as any);
  assert.equal(result.success, false);
  assert.equal(result.outputBindings, undefined);
});

test('mixed remotes keep prepare then apply first with typed prepared-plan evidence', () => {
  const tools = orderRuleEditorRemoteTools([
    remoteTool('rule_editor_get_context'),
    remoteTool('rule_editor_list_nodes'),
    applyTool(),
    prepareTool(),
    remoteTool('rule_editor_get_graph_summary'),
    remoteTool('rule_editor_validate_flow'),
  ]);

  assert.deepEqual(tools.slice(0, 2).map((tool) => tool.id), [
    PREPARE_CANVAS_TOOL_ID,
    APPLY_CANVAS_TOOL_ID,
  ]);
  assert.deepEqual(tools.slice(2).map((tool) => tool.id), [
    'rule_editor_get_context',
    'rule_editor_list_nodes',
    'rule_editor_get_graph_summary',
    'rule_editor_validate_flow',
  ]);

  const compiled = tools.map((tool) => toRuleEditorClientToolDefinition(tool, async () => ({})));
  assert.equal(compiled[0]?.id, PREPARE_CANVAS_TOOL_ID);
  assert.deepEqual(compiled[0]?.routing?.capabilities, ['rule-editor.canvas.prepare']);
  assert.deepEqual(compiled[0]?.routing?.produces, ['prepared-canvas-plan']);
  assert.deepEqual(compiled[0]?.routing?.outputShapes, ['rule-editor.canvas-prepared-plan']);
  assert.equal(compiled[1]?.id, APPLY_CANVAS_TOOL_ID);
  assert.ok(compiled[1]?.routing?.produces?.includes('canvas-changes'));

  const report = reportFor(tools);
  assert.equal(report.valid, true);
  assert.equal(report.tools[0]?.toolId, PREPARE_CANVAS_TOOL_ID);
  assert.equal(report.tools[0]?.contractStatus, 'typed');
  assert.equal(report.tools[0]?.routingStatus, 'valid');
  assert.equal(report.summary.typed, 6);
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
