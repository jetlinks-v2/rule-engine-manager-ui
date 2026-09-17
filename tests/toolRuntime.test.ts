import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  createEmptyRuleEditorToolRuntime,
  orderRuleEditorRemoteTools,
  toRuleEditorClientToolDefinition,
  TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  type RemoteRuleEditorToolDefinition,
} from '../views/Instance/RuleEditor/toolRuntime';
import { shouldAdvanceRuleEditorContextVersion } from '../views/Instance/RuleEditor/ruleEditorAgentContext';
import {
  RULE_EDITOR_FLOWCHART_PRESENTATION,
  RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE,
} from '../agentCapabilities/ruleEditor/constants';
import enLang from '../locales/lang/en.json';
import zhLang from '../locales/lang/zh.json';

const canonicalStepsSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['op'],
    properties: {
      op: {
        type: 'string',
        enum: ['insert-node', 'insert-template', 'edit-node', 'connect', 'connect-batch', 'layout'],
      },
      nodeType: { type: 'string' },
      source: { type: 'object' },
      target: { type: 'object' },
    },
  },
};

const legacyOneOfStepsSchema = {
  type: 'array',
  items: {
    oneOf: [
      {
        type: 'object',
        required: ['op', 'nodeType'],
        properties: {
          op: { const: 'insert-node' },
          nodeType: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['op', 'source', 'target'],
        properties: {
          op: { const: 'connect' },
          source: { type: 'object' },
          target: { type: 'object' },
        },
      },
    ],
  },
};

const canonicalPlanSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['flowMode', 'completion', 'steps'],
  properties: {
    flowMode: { type: 'string', enum: ['request-response', 'realtime-stream', 'one-way-trigger'] },
    completion: {
      type: 'object',
      additionalProperties: false,
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['complete-topology', 'partial-draft'] },
        sources: { type: 'array' },
        terminals: { type: 'array' },
      },
    },
    steps: canonicalStepsSchema,
  },
};

const applyTool = (): RemoteRuleEditorToolDefinition => ({
  id: 'rule_editor_apply_canvas_actions',
  name: 'apply canvas',
  write: true,
  expands: { _schema: canonicalPlanSchema },
  inputs: [{
    id: 'steps',
    required: true,
    valueType: { type: 'array' },
    expands: { _schema: canonicalStepsSchema },
  }],
});

test('apply tool exposes one canonical root schema without duplicate input schemas', () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({}));

  assert.deepEqual(definition.routing?.capabilities, ['rule-editor.canvas.apply']);
  assert.equal(definition.routing?.accepts, undefined);
  assert.equal(definition.routing?.evidencePolicy, 'required');
  assert.equal(definition.routing?.exposure, 'auto');
  assert.deepEqual(definition.routing?.intents, ['apply-canvas-plan', 'bind plan output to canvas-changes']);
  assert.equal(definition.routing?.help?.quickstartSection, APPLY_CANVAS_PLAN_BINDING_GUIDE);
  assert.ok(definition.description?.includes(APPLY_CANVAS_PLAN_BINDING_GUIDE));
  assert.deepEqual(definition.routing?.produces, ['canvas-changes', 'topology-diagram']);
  assert.deepEqual(definition.routing?.outputShapes, [
    'rule-editor.canvas-changes',
    'diagram.flowchart',
  ]);
  assert.equal(definition._meta?.clientToolContract.outputs[0].kind, 'state-events');
  assert.equal(definition._meta?.clientToolContract.outputs[1].kind, 'lookup');
  assert.equal(definition._meta?.clientToolContract.outputs[1].type, 'presentation');
  assert.equal(definition._meta?.clientToolContract.outputs[1].audience, 'client-presentation');
  assert.equal(definition._meta?.clientToolContract.outputs[1].delivery, 'inline');
  assert.equal(definition._meta?.clientToolContract.outputs[1].mediaType, TOPOLOGY_DIAGRAM_MEDIA_TYPE);
  assert.deepEqual(definition.expands?._schema, canonicalPlanSchema);
  assert.equal(definition.expands?.effect, 'WRITE');
  assert.equal(definition.inputs?.[0].expands, undefined);
  assert.equal(definition.annotations?.readOnlyHint, false);
});

test('adapter publishes WRITE for every write remote, not only apply by id', () => {
  const remoteWrite = (id: string): RemoteRuleEditorToolDefinition => ({
    id,
    name: id,
    write: true,
  });
  [
    applyTool(),
    remoteWrite('rule_editor_edit_node'),
    remoteWrite('rule_editor_delete_node'),
    remoteWrite('rule_editor_delete_link'),
    remoteWrite('rule_editor_insert_node'),
  ].forEach((tool) => {
    const definition = toRuleEditorClientToolDefinition(tool, async () => ({}));
    assert.equal(definition.expands?.effect, 'WRITE', tool.id);
    assert.equal(definition.annotations?.readOnlyHint, false, tool.id);
  });

  const read = toRuleEditorClientToolDefinition({
    id: 'rule_editor_get_context',
    name: 'rule_editor_get_context',
  }, async () => ({}));
  assert.equal(read.expands?.effect, undefined);
  assert.equal(read.annotations?.readOnlyHint, true);
});

test('server-bound execution context never enters tool arguments or declaration', async () => {
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (toolId, args, executionContext) => {
    captured.toolId = toolId;
    captured.args = args;
    captured.executionContext = executionContext;
    return {
      ok: false,
      success: false,
      code: 'clarification-required',
      recoveryAction: 'clarify',
      userInputRequired: true,
    };
  });
  const args = { flowMode: 'realtime-stream', completion: {}, steps: [] };
  const executionContext = {
    responseId: 'response-1',
    turnSeq: 3,
    userMessage: 'current-turn-only-property-report',
  };

  assert.equal(Object.hasOwn(definition, 'executionContext'), false);
  assert.equal(Object.hasOwn(args, 'executionContext'), false);
  await definition.execute(args, {}, { executionContext } as any);

  assert.equal(captured.toolId, 'rule_editor_apply_canvas_actions');
  assert.equal(captured.args, args);
  assert.equal(Object.hasOwn(captured.args, 'executionContext'), false);
  assert.deepEqual(captured.executionContext, executionContext);
});

test('apply keeps iframe description and appends the canvas-changes plan binding guide', () => {
  const tool = applyTool();
  tool.description = 'Apply an authorized canvas plan.';
  const definition = toRuleEditorClientToolDefinition(tool, async () => ({}));

  assert.equal(
    definition.description,
    `Apply an authorized canvas plan. ${APPLY_CANVAS_PLAN_BINDING_GUIDE}`,
  );
});

test('JSON-string apply steps and completion are parsed before iframe execute', async () => {
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return {
      ok: false,
      success: false,
      code: 'rule_editor.canvas_plan.preflight_failed',
      failureDisposition: 'request',
      recoveryAction: 'repair',
    };
  });
  const original = {
    flowMode: 'realtime-stream',
    completion: '{"mode":"partial-draft"}',
    steps: '[{"op":"insert-node","nodeType":"delay"}]',
    extra: 1,
  };

  const result = await definition.execute(original, {}, {} as any);

  assert.equal(result.code, 'rule_editor.canvas_plan.preflight_failed');
  assert.notEqual(captured.args, original);
  assert.deepEqual(captured.args, {
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps: [{ op: 'insert-node', nodeType: 'delay' }],
    extra: 1,
  });
  assert.equal(original.completion, '{"mode":"partial-draft"}');
  assert.equal(original.steps, '[{"op":"insert-node","nodeType":"delay"}]');

  const completionOnly = {
    flowMode: 'realtime-stream',
    completion: '{"mode":"complete-topology"}',
    steps: [{ op: 'connect' }],
  };
  await definition.execute(completionOnly, {}, {} as any);
  assert.notEqual(captured.args, completionOnly);
  assert.deepEqual(captured.args.completion, { mode: 'complete-topology' });
  assert.equal(captured.args.steps, completionOnly.steps);
});

test('JSON-string apply actions envelope is unwrapped before iframe execute', async () => {
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return {
      ok: false,
      success: false,
      code: 'rule_editor.canvas_plan.preflight_failed',
      failureDisposition: 'request',
      recoveryAction: 'repair',
    };
  });
  const plan = {
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps: [{ op: 'insert-node', nodeType: 'delay' }],
  };

  await definition.execute({ actions: JSON.stringify([plan]) }, {}, {} as any);
  assert.deepEqual(captured.args, plan);

  await definition.execute({ actions: JSON.stringify(plan) }, {}, {} as any);
  assert.deepEqual(captured.args, plan);

  await definition.execute({
    actions: [{ label: '写入', plan }],
  }, {}, {} as any);
  assert.deepEqual(captured.args, plan);

  const invalidActions = await definition.execute({ actions: '[{"flowMode":' }, {}, {} as any);
  assert.deepEqual(invalidActions, {
    ok: false,
    success: false,
    code: 'rule_editor.canvas_plan.invalid_arguments',
    message: 'actions must be a structured object, not an unparsable JSON string',
    failureDisposition: 'request',
    recoveryAction: 'repair',
    retryable: false,
    repair: { field: '/actions' },
  });
});

test('object apply arguments pass through unchanged and skip JSON coercion', async () => {
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return { ok: false, success: false, code: 'unchanged' };
  });
  const args = {
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps: [{ op: 'connect' }],
  };

  await definition.execute(args, {}, {} as any);

  assert.equal(captured.args, args);
});

test('parent coerce lifts string connect aliases before iframe execute', async () => {
  const captured: Record<string, any> = {};
  const originalSteps = [
    { op: 'insert-node', nodeType: 'topic-source', alias: 'msgSub', config: {} },
    { op: 'connect', source: 'msgSub', target: 'ql' },
  ];
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return { ok: false, success: false, code: 'unchanged' };
  });
  const args = {
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft', sources: ['msgSub'] },
    steps: originalSteps,
  };

  await definition.execute(args, {}, {} as any);

  assert.notEqual(captured.args, args);
  assert.deepEqual(captured.args.steps[1].source, { kind: 'alias', value: 'msgSub' });
  assert.deepEqual(captured.args.steps[1].target, { kind: 'alias', value: 'ql' });
  assert.deepEqual(captured.args.completion.sources, [{ kind: 'alias', value: 'msgSub' }]);
  assert.equal(originalSteps[1].source, 'msgSub');
});

test('invalid JSON apply arguments return a structured failure without calling iframe', async () => {
  let called = false;
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
    called = true;
    return { ok: true };
  });

  const invalidSteps = await definition.execute({
    completion: { mode: 'partial-draft' },
    steps: '[{"op":',
  }, {}, {} as any);
  assert.equal(called, false);
  assert.deepEqual(invalidSteps, {
    ok: false,
    success: false,
    code: 'rule_editor.canvas_plan.invalid_arguments',
    message: 'steps must be a structured array, not an unparsable JSON string',
    failureDisposition: 'request',
    recoveryAction: 'repair',
    retryable: false,
    repair: { field: '/steps' },
  });

  const invalidCompletion = await definition.execute({
    completion: 'not-json',
    steps: [],
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(invalidCompletion.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(invalidCompletion.repair.field, '/completion');

  const primitiveJson = await definition.execute({
    completion: { mode: 'partial-draft' },
    steps: '"insert-node"',
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(primitiveJson.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(primitiveJson.failureDisposition, 'request');
  assert.equal(primitiveJson.repair.field, '/steps');

  const objectSteps = await definition.execute({
    completion: { mode: 'partial-draft' },
    steps: '{"op":"insert-node"}',
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(objectSteps.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(objectSteps.repair.field, '/steps');

  const arrayCompletion = await definition.execute({
    completion: '["partial-draft"]',
    steps: [],
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(arrayCompletion.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(arrayCompletion.repair.field, '/completion');
});

test('mixed remote tools keep apply first without reordering sibling reads', () => {
  const ordered = orderRuleEditorRemoteTools([
    { id: 'rule_editor_get_context' },
    { id: '' },
    { id: 'rule_editor_list_nodes' },
    { id: 'rule_editor_apply_canvas_actions' },
    { id: 'rule_editor_validate_flow' },
  ]);

  assert.deepEqual(ordered.map((tool) => tool.id), [
    'rule_editor_apply_canvas_actions',
    'rule_editor_get_context',
    'rule_editor_list_nodes',
    'rule_editor_validate_flow',
  ]);
});

test('parent catalog filter uses agentVisible and does not expose a second apply alias', () => {
  const ordered = orderRuleEditorRemoteTools([
    { id: 'rule_editor_focus_node', agentVisible: false },
    { id: 'rule_editor_get_debug_logs', agentVisible: false },
    { id: 'rule_editor_propose_canvas_actions', agentVisible: false },
    { id: 'rule_editor_apply_canvas_actions' },
    { id: 'rule_editor_search_node_types' },
  ]);

  assert.deepEqual(ordered.map((tool) => tool.id), [
    'rule_editor_apply_canvas_actions',
    'rule_editor_search_node_types',
  ]);
  assert.equal(ordered.filter((tool) => String(tool.id).startsWith('rule_editor_apply_')).length, 1);
});

test('legacy parent fallback keeps a per-input schema when no root schema is declared', () => {
  const tool = applyTool();
  delete tool.expands;
  tool.inputs = [{
    id: 'steps',
    required: true,
    valueType: { type: 'array' },
    expands: { _schema: legacyOneOfStepsSchema },
  }];
  const definition = toRuleEditorClientToolDefinition(tool, async () => ({}));

  assert.deepEqual(definition.inputs?.[0].expands._schema.items.oneOf, legacyOneOfStepsSchema.items.oneOf);
});

test('successful apply result carries canonical state-change evidence', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: {
      mode: 'complete-topology',
      satisfied: true,
      sourceCount: 1,
      terminalCount: 1,
    },
    changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: false,
      nodeCount: 2,
      linkCount: 1,
      nodes: [
        { key: 'n1', label: '订阅属性上报', type: 'device-message-subscribe', source: true, terminal: false },
        { key: 'n2', label: 'HTTP 请求', type: 'http-request', source: false, terminal: true },
      ],
      links: [{ source: 'n1', target: 'n2', sourcePort: 0 }],
    },
    presentation: {
      mermaid: 'flowchart LR\n  n1["订阅属性上报"]\n  n2["HTTP 请求"]\n  n1 --> n2',
    },
    validation: { issueCount: 0 },
    canvasRevision: 7,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.evidence.resultStatus, 'applied');
  assert.deepEqual(result.evidence.facts, {
    flowMode: 'realtime-stream',
    completionMode: 'complete-topology',
    topologySatisfied: true,
    sourceCount: 1,
    terminalCount: 1,
    canvasRevision: 7,
    rolledBack: false,
    validationIssueCount: 0,
    topologyNodeCount: 2,
    topologyLinkCount: 1,
    topologyDiagramAvailable: true,
  });
  assert.equal(result.outputBindings[0].name, 'canvas-changes');
  assert.equal(result.outputBindings[0].recordCount, 1);
  assert.equal(result.outputBindings[0].shape, 'rule-editor.canvas-changes');
  assert.equal(result.outputBindings[1].name, 'topology-diagram');
  assert.equal(result.outputBindings[1].mediaType, TOPOLOGY_DIAGRAM_MEDIA_TYPE);
  assert.equal(result.outputBindings[1].path, '$.presentation.mermaid');
});

test('topology-only complete-topology success synthesizes verified mermaid presentation', async () => {
  const topology = {
    contract: 'rule-editor.topology-snapshot/v1',
    complete: true,
    truncated: false,
    nodeCount: 2,
    linkCount: 1,
    nodes: [
      { key: 'n1', label: '订阅属性上报', type: 'device-message-subscribe', source: true, terminal: false },
      { key: 'n2', label: 'HTTP 请求', type: 'http-request', source: false, terminal: true },
    ],
    links: [{ source: 'n1', target: 'n2', sourcePort: 0 }],
  };
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: {
      mode: 'complete-topology',
      satisfied: true,
      sourceCount: 1,
      terminalCount: 1,
    },
    changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
    topology,
    validation: { issueCount: 0 },
    canvasRevision: 7,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);
  const expectedMermaid = [
    'flowchart LR',
    '  n1["订阅属性上报"]',
    '  n2["HTTP 请求"]',
    '  n1 --> n2',
  ].join('\n');

  assert.equal(result.presentation.mermaid, expectedMermaid);
  assert.equal(result.evidence.facts.topologyDiagramAvailable, true);
  assert.equal(result.outputBindings[1].name, 'topology-diagram');
  assert.equal(result.outputBindings[1].path, '$.presentation.mermaid');
  assert.equal(result.outputBindings[1].mediaType, TOPOLOGY_DIAGRAM_MEDIA_TYPE);
});

test('three-node complete-topology snapshot synthesizes both verified edges', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: {
      mode: 'complete-topology',
      satisfied: true,
      sourceCount: 1,
      terminalCount: 1,
    },
    changes: [
      { kind: 'node-inserted', nodeId: 'node-1' },
      { kind: 'link-created' },
      { kind: 'link-created' },
    ],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: false,
      nodeCount: 3,
      linkCount: 2,
      nodes: [
        { key: 'n1', label: '订阅属性上报', type: 'device-message-subscribe', source: true, terminal: false },
        { key: 'n2', label: '函数处理', type: 'function', source: false, terminal: false },
        { key: 'n3', label: 'HTTP 请求', type: 'http-request', source: false, terminal: true },
      ],
      links: [
        { source: 'n1', target: 'n2', sourcePort: 0 },
        { source: 'n2', target: 'n3', sourcePort: 0 },
      ],
    },
    canvasRevision: 10,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);
  const expectedMermaid = [
    'flowchart LR',
    '  n1["订阅属性上报"]',
    '  n2["函数处理"]',
    '  n3["HTTP 请求"]',
    '  n1 --> n2',
    '  n2 --> n3',
  ].join('\n');

  assert.equal(result.presentation.mermaid, expectedMermaid);
  assert.equal(result.evidence.facts.topologyDiagramAvailable, true);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), true);
});

test('single-node complete-topology does not synthesize a topology diagram', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'one-way-trigger',
    completion: {
      mode: 'complete-topology',
      satisfied: true,
      sourceCount: 1,
      terminalCount: 1,
    },
    changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: false,
      nodeCount: 1,
      linkCount: 0,
      nodes: [
        { key: 'n1', label: 'Run once', type: 'one-shot', source: true, terminal: true },
      ],
      links: [],
    },
    canvasRevision: 3,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.evidence.resultStatus, 'applied');
  assert.equal(result.presentation, undefined);
  assert.equal(result.evidence.facts.topologyDiagramAvailable, false);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
});

test('truncated topology snapshot does not synthesize a mermaid presentation', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: {
      mode: 'complete-topology',
      satisfied: true,
      sourceCount: 1,
      terminalCount: 1,
    },
    changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: true,
      nodeCount: 8,
      linkCount: 7,
      nodes: [],
      links: [],
    },
    canvasRevision: 4,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.code, 'rule_editor.canvas_plan.invalid_result');
  assert.equal(result.presentation, undefined);
  assert.equal(result.outputBindings, undefined);
});

test('oversized verified mermaid stays topology-only instead of failing a successful apply', async () => {
  const nodeCount = 100;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    key: `n${index + 1}`,
    label: `N${String(index + 1).padStart(3, '0')}-${'x'.repeat(150)}`,
    type: 'transform',
    source: index === 0,
    terminal: index === nodeCount - 1,
  }));
  const links = Array.from({ length: nodeCount - 1 }, (_, index) => ({
    source: `n${index + 1}`,
    target: `n${index + 2}`,
    sourcePort: 0,
  }));
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: {
      mode: 'complete-topology',
      satisfied: true,
      sourceCount: 1,
      terminalCount: 1,
    },
    changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: false,
      nodeCount,
      linkCount: links.length,
      nodes,
      links,
    },
    canvasRevision: 11,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.evidence.resultStatus, 'applied');
  assert.equal(result.presentation, undefined);
  assert.equal(result.evidence.facts.topologyDiagramAvailable, false);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
});

test('partial draft keeps state-change evidence without claiming task completion', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: {
      mode: 'partial-draft',
      satisfied: false,
      sourceCount: 0,
      terminalCount: 0,
    },
    changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
    canvasRevision: 7,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.complete, false);
  assert.equal(result.evidence.complete, false);
  assert.equal(result.evidence.resultStatus, 'partial');
  assert.equal(result.evidence.facts.topologySatisfied, false);
  assert.equal(result.evidence.facts.topologyDiagramAvailable, false);
  assert.equal(result.presentation, undefined);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
});

test('structured bridge failure remains the authoritative repair result', async () => {
  const failure = {
    ok: false,
    success: false,
    code: 'rule_editor.canvas_plan.preflight_failed',
    failureDisposition: 'request',
    recoveryAction: 'repair',
    repair: { field: '/steps/1/source', maxAttempts: 1 },
  };
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => failure);

  assert.equal(await definition.execute({}, {}, {} as any), failure);
});

test('non-canonical apply success becomes a terminal tool failure', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({ ok: true }));
  const result = await definition.execute({}, {}, {} as any);

  assert.deepEqual(result, {
    ok: false,
    success: false,
    code: 'rule_editor.canvas_plan.invalid_result',
    message: 'canvas plan returned a non-canonical result',
    failureDisposition: 'tool',
    recoveryAction: 'terminal',
    retryable: false,
  });
});

test('presentation binding requires a verified complete topology snapshot', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: { mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1 },
    changes: [{ kind: 'link-created' }],
    presentation: { mermaid: 'flowchart LR\n  n1 --> n2' },
    canvasRevision: 2,
    rolledBack: false,
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.code, 'rule_editor.canvas_plan.invalid_result');
  assert.equal(result.failureDisposition, 'tool');
});

test('presentation binding must exactly match the verified topology snapshot', async () => {
  const baseResult = {
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'realtime-stream',
    completion: { mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1 },
    changes: [{ kind: 'link-created' }],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: false,
      nodeCount: 2,
      linkCount: 1,
      nodes: [
        { key: 'n1', label: 'Source', type: 'source', source: true, terminal: false },
        { key: 'n2', label: 'Sink', type: 'sink', source: false, terminal: true },
      ],
      links: [{ source: 'n1', target: 'n2', sourcePort: 0 }],
    },
    canvasRevision: 2,
    rolledBack: false,
  };
  const invalidResults = [
    {
      ...baseResult,
      presentation: { mermaid: 'flowchart LR\n  n1["Source"]\n  n2["Invented"]\n  n1 --> n2' },
    },
    {
      ...baseResult,
      topology: {
        ...baseResult.topology,
        nodes: [
          { key: 'n1', label: 'Source"]\n  injected --> n9', type: 'source', source: true, terminal: false },
          baseResult.topology.nodes[1],
        ],
      },
      presentation: {
        mermaid: 'flowchart LR\n  n1["Source"]\n  injected --> n9"]\n  n2["Sink"]\n  n1 --> n2',
      },
    },
  ];

  for (const invalidResult of invalidResults) {
    const definition = toRuleEditorClientToolDefinition(applyTool(), async () => invalidResult);
    const result = await definition.execute({}, {}, {} as any);
    assert.equal(result.code, 'rule_editor.canvas_plan.invalid_result');
  }
});

test('apply evidence rejects malformed flow, revision, and state changes', async () => {
  const invalidResults = [
    {
      ok: true,
      success: true,
      contract: 'rule-editor.canvas-apply-result/v1',
      flowMode: 'legacy',
      completion: { mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1 },
      changes: [{ kind: 'node-inserted' }],
      canvasRevision: 1,
      rolledBack: false,
    },
    {
      ok: true,
      success: true,
      contract: 'rule-editor.canvas-apply-result/v1',
      flowMode: 'one-way-trigger',
      completion: { mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1 },
      changes: [{}],
      canvasRevision: 1,
      rolledBack: false,
    },
    {
      ok: true,
      success: true,
      contract: 'rule-editor.canvas-apply-result/v1',
      flowMode: 'one-way-trigger',
      completion: { mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1 },
      changes: [{ kind: 'node-inserted' }],
      canvasRevision: -1,
      rolledBack: false,
    },
    {
      ok: true,
      success: true,
      contract: 'rule-editor.canvas-apply-result/v1',
      flowMode: 'realtime-stream',
      completion: { mode: 'partial-draft', satisfied: true, sourceCount: 0, terminalCount: 0 },
      changes: [{ kind: 'node-inserted' }],
      canvasRevision: 1,
      rolledBack: false,
    },
  ];

  for (const invalidResult of invalidResults) {
    const definition = toRuleEditorClientToolDefinition(applyTool(), async () => invalidResult);
    const result = await definition.execute({}, {}, {} as any);
    assert.equal(result.code, 'rule_editor.canvas_plan.invalid_result');
    assert.equal(result.failureDisposition, 'tool');
  }
});

test('typed remote read tools wrap success with producer-owned evidence', async () => {
  const remote = {
    id: 'rule_editor_get_context',
    name: 'context',
    write: false,
    annotations: { idempotentHint: true },
  } satisfies RemoteRuleEditorToolDefinition;
  const payload = { ok: true, ruleId: 'rule-1', canvasRevision: 3 };
  const definition = toRuleEditorClientToolDefinition(remote, async () => payload, 'revision-7');

  assert.deepEqual(definition.routing?.produces, ['canvas-context']);
  assert.equal(definition._meta?.clientToolAdapter?.source, 'rule-editor-iframe');
  assert.equal(definition._meta?.clientToolAdapter?.sourceRevision, 'revision-7');
  assert.equal(definition.annotations?.readOnlyHint, true);
  assert.equal(definition.annotations?.idempotentHint, true);

  const result = await definition.execute({}, {}, {} as any);
  assert.equal(result.success, true);
  assert.equal(result.ruleId, 'rule-1');
  assert.equal(result.outputBindings[0].name, 'canvas-context');
  assert.equal(result.outputBindings[0].path, '$.ruleId');

  const truncated = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: true,
    ruleId: 'rule-1',
    truncated: true,
  })).execute({}, {}, {} as any);
  assert.equal(truncated.complete, false);
  assert.equal(truncated.truncated, true);
});

test('typed record-set remotes stay non-exhaustive unless the source proves completeness', async () => {
  const remote = {
    id: 'rule_editor_list_nodes',
    name: 'list nodes',
    write: false,
  } satisfies RemoteRuleEditorToolDefinition;

  const unproven = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: true,
    nodes: [{ id: 'n1' }],
  })).execute({}, {}, {} as any);
  assert.equal(unproven.success, true);
  assert.equal(unproven.complete, false);
  assert.equal(unproven.truncated, true);
  assert.equal(unproven.outputBindings[0].complete, false);
  assert.equal(unproven.outputBindings[0].truncated, true);

  const proven = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: true,
    nodes: [{ id: 'n1' }],
    complete: true,
  })).execute({}, {}, {} as any);
  assert.equal(proven.complete, true);
  assert.equal(proven.truncated, false);
  assert.equal(proven.outputBindings[0].complete, true);
});

test('typed remote failures stay structured and never throw unclassified errors', async () => {
  const remote = {
    id: 'rule_editor_list_nodes',
    name: 'list nodes',
    write: false,
  } satisfies RemoteRuleEditorToolDefinition;

  const canonicalFailure = {
    ok: false,
    success: false,
    code: 'rule_editor.nodes.unavailable',
    failureDisposition: 'dependency',
    recoveryAction: 'retry',
  };
  const canonicalDefinition = toRuleEditorClientToolDefinition(remote, async () => canonicalFailure);
  assert.equal(await canonicalDefinition.execute({}, {}, {} as any), canonicalFailure);

  const wrappedDefinition = toRuleEditorClientToolDefinition(remote, async () => ({ ok: false, message: 'bridge down' }));
  assert.deepEqual(await wrappedDefinition.execute({}, {}, {} as any), {
    ok: false,
    success: false,
    code: 'rule_editor.remote.failed',
    message: 'bridge down',
    failureDisposition: 'tool',
    recoveryAction: 'terminal',
    retryable: false,
  });

  const errorFieldDefinition = toRuleEditorClientToolDefinition(remote, async () => ({ ok: false, error: 'missing node' }));
  assert.equal((await errorFieldDefinition.execute({}, {}, {} as any)).message, 'missing node');

  const thrownDefinition = toRuleEditorClientToolDefinition(remote, async () => {
    throw new Error('iframe crashed');
  });
  assert.deepEqual(await thrownDefinition.execute({}, {}, {} as any), {
    ok: false,
    success: false,
    code: 'rule_editor.remote.failed',
    message: 'iframe crashed',
    failureDisposition: 'tool',
    recoveryAction: 'terminal',
    retryable: false,
  });

  const unknownThrowDefinition = toRuleEditorClientToolDefinition(remote, async () => {
    throw 'boom';
  });
  assert.equal((await unknownThrowDefinition.execute({}, {}, {} as any)).message, 'rule editor tool failed');

  const invalidDefinition = toRuleEditorClientToolDefinition(remote, async () => 'not-an-object');
  assert.equal((await invalidDefinition.execute({}, {}, {} as any)).code, 'rule_editor.remote.invalid_result');

  const applyThrown = toRuleEditorClientToolDefinition(applyTool(), async () => {
    throw new Error('apply bridge down');
  });
  assert.equal((await applyThrown.execute({}, {}, {} as any)).code, 'rule_editor.remote.failed');

  const applyWrapped = toRuleEditorClientToolDefinition(applyTool(), async () => ({ ok: false, message: 'apply rejected' }));
  assert.deepEqual(await applyWrapped.execute({}, {}, {} as any), {
    ok: false,
    success: false,
    code: 'rule_editor.remote.failed',
    message: 'apply rejected',
    failureDisposition: 'tool',
    recoveryAction: 'terminal',
    retryable: false,
  });

  const applyClarify = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: false,
    success: false,
    code: 'clarification-required',
    recoveryAction: 'clarify',
  }));
  const clarifyResult = await applyClarify.execute({}, {}, {} as any);
  assert.equal(clarifyResult.code, 'clarification-required');
  assert.equal(clarifyResult.failureDisposition, 'tool');
  assert.equal(clarifyResult.recoveryAction, 'clarify');
});

test('unrelated write tools keep their original execution contract', async () => {
  const remote = {
    id: 'rule_editor_insert_node',
    name: 'insert',
    write: true,
  } satisfies RemoteRuleEditorToolDefinition;
  const payload = { ok: true, nodeId: 'n1' };
  const definition = toRuleEditorClientToolDefinition(remote, async () => payload);

  assert.equal(definition.routing, undefined);
  assert.equal(definition._meta?.clientToolContract, undefined);
  assert.equal(await definition.execute({}, {}, {} as any), payload);
  await assert.rejects(
    toRuleEditorClientToolDefinition(remote, async () => {
      throw new Error('write failed');
    }).execute({}, {}, {} as any),
    /write failed/,
  );
});

test('empty runtime reports translated metadata and rejects execution before bridge readiness', async () => {
  const runtime = createEmptyRuleEditorToolRuntime((key) => `translated:${key}`);

  assert.equal(runtime.clientToolsName, 'translated:RuleEditor.agent.toolsName');
  assert.equal(runtime.clientToolsDescription, 'translated:RuleEditor.agent.toolsDescription');
  assert.equal(runtime.clientToolsVersion, 0);
  assert.equal(runtime.getToolHelp?.('unknown' as any), '');
  assert.equal(runtime.getAllToolHelp?.(), '');
  runtime.refreshClientTools();
  assert.equal(typeof runtime.subscribeClientTools(() => undefined), 'function');
  runtime.dispose();
  await assert.rejects(runtime.handleClientToolCall({} as any), /translated:RuleEditor\.bridge\.error\.notReady/);
});

test('parent write prompt treats page-bound subscribe/forward/push as apply with op', () => {
  const compactZh = String((zhLang as Record<string, string>)['RuleEditor.agent.system.compact']);
  const compactEn = String((enLang as Record<string, string>)['RuleEditor.agent.system.compact']);
  assert.match(compactZh, /rule_editor_apply_canvas_actions/);
  assert.match(compactZh, /可点击应用按钮/);
  assert.match(compactZh, /同一次 steps 写全所有 connect/);
  assert.match(compactEn, /rule_editor_apply_canvas_actions/);
  assert.match(compactEn, /clickable apply button/);
  assert.match(compactEn, /every connect in that same steps array/);

  const zh = String((zhLang as Record<string, string>)['RuleEditor.agent.system.write']);
  const en = String((enLang as Record<string, string>)['RuleEditor.agent.system.write']);

  assert.match(zh, /如何做/);
  assert.match(zh, /SQL 写法/);
  assert.match(zh, /视为方案咨询/);
  assert.equal(zh.includes('默认把“我想实现'), false);
  assert.match(zh, /订阅、转发、推送到第三方接口/);
  assert.match(zh, /rule_editor_search_node_types/);
  assert.match(zh, /rule_editor_get_node_type_detail/);
  assert.match(zh, /rule_editor_apply_canvas_actions/);
  assert.match(zh, /全部 connect 放进同一次 steps/);
  assert.match(zh, /不要先插入再第二次 apply 只连线/);
  assert.match(zh, /禁止回复编辑器无法一键插入/);
  assert.match(zh, /帮我执行/);
  assert.match(zh, /只能调用 rule_editor_apply_canvas_actions/);
  assert.match(zh, /不要调用 rule_editor_propose_canvas_actions/);
  assert.match(zh, /可点击应用按钮/);
  assert.equal(zh.includes('insert_node'), false);

  assert.match(en, /how to do this/);
  assert.match(en, /SQL writing/);
  assert.match(en, /design consultation/);
  assert.equal(en.includes('I want to implement'), false);
  assert.match(en, /subscribe, forward, push to a third-party API/);
  assert.match(en, /rule_editor_search_node_types/);
  assert.match(en, /rule_editor_get_node_type_detail/);
  assert.match(en, /rule_editor_apply_canvas_actions/);
  assert.match(en, /steps\[\]\.op/);
  assert.match(en, /cannot one-click insert/);
  assert.match(en, /execute now/);
  assert.match(en, /call only rule_editor_apply_canvas_actions/);
  assert.match(en, /Do not call rule_editor_propose_canvas_actions/);
  assert.match(en, /clickable apply button/);
  assert.match(en, /every connect in that same steps array/);
  assert.match(en, /do not insert then apply again only to connect/);
  assert.equal(en.includes('insert_node'), false);
});

test('preferred flowchart presentation does not reuse global mermaid media type or type', () => {
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE, 'flowchart');
  assert.notEqual(RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE, 'mermaid');
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION.mediaType, TOPOLOGY_DIAGRAM_MEDIA_TYPE);
  assert.equal(TOPOLOGY_DIAGRAM_MEDIA_TYPE, 'text/vnd.mermaid');
  assert.notEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.mediaType, 'application/vnd.mermaid');
  assert.deepEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.preferredInputShapes, ['diagram.flowchart']);
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION.deliveryPolicy, 'preferred');
  assert.deepEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.contentResponsibilities, ['topology', 'process.flow']);
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION.narrativePolicy.mode, 'card-first');
  assert.deepEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.narrativePolicy.allowedTextRoles, ['summary', 'next_step']);
});

test('presentation and compact prompts do not ask the model to select a renderer', () => {
  const presentationZh = String((zhLang as Record<string, string>)['RuleEditor.agent.system.presentation']);
  const presentationEn = String((enLang as Record<string, string>)['RuleEditor.agent.system.presentation']);
  const compactZh = String((zhLang as Record<string, string>)['RuleEditor.agent.system.compact']);
  const compactEn = String((enLang as Record<string, string>)['RuleEditor.agent.system.compact']);

  for (const text of [presentationZh, presentationEn, compactZh, compactEn]) {
    assert.match(text, /topology-diagram/);
    assert.equal(text.includes('必须选择'), false);
    assert.equal(text.includes('must be selected'), false);
    assert.equal(/select(?:ed)? for the installed/i.test(text), false);
    assert.equal(text.includes('JSON AnswerSpec'), true);
    assert.equal(text.includes('http://'), false);
    assert.equal(text.includes('上线'), false);
  }
  assert.match(presentationZh, /不要选择 renderer/);
  assert.match(presentationEn, /Do not select a renderer/);
  assert.match(presentationZh, /partial-draft/);
  assert.match(presentationEn, /partial-draft/);
});

test('context-only ticks do not advance version when digest is unchanged or a tool call is in flight', () => {
  const first = shouldAdvanceRuleEditorContextVersion({
    previousDigest: '',
    nextContext: { canvasRevision: 1, nodeCount: 2 },
    inFlightClientToolCall: false,
  });
  assert.equal(first.advance, true);

  const same = shouldAdvanceRuleEditorContextVersion({
    previousDigest: first.digest,
    nextContext: { canvasRevision: 1, nodeCount: 2 },
    inFlightClientToolCall: false,
  });
  assert.equal(same.advance, false);
  assert.equal(same.digest, first.digest);

  const inFlight = shouldAdvanceRuleEditorContextVersion({
    previousDigest: first.digest,
    nextContext: { canvasRevision: 2, nodeCount: 4 },
    inFlightClientToolCall: true,
  });
  assert.equal(inFlight.advance, false);
  assert.notEqual(inFlight.digest, first.digest);
});
