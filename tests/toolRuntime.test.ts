import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  APPLY_CANVAS_PLAN_BINDING_GUIDE,
  PREPARE_CANVAS_TOOL_ID,
  BROKEN_CANVAS_STEPS_INSTRUCTION,
  coerceApplyCanvasPlanArguments,
  createEmptyRuleEditorToolRuntime,
  createRuleEditorToolUnavailableResult,
  RuleEditorBridgeUnavailableError,
  orderRuleEditorRemoteTools,
  RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  RULE_EDITOR_RESOURCE_VERSION,
  toRuleEditorClientToolDefinition,
  TOPOLOGY_DIAGRAM_MEDIA_TYPE,
  TOPOLOGY_DIAGRAM_SHAPE,
  type RemoteRuleEditorToolDefinition,
} from '../views/Instance/RuleEditor/toolRuntime';
import {
  EXCLUDED_SHARED_TOOL_IDS,
  isRuleEditorSharedToolAllowed,
  projectRuleEditorSharedTool,
  RULE_EDITOR_SHARED_TOOL_ALLOWLIST,
} from '../views/Instance/RuleEditor/ruleEditorSharedToolIds';
import {
  createCompleteRuleEditorTaskTarget,
  createConfiguredRuleEditorTaskTarget,
  createRuleEditorTaskTargetStore,
  createRuleEditorBridgeRequestId,
  createRuleEditorContextDigest,
  mergeRuleEditorTaskTarget,
  normalizeRuleEditorTaskTarget,
  requestRuleEditorLocalTargetConfirmation,
  shouldAdvanceRuleEditorContextVersion,
} from '../views/Instance/RuleEditor/ruleEditorAgentContext';
import {
  RULE_EDITOR_FLOWCHART_PRESENTATION,
  RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE,
} from '../agentCapabilities/ruleEditor/constants';
import enLang from '../locales/lang/en.json';
import zhLang from '../locales/lang/zh.json';

const emptyCanvasContext = () => ({ nodeCount: 0 });

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
  assert.deepEqual(definition.routing?.intents, ['apply-prepared-canvas-plan', 'bind plan output to canvas-changes']);
  assert.equal(definition.routing?.help?.quickstartSection, APPLY_CANVAS_PLAN_BINDING_GUIDE);
  assert.ok(definition.description?.includes(APPLY_CANVAS_PLAN_BINDING_GUIDE));
  assert.deepEqual(definition.routing?.produces, ['canvas-changes']);
  assert.deepEqual(definition.routing?.outputShapes, [
    'rule-editor.canvas-changes',
  ]);
  assert.equal(definition._meta?.clientToolContract.outputs[0].kind, 'state-events');
  assert.equal(definition._meta?.clientToolContract.outputs.length, 1);
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

test('R1 rejects legacy actions envelopes without invoking the iframe', async () => {
  let called = false;
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
    called = true;
    return { ok: true };
  });
  const plan = {
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps: [{ op: 'insert-node', nodeType: 'delay' }],
  };

  for (const actions of [JSON.stringify([plan]), JSON.stringify(plan), [{ label: '写入', plan }]]) {
    const result = await definition.execute({ actions }, {}, {} as any) as Record<string, unknown>;
    assert.equal(result.code, 'rule_editor.canvas_plan.invalid_arguments');
    assert.equal(result.validationPath, '/actions');
    assert.equal(result.expectedType, 'object');
    assert.equal(result.sameArgumentsAllowed, false);
    assert.equal(result.retryable, false);
  }
  assert.equal(called, false);
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

test('public apply boundary rejects string fields consistently without parsing or occupancy branches', async () => {
  const cases = [
    { field: 'steps', value: '[{"op":"insert-node"}]', instruction: BROKEN_CANVAS_STEPS_INSTRUCTION },
    { field: 'completion', value: '{"mode":"partial-draft"}', instruction: 'completion 必须是结构化对象；请修正类型后重新调用。' },
  ] as const;
  for (const item of cases) {
    let called = false;
    const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
      called = true;
      return { ok: true };
    }, 'unversioned', emptyCanvasContext);
    const result = await definition.execute({
      flowMode: 'realtime-stream',
      completion: { mode: 'partial-draft' },
      steps: [],
      [item.field]: item.value,
    }, {}, {} as any) as Record<string, unknown>;
    assert.equal(called, false);
    assert.equal(result.code, 'rule_editor.canvas_plan.invalid_arguments');
    assert.equal(result.failureDisposition, 'request');
    assert.equal(result.recoveryAction, 'repair');
    assert.equal(result.retryable, false);
    assert.equal(result.instruction, item.instruction);
  }
});

test('public apply leaves iframe schema plan and dynamic branch configuration unchanged', async () => {
  const captured: Record<string, any> = {};
  const plan = {
    flowMode: 'request-response',
    completion: { mode: 'complete-topology' },
    targetState: 'configured',
    steps: [{
      op: 'insert-composition',
      compositionId: 'zip:rule-input>zip-input>zip-output>rule-output',
      slots: {
        branches: [{
          type: 'command-support',
          alias: 'command',
          outputAlias: 'device',
          mapping: { device: '${command}' },
          config: { dynamicValue: { source: 'upstream' } },
        }],
      },
    }],
  };
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return { ok: false, success: false, code: 'unchanged' };
  });

  await definition.execute(plan, {}, {} as any);

  assert.equal(captured.args, plan);
  assert.deepEqual(captured.args.steps[0].slots.branches[0], plan.steps[0].slots.branches[0]);
});

test('R1 rejects malformed string fields with typed repair and zero iframe calls', async () => {
  let called = false;
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
    called = true;
    return { ok: true };
  }, 'unversioned', emptyCanvasContext);

  const invalidSteps = await definition.execute({
    completion: { mode: 'partial-draft' },
    steps: '[{"op":',
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(invalidSteps.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(invalidSteps.validationPath, '/steps');
  assert.equal(invalidSteps.expectedType, 'array');
  assert.equal(invalidSteps.actualType, 'string');
  assert.deepEqual(invalidSteps.repairPaths, ['/steps']);
  assert.equal(invalidSteps.sameArgumentsAllowed, false);
  assert.equal(invalidSteps.retryable, false);

  const invalidCompletion = await definition.execute({
    completion: 'not-json',
    steps: [],
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(invalidCompletion.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(invalidCompletion.repair.field, '/completion');

  const emptySteps = await definition.execute({
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps: '',
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(emptySteps.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(emptySteps.failureDisposition, 'request');
  assert.equal(emptySteps.repair.field, '/steps');

  const emptyCompletion = await definition.execute({
    flowMode: 'realtime-stream',
    completion: '',
    steps: [{ op: 'insert-node', nodeType: 'delay' }],
  }, {}, {} as any);
  assert.equal(called, false);
  assert.equal(emptyCompletion.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(emptyCompletion.repair.field, '/completion');

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

test('R1 rejects the A23 string payload without salvage or iframe invocation', async () => {
  const a23 = Buffer.from(
    'W3siYWxpYXMiOiAiYml6Q29tcG9zaXRpb24iLCAiY29tcG9zaXRpb25JZCI6ICJ6aXA6cnVsZS1pbnB1dD56aXAtaW5wdXQ+emlwLW91dHB1dD5ydWxlLW91dHB1dCIsICJjb25maWciOiB7ImV4ZWN1dGVQYXlsb2FkIjogIntcImRldmljZUlkXCI6IFwiZGVtby1kZXZpY2UtMDAxXCIsIFwiY29tbWFuZFwiOiBcInNldFByb3BlcnR5XCIsIFwic2VydmljZUlkXCI6IFwiZGV2aWNlU2VydmljZTpkZXZpY2VcIiwgXCJwYXJhbXNcIjoge1widGVtcGVyYXR1cmVcIjogMjYuNX19IiwgImluY2x1ZGVFcnJvckJyYW5jaCI6IHRydWUsICJicmFuY2hlcyI6IFt7InR5cGUiOiAiY29tbWFuZC1zdXBwb3J0IiwgImFsaWFzIjogImRldmljZUluZm9DbWQiLCAib3V0cHV0QWxpYXMiOiAiZGV2aWNlIiwgIm1hcHBpbmciOiB7ImRldmljZSI6ICIke2RldmljZUluZm9DbWR9In0sICJjb25maWciOiB7InNvdXJjZSI6ICJmaXhlZCIsICJzZXJ2aWNlSWQiOiAiZGV2aWNlU2VydmljZTpkZXZpY2UiLCAiY29tbWFuZCI6ICJRdWVyeUJ5SWQiLCAicGFyYW1ldGVyIjogIntcImlkXCI6IFwiXCJ9In19LCB7InR5cGUiOiAiY29tbWFuZC1zdXBwb3J0IiwgImFsaWFzIjogImV4ZWNDbWQiLCAib3V0cHV0QWxpYXMiOiAicmVzdWx0IiwgIm1hcHBpbmciOiB7InJlc3VsdCI6ICIke2V4ZWNDbWR9In0sICJzb3VyY2VDb25maWciOiB7InNvdXJjZSI6ICJ1cHN0cmVhbSJ9fV19XSwgIm9wIjogImluc2VydC1jb21wb3NpdGlvbiJ9XQ==',
    'base64',
  ).toString('utf8');
  assert.equal(a23.length, 742);
  let called = false;
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
    called = true;
    return { ok: false, success: false, code: 'should-not-run' };
  }, 'unversioned', emptyCanvasContext);
  const result = await definition.execute({
    flowMode: 'request-response',
    completion: { mode: 'complete-topology' },
    steps: a23,
  }, {}, {} as any) as Record<string, unknown>;
  assert.equal(called, false);
  assert.equal(result.code, 'rule_editor.canvas_plan.invalid_arguments');
  assert.equal(result.retryable, false);
  assert.equal(result.validationPath, '/steps');
  assert.equal(result.expectedType, 'array');
  assert.equal(result.message, BROKEN_CANVAS_STEPS_INSTRUCTION);
  assert.equal(result.instruction, BROKEN_CANVAS_STEPS_INSTRUCTION);
});

test('R1 preserves structured composition plans without composition projection', async () => {
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return { ok: false, success: false, code: 'unchanged' };
  });
  const structured = {
    flowMode: 'request-response',
    compositionId: 'zip:rule-input>zip-input>zip-output>rule-output',
    steps: [
      { op: 'edit-node', node: 'branch1Adapter', config: { name: 'stage38-adapter' } },
      { op: 'layout', nodes: ['zipIn'] },
    ],
  };
  await definition.execute(structured, {}, {} as any);
  assert.equal(captured.args.compositionId, structured.compositionId);
  assert.equal(captured.args.steps.length, structured.steps.length);
  assert.deepEqual(captured.args.steps[0].node, { kind: 'alias', value: 'branch1Adapter' });
  assert.deepEqual(captured.args.steps[1].nodes, [{ kind: 'alias', value: 'zipIn' }]);
  const rejected = await definition.execute({ ...structured, steps: '[{"op":' }, {}, {} as any) as Record<string, unknown>;
  assert.equal(rejected.validationPath, '/steps');
  assert.equal(captured.args.compositionId, structured.compositionId);
});

test('R1 rejects string steps even when a composition id appears in config', async () => {
  let called = false;
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    called = true;
    captured.args = args;
    return { ok: false, success: false, code: 'unchanged' };
  }, 'unversioned', emptyCanvasContext);
  const steps = [{
    op: 'insert-node',
    nodeType: 'sql',
    alias: 'query',
    config: {
      sql: 'select 1',
      compositionId: 'zip:rule-input>zip-input>zip-output>rule-output',
    },
  }];
  const stringResult = await definition.execute({
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps: JSON.stringify(steps),
  }, {}, {} as any) as Record<string, unknown>;
  assert.equal(called, false);
  assert.equal(stringResult.validationPath, '/steps');

  await definition.execute({
    flowMode: 'realtime-stream',
    completion: { mode: 'partial-draft' },
    steps,
  }, {}, {} as any);
  assert.equal(called, true);
  assert.deepEqual(captured.args.steps, steps);
});

test('mixed remote tools keep apply first without reordering sibling reads', () => {
  const ordered = orderRuleEditorRemoteTools([
    { id: 'rule_editor_get_context' },
    { id: '' },
    { id: 'rule_editor_list_nodes' },
    { id: 'rule_editor_apply_canvas_actions' },
    { id: PREPARE_CANVAS_TOOL_ID },
    { id: 'rule_editor_validate_flow' },
  ]);

  assert.deepEqual(ordered.map((tool) => tool.id), [
    PREPARE_CANVAS_TOOL_ID,
    'rule_editor_apply_canvas_actions',
    'rule_editor_get_context',
    'rule_editor_list_nodes',
    'rule_editor_validate_flow',
  ]);
});

test('prepared handle arguments bypass inline-plan coercion and reject mixed raw fields', async () => {
  const captured: Record<string, any> = {};
  const definition = toRuleEditorClientToolDefinition(applyTool(), async (_toolId, args) => {
    captured.args = args;
    return { ok: false, success: false, code: 'unchanged' };
  });
  await definition.execute({ preparedPlanId: 'prepared-1', planDigest: 'fnv1a-1' }, {}, {} as any);
  assert.deepEqual(captured.args, { preparedPlanId: 'prepared-1', planDigest: 'fnv1a-1' });
  const invalid = await definition.execute({ preparedPlanId: 'prepared-1', steps: [] }, {}, {} as any) as Record<string, unknown>;
  assert.equal(invalid.code, 'rule_editor.canvas_plan.invalid_arguments');
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

  assert.equal(result.evidence.resultStatus, 'partial');
  assert.deepEqual(result.evidence.facts, {
    flowMode: 'realtime-stream',
    completionMode: 'complete-topology',
    topologySatisfied: true,
    mutationStatus: 'applied',
    verification: {
      topology: { status: 'pass' },
      configuration: { status: 'unknown' },
      bindings: { status: 'unknown' },
      execution: { status: 'unknown' },
    },
    taskProgress: {
      requiredChecks: ['topology', 'configuration', 'bindings'],
      satisfied: false,
      unresolved: [
        {
          code: 'task-progress-unavailable',
          message: 'This write receipt has no configuration or binding completion evidence.',
        },
        {
          code: 'configuration-not-verified',
          message: 'configuration has not passed for the current target.',
        },
        {
          code: 'bindings-not-verified',
          message: 'bindings has not passed for the current target.',
        },
      ],
    },
    sourceCount: 1,
    terminalCount: 1,
    canvasRevision: 7,
    rolledBack: false,
    validationIssueCount: 0,
    topologyNodeCount: 2,
    topologyLinkCount: 1,
  });
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(result.presentation, undefined);
  assert.equal(result.evidence.facts.topologyDiagramAvailable, undefined);
  assert.equal(JSON.stringify(result).includes('flowchart LR'), false);
  assert.equal(result.outputBindings[0].name, 'canvas-changes');
  assert.equal(result.outputBindings[0].recordCount, 1);
  assert.equal(result.outputBindings[0].shape, 'rule-editor.canvas-changes');
  assert.equal(result.outputBindings.length, 1);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
});

test('topology-only complete-topology success does not emit a flowchart card', async () => {
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
  const iframeResult = {
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
  };
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => iframeResult);

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(Object.hasOwn(iframeResult, 'presentation'), false);
  assert.equal(iframeResult.topology, topology);
  assert.equal(result.presentation, undefined);
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(result.topology, undefined);
  assert.equal(result.evidence.facts.topologyNodeCount, 2);
  assert.equal(result.evidence.facts.topologyLinkCount, 1);
  assert.notEqual(result.evidence.facts.topologyDiagramAvailable, true);
  assert.equal(result.outputBindings[0].name, 'canvas-changes');
  assert.equal(result.outputBindings.length, 1);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
  assert.equal(JSON.stringify(result).includes('flowchart'), false);
});

test('model-facing apply success omits executor dumps that would poison terminal narrative', async () => {
  const poisonUrl = 'http://example.test/hooks/transform';
  const poisonSource = 'return { payload: msg, contentType: "application/json" };';
  const iframeResult = {
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
    complete: true,
    resultStatus: 'completed',
    changes: [{
      kind: 'node-inserted',
      nodeId: 'node-1',
      nodeType: 'function',
      url: poisonUrl,
      func: poisonSource,
    }],
    topology: {
      contract: 'rule-editor.topology-snapshot/v1',
      complete: true,
      truncated: false,
      nodeCount: 2,
      linkCount: 1,
      nodes: [
        { key: 'n1', label: 'Transform', type: 'function', source: true, terminal: false, url: poisonUrl },
        { key: 'n2', label: 'Sink', type: 'sink', source: false, terminal: true },
      ],
      links: [{ source: 'n1', target: 'n2', sourcePort: 0 }],
    },
    validation: {
      issueCount: 0,
      truncated: false,
      issues: [{ code: 'ok', message: 'noop', func: poisonSource, url: poisonUrl }],
    },
    canvasRevision: 10,
    rolledBack: false,
    instruction: '建议摘要：草稿已写入，尚未保存或发布。 终答只复述该建议摘要。不要再调用工具。',
    total: 3,
    results: [{
      index: 0,
      op: 'insert-node',
      result: {
        ok: true,
        node: {
          id: 'node-1',
          type: 'function',
          func: poisonSource,
          url: poisonUrl,
          workspaceId: 'workspace-dump',
        },
      },
    }],
    configApplications: [{
      index: 0,
      op: 'insert-node',
      nodeId: 'node-1',
      requestedConfigFields: ['url', 'func'],
      changedFields: ['url', 'func'],
      appliedConfig: {
        url: poisonUrl,
        func: poisonSource,
      },
    }],
  };
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => iframeResult);

  const result = await definition.execute({}, {}, {} as any);
  const serialized = JSON.stringify(result);

  assert.equal(result.results, undefined);
  assert.equal(result.configApplications, undefined);
  assert.equal(result.total, undefined);
  assert.equal(Object.hasOwn(result, 'results'), false);
  assert.equal(Object.hasOwn(result, 'configApplications'), false);
  assert.equal(serialized.includes(poisonUrl), false);
  assert.equal(serialized.includes(poisonSource), false);
  assert.equal(iframeResult.results[0].result.node.func, poisonSource);
  assert.equal(iframeResult.configApplications[0].appliedConfig.url, poisonUrl);
  assert.equal(iframeResult.changes[0].url, poisonUrl);
  assert.equal(iframeResult.topology.nodes[0].url, poisonUrl);
  assert.equal(iframeResult.topology.nodes[0].label, 'Transform');
  assert.deepEqual(result.changes, [{ kind: 'node-inserted', nodeType: 'function' }]);
  assert.equal(Object.hasOwn(result.changes[0], 'nodeId'), false);
  assert.deepEqual(result.completion, {
    mode: 'complete-topology',
    satisfied: true,
    sourceCount: 1,
    terminalCount: 1,
  });
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(result.topology, undefined);
  assert.equal(serialized.includes('"label":"Transform"'), false);
  assert.equal(serialized.includes('"label":"Sink"'), false);
  assert.deepEqual(result.validation, { issueCount: 0, truncated: false, issues: [{ code: 'ok', message: 'noop' }] });
  assert.equal(result.canvasRevision, 10);
  assert.equal(result.presentation, undefined);
  assert.equal(result.evidence.resultStatus, 'partial');
  assert.equal(result.evidence.facts.topologyNodeCount, 2);
  assert.equal(result.evidence.facts.topologyLinkCount, 1);
  assert.notEqual(result.evidence.facts.topologyDiagramAvailable, true);
  assert.equal(result.outputBindings[0].name, 'canvas-changes');
  assert.equal(result.outputBindings.length, 1);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
  assert.equal(serialized.includes('flowchart'), false);
  assert.equal(result.evidence.claims[0].id, 'suggested-summary');
  assert.equal(result.evidence.claims[0].binding, 'canvas-changes');
  assert.equal(result.evidence.claims[0].visibility, 'user');
  assert.equal(result.evidence.claims[0].role, 'summary');
  assert.equal(result.evidence.claims[0].label, '规则草稿');
  assert.equal(
    String(result.evidence.claims[0].value),
    '已把草稿写到当前画布，尚未保存或发布。尚未完成：配置、绑定。',
  );
  assert.equal(String(result.evidence.claims[0].value).includes('建议摘要'), false);
  assert.equal(String(result.evidence.claims[0].value).includes('终答只复述'), false);
  assert.equal(String(result.evidence.claims[0].value).includes('不要再调用工具'), false);
  assert.equal(result.instruction, iframeResult.instruction);
  assert.notEqual(result.instruction, result.evidence.claims[0].value);
  assert.equal((result.evidence as { instruction?: string }).instruction, result.instruction);
  assert.equal(String((result.evidence as { instruction?: string }).instruction || '').includes('://'), false);
});

test('three-node complete-topology snapshot stays canvas-changes only', async () => {
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

  assert.equal(result.presentation, undefined);
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(JSON.stringify(result).includes('"label":"订阅属性上报"'), false);
  assert.equal(JSON.stringify(result).includes('flowchart'), false);
  assert.equal(result.evidence.facts.topologyNodeCount, 3);
  assert.equal(result.evidence.facts.topologyLinkCount, 2);
  assert.notEqual(result.evidence.facts.topologyDiagramAvailable, true);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
  assert.equal(result.changes.every((change: { nodeId?: unknown }) => !Object.hasOwn(change, 'nodeId')), true);
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

  assert.equal(result.evidence.resultStatus, 'partial');
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(result.presentation, undefined);
  assert.equal(result.evidence.facts.topologyNodeCount, 1);
  assert.equal(result.evidence.facts.topologyLinkCount, 0);
  assert.notEqual(result.evidence.facts.topologyDiagramAvailable, true);
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

test('large complete-topology stays canvas-changes only instead of failing a successful apply', async () => {
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

  assert.equal(result.evidence.resultStatus, 'partial');
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(result.presentation, undefined);
  assert.equal(result.evidence.facts.topologyNodeCount, nodeCount);
  assert.equal(result.evidence.facts.topologyLinkCount, links.length);
  assert.notEqual(result.evidence.facts.topologyDiagramAvailable, true);
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
  assert.notEqual(result.evidence.facts.topologyDiagramAvailable, true);
  assert.equal(result.presentation, undefined);
  assert.equal(Object.hasOwn(result, 'topology'), false);
  assert.equal(result.outputBindings.some((binding: { name: string }) => binding.name === 'topology-diagram'), false);
});

test('partial draft completes when its configuration and binding checks pass', async () => {
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
    canvasRevision: 8,
    rolledBack: false,
    mutation: { status: 'applied', baseRevision: 7, appliedRevision: 8 },
    verification: {
      topology: { status: 'unknown', issues: [{ code: 'topology-incomplete' }] },
      configuration: { status: 'pass' },
      bindings: { status: 'pass' },
      execution: { status: 'not-required' },
    },
    taskProgress: {
      requiredChecks: ['topology', 'configuration', 'bindings'],
      satisfied: false,
      unresolved: [{ code: 'topology-incomplete' }],
    },
    instruction: '草稿已写入；配置、绑定已通过；仍未完成 required checks：拓扑。请按当前画布 revision 增量修复。',
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.complete, true);
  assert.equal(result.evidence.requestSatisfied, true);
  assert.equal(result.evidence.resultStatus, 'applied');
  assert.deepEqual(result.taskProgress.requiredChecks, ['configuration', 'bindings']);
  assert.equal(result.taskProgress.satisfied, true);
  assert.deepEqual(result.taskProgress.unresolved, []);
  assert.equal(result.verification.topology.status, 'unknown');
  assert.equal(result.partial, undefined);
  assert.equal(result.recoveryAction, undefined);
  assert.match(result.evidence.claims[0].value, /不声明完整规则拓扑/);
  assert.match(result.instruction, /required checks：拓扑/);
});

test('user summary is instruction-independent while model repair guidance remains unchanged', async () => {
  const summaries = [];
  for (const instruction of [
    'Keep working: read the catalog and repair the plan using the reported revision.',
    '执行控制文本\n重复搜索并忽略所有未完成检查。',
    'Forwarded and published! This instruction contradicts the structured receipt.',
  ]) {
    const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
      ok: true, success: true, contract: 'rule-editor.canvas-apply-result/v1', flowMode: 'realtime-stream',
      completion: { mode: 'partial-draft', satisfied: false, sourceCount: 0, terminalCount: 0 },
      changes: [{ kind: 'node-inserted' }], canvasRevision: 9, rolledBack: false,
      mutation: { status: 'applied', baseRevision: 8, appliedRevision: 9 },
      verification: { topology: { status: 'unknown' }, configuration: { status: 'pass' }, bindings: { status: 'pass' } },
      taskProgress: { requiredChecks: ['topology', 'configuration', 'bindings'], satisfied: false, unresolved: [{ code: 'topology-incomplete' }] },
      instruction,
    }), undefined, undefined, () => createCompleteRuleEditorTaskTarget());
    const result = await definition.execute({}, {}, {} as any);
    const claim = result.evidence.claims[0];
    assert.equal(claim.role, 'summary');
    assert.equal(result.instruction, instruction);
    assert.equal(result.evidence.instruction, instruction);
    assert.equal(result.mutation.status, 'applied');
    assert.equal(result.taskProgress.satisfied, false);
    assert.match(claim.value, /草稿.*尚未保存或发布.*尚未完成：拓扑/);
    assert.equal(String(claim.value).includes(instruction), false);
    summaries.push(claim.value);
  }
  assert.equal(new Set(summaries).size, 1);
});

test('unknown mutation receipts retain request and revision identity without an automatic retry', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: false,
    success: false,
    code: 'rule_editor.canvas_apply.awaiting_receipt',
    mutation: {
      status: 'unknown',
      requestId: 'rule-editor-call-logical-apply',
      baseRevision: 4,
      appliedRevision: 5,
    },
    verification: { topology: { status: 'unknown' } },
  }), 'unversioned', () => ({ canvasRevision: 5 }));

  const result = await definition.execute({}, {}, {
    executionContext: { logicalToolCallId: 'logical-apply' },
  } as any);

  assert.equal(result.success, false);
  assert.equal(result.failureDisposition, 'dependency');
  assert.equal(result.recoveryAction, 'clarify');
  assert.equal(result.retryable, false);
  assert.equal(result.resultStatus, 'unknown');
  assert.equal(result.mutation.status, 'unknown');
  assert.equal(result.mutation.requestId, 'rule-editor-call-logical-apply');
  assert.equal(result.mutation.baseRevision, 4);
  assert.equal(result.mutation.appliedRevision, 5);
  assert.equal(result.complete, false);
  assert.equal(result.requestSatisfied, false);
});

test('bridge timeout returns mutation unknown with a transport id that retains the logical id', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
    const error = new Error('timeout');
    error.name = 'RuleEditorBridgeTimeout';
    throw error;
  }, 'unversioned', () => ({ canvasRevision: 8 }));

  const result = await definition.execute({}, {}, {
    executionContext: { logicalToolCallId: 'logical-timeout', expectedRevision: 7 },
  } as any);

  assert.equal(result.success, false);
  assert.equal(result.resultStatus, 'unknown');
  assert.equal(result.mutation.status, 'unknown');
  assert.match(result.mutation.requestId, /^rule-editor-request-logical-timeout-/);
  assert.equal(result.mutation.baseRevision, 7);
  assert.equal(result.retryable, false);
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

test('composition unknown config is bounded as a canvas-plan repair without claiming a partial write', async () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({
    ok: false,
    success: false,
    code: 'rule_editor.canvas_plan.preflight_failed',
    failureDisposition: 'request',
    recoveryAction: 'repair',
    livenessSignal: 'typed-admission-stagnation',
    issues: [{
      path: '/steps/0/slots/branches/1/config/commandName',
      code: 'unknown-config-field',
      message: 'untrusted owner detail',
      owner: 'device-message-sender',
      writableKeys: ['from', 'message'],
      config: { password: 'not model facing' },
    }, {
      path: '/steps/0/slots/branches/1/input',
      code: 'device-message-schema-unavailable',
      message: 'this is a different issue, not an unknown field',
    }],
  }));
  const result = await definition.execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(result.ok, false);
  assert.equal(result.code, 'rule_editor.node_config.unknown_fields');
  assert.equal(result.recoveryAction, 'repair');
  assert.equal(result.livenessSignal, 'typed-admission-stagnation');
  assert.deepEqual(result.issues, [{
    path: '/steps/0/slots/branches/1/config/commandName',
    code: 'unknown-config-field',
    message: 'configuration field is not declared writable by the node owner',
    owner: 'device-message-sender',
    writableKeys: ['from', 'message'],
  }]);
  assert.deepEqual(result.repair, {
    field: '/steps/0/slots/branches/1/config/commandName',
    repairPaths: ['/steps/0/slots/branches/1/config/commandName'],
    preserveArguments: ['flowMode', 'completion', 'steps'],
    maxAttempts: 1,
  });
  assert.equal(result.partial, undefined);
  assert.equal(JSON.stringify(result).includes('password'), false);
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

  const wrappedDefinition = toRuleEditorClientToolDefinition(remote, async () => ({ ok: false, message: 'bridge down' }), 'unversioned', emptyCanvasContext);
  const wrapped = await wrappedDefinition.execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(wrapped.ok, false);
  assert.equal(wrapped.success, false);
  assert.equal(wrapped.code, 'rule_editor.remote.failed');
  assert.equal(wrapped.message, 'bridge down');
  assert.equal(wrapped.failureDisposition, 'request');
  assert.equal(wrapped.recoveryAction, 'repair');
  assert.equal(wrapped.retryable, false);
  assert.equal(wrapped.instruction, undefined);

  const errorFieldDefinition = toRuleEditorClientToolDefinition(remote, async () => ({ ok: false, error: 'missing node' }));
  assert.equal((await errorFieldDefinition.execute({}, {}, {} as any)).message, 'missing node');

  const thrownDefinition = toRuleEditorClientToolDefinition(remote, async () => {
    throw new Error('iframe crashed');
  }, 'unversioned', emptyCanvasContext);
  const thrown = await thrownDefinition.execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(thrown.ok, false);
  assert.equal(thrown.success, false);
  assert.equal(thrown.code, 'rule_editor.remote.failed');
  assert.equal(thrown.message, 'iframe crashed');
  assert.equal(thrown.failureDisposition, 'request');
  assert.equal(thrown.recoveryAction, 'repair');
  assert.equal(thrown.retryable, false);
  assert.equal(thrown.instruction, undefined);

  const unknownThrowDefinition = toRuleEditorClientToolDefinition(remote, async () => {
    throw 'boom';
  });
  assert.equal((await unknownThrowDefinition.execute({}, {}, {} as any)).message, 'rule editor tool failed');

  const invalidDefinition = toRuleEditorClientToolDefinition(remote, async () => 'not-an-object', 'unversioned', emptyCanvasContext);
  const invalid = await invalidDefinition.execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(invalid.code, 'rule_editor.remote.invalid_result');
  assert.equal(invalid.failureDisposition, 'request');
  assert.equal(invalid.recoveryAction, 'repair');
  assert.equal(invalid.instruction, undefined);

  const leftoverToolDisposition = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: false,
    code: 'rule_editor.remote.failed',
    failureDisposition: 'tool',
    recoveryAction: 'terminal',
  }), 'unversioned', emptyCanvasContext).execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(leftoverToolDisposition.failureDisposition, 'request');
  assert.equal(leftoverToolDisposition.recoveryAction, 'repair');
  assert.equal(leftoverToolDisposition.instruction, undefined);

  const applyThrown = toRuleEditorClientToolDefinition(applyTool(), async () => {
    throw new Error('apply bridge down');
  });
  const applyThrownResult = await applyThrown.execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(applyThrownResult.code, 'rule_editor.canvas_apply.unknown');
  assert.equal(applyThrownResult.failureDisposition, 'dependency');
  assert.equal(applyThrownResult.recoveryAction, 'clarify');
  assert.equal((applyThrownResult.mutation as { status: string }).status, 'unknown');

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

test('direct writes receive conservative R1 evidence even without an iframe receipt', async () => {
  const remote = {
    id: 'rule_editor_insert_node',
    name: 'insert',
    write: true,
  } satisfies RemoteRuleEditorToolDefinition;
  const payload = { ok: true, nodeId: 'n1' };
  const definition = toRuleEditorClientToolDefinition(remote, async () => payload);

  assert.equal(definition.routing, undefined);
  assert.equal(definition._meta?.clientToolContract, undefined);
  const result = await definition.execute({}, {}, {} as any);
  assert.equal(result.success, true);
  assert.equal(result.nodeId, 'n1');
  assert.equal(result.mutation.status, 'applied');
  assert.equal(result.complete, false);
  assert.equal(result.requestSatisfied, false);
  assert.equal(result.resultStatus, 'partial');
  const thrown = await toRuleEditorClientToolDefinition(remote, async () => {
    throw new Error('write failed');
  }).execute({}, {}, {
    executionContext: { logicalToolCallId: 'write-call-1' },
  } as any);
  assert.equal(thrown.success, false);
  assert.equal(thrown.code, 'rule_editor.canvas_write.unknown');
  assert.equal(thrown.failureDisposition, 'dependency');
  assert.equal(thrown.recoveryAction, 'clarify');
  assert.equal(thrown.retryable, false);
  assert.equal(thrown.mutation.status, 'unknown');
  assert.match(thrown.mutation.requestId, /^rule-editor-request-write-call-1-/);
});

test('direct delete preserves its write effect but remains partial when checks are unresolved', async () => {
  const definition = toRuleEditorClientToolDefinition({
    id: 'rule_editor_delete_node',
    name: 'delete',
    write: true,
  }, async () => ({
    ok: true,
    nodeId: 'n1',
    nodeIds: ['n1', 'n2'],
    canvasRevision: 9,
    mutation: { status: 'applied', baseRevision: 8, appliedRevision: 9 },
    changes: [{ kind: 'node-updated', nodeId: 'n1', config: { credential: 'secret' }, script: 'return secret' }],
    verification: {
      topology: { status: 'pass' },
      configuration: { status: 'unknown' },
      bindings: { status: 'unknown' },
      execution: { status: 'not-required' },
    },
    taskProgress: {
      requiredChecks: ['topology', 'configuration', 'bindings'],
      satisfied: false,
      unresolved: [{ code: 'script-binding-unverified' }],
    },
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.success, true);
  assert.equal(result.mutation.status, 'applied');
  assert.equal(result.complete, false);
  assert.equal(result.requestSatisfied, false);
  assert.equal(result.resultStatus, 'partial');
  assert.equal(result.evidence.facts.taskProgress.satisfied, false);
  assert.equal(result.evidence.facts.canvasRevision, 9);
  assert.equal(result.evidence.facts.baseRevision, 8);
  assert.equal(result.evidence.facts.appliedRevision, 9);
  assert.equal(result.evidence.facts.writtenChangeCount, 1);
  assert.deepEqual(result.evidence.facts.writtenNodeIds, ['n1', 'n2']);
  assert.equal(JSON.stringify(result.evidence.facts).includes('secret'), false);
  assert.equal(JSON.stringify(result.evidence.facts).includes('return secret'), false);
  assert.match(String(result.instruction), /配置、绑定/);
  assert.equal(String(result.instruction).includes('拓扑'), false);
  assert.equal(result.evidence.instruction, result.instruction);
  assert.equal(result.evidence.continuation, undefined);
  assert.equal(result.continuation, undefined);
  assert.equal(result.recoveryAction, 'repair');
});

test('direct edit can satisfy the configured target after verification passes', async () => {
  const definition = toRuleEditorClientToolDefinition({
    id: 'rule_editor_edit_node',
    name: 'edit',
    write: true,
  }, async () => ({
    ok: true,
    canvasRevision: 10,
    mutation: { status: 'applied', requestId: 'write-1', appliedRevision: 10 },
    verification: {
      topology: { status: 'pass' },
      configuration: { status: 'pass' },
      bindings: { status: 'pass' },
      execution: { status: 'not-required' },
    },
    taskProgress: { requiredChecks: ['topology'], satisfied: true, unresolved: [] },
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.success, true);
  assert.equal(result.complete, true);
  assert.equal(result.requestSatisfied, true);
  assert.equal(result.resultStatus, 'applied');
  assert.deepEqual(result.taskProgress.requiredChecks, ['configuration', 'bindings']);
  assert.equal(result.evidence.facts.taskProgress.satisfied, true);
});

test('task progress never projects satisfied alongside unresolved issues', async () => {
  const definition = toRuleEditorClientToolDefinition({
    id: 'rule_editor_edit_node',
    name: 'edit',
    write: true,
  }, async () => ({
    ok: true,
    canvasRevision: 10,
    mutation: { status: 'applied', appliedRevision: 10 },
    verification: {
      topology: { status: 'pass' },
      configuration: { status: 'pass' },
      bindings: { status: 'pass' },
      execution: { status: 'not-required' },
    },
    taskProgress: {
      requiredChecks: ['topology'],
      satisfied: true,
      unresolved: [{ code: 'stale-iframe-issue' }],
    },
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.taskProgress.satisfied, true);
  assert.deepEqual(result.taskProgress.unresolved, []);
  assert.equal(result.complete, true);
  assert.equal(result.requestSatisfied, true);
});

test('stale direct write receipt preserves the committed mutation but expires checks', async () => {
  const definition = toRuleEditorClientToolDefinition({
    id: 'rule_editor_edit_node',
    name: 'edit',
    write: true,
  }, async () => ({
    ok: true,
    canvasRevision: 5,
    mutation: {
      status: 'applied',
      requestId: 'write-older-receipt',
      baseRevision: 3,
      appliedRevision: 4,
    },
    verification: {
      topology: { status: 'pass' },
      configuration: { status: 'pass' },
      bindings: { status: 'pass' },
      execution: { status: 'not-required' },
    },
  }));

  const result = await definition.execute({}, {}, {} as any);

  assert.equal(result.success, true);
  assert.equal(result.mutation.status, 'applied');
  assert.equal(result.mutation.requestId, 'write-older-receipt');
  assert.equal(result.mutation.appliedRevision, 4);
  assert.equal(result.canvasRevision, 5);
  assert.equal(result.verification.topology.status, 'unknown');
  assert.equal(result.verification.configuration.status, 'unknown');
  assert.equal(result.verification.bindings.status, 'unknown');
  assert.equal(result.verification.execution.status, 'not-required');
  assert.equal(result.complete, false);
  assert.equal(result.requestSatisfied, false);
  assert.equal(result.resultStatus, 'partial');
  assert.equal(result.evidence.facts.canvasRevision, 5);
  assert.equal(result.evidence.facts.baseRevision, 3);
  assert.equal(result.evidence.facts.appliedRevision, 4);
  assert.equal(result.taskProgress.unresolved.some((issue: { code?: string }) => issue.code === 'configuration-not-verified'), true);
});

test('unknown config failures project bounded actionable iframe diagnostics', async () => {
  const remote = {
    id: 'rule_editor_edit_node',
    name: 'edit',
    write: true,
  } satisfies RemoteRuleEditorToolDefinition;
  const definition = toRuleEditorClientToolDefinition(remote, async () => ({
    ok: false,
    error: `${'untrusted '.repeat(80)}configuration contains unknown or unsupported fields`,
    livenessSignal: 'typed-admission-stagnation',
    unknownFields: ['message', 'from', 'x'.repeat(256)],
    owner: 'device-message-sender',
    writableKeys: ['message', 'from', 'credential', 'y'.repeat(256)],
    issues: [
      {
        path: '/config/message',
        code: 'unknown-config-field',
        message: 'untrusted detail',
        owner: 'device-message-sender',
        writableKeys: ['message', 'from', 'credential'],
        config: { credential: 'secret' },
      },
      { path: '/config/' + 'z'.repeat(300), owner: 'bad owner!', writableKeys: ['bad key!'] },
    ],
  }));
  const result = await definition.execute({}, {}, {} as any) as Record<string, unknown>;

  assert.equal(result.ok, false);
  assert.equal(result.success, false);
  assert.equal(result.code, 'rule_editor.node_config.unknown_fields');
  assert.equal(result.failureDisposition, 'request');
  assert.equal(result.recoveryAction, 'repair');
  assert.equal(result.livenessSignal, 'typed-admission-stagnation');
  assert.equal(result.retryable, false);
  assert.deepEqual(result.unknownFields, ['message', 'from']);
  assert.equal(result.owner, 'device-message-sender');
  assert.deepEqual(result.writableKeys, ['message', 'from', 'credential']);
  assert.deepEqual(result.issues, [{
    path: '/config/message',
    code: 'unknown-config-field',
    message: 'configuration field is not declared writable by the node owner',
    owner: 'device-message-sender',
    writableKeys: ['message', 'from', 'credential'],
  }, {
    path: '/config/from',
    code: 'unknown-config-field',
    message: 'configuration field is not declared writable by the node owner',
    owner: 'device-message-sender',
    writableKeys: ['message', 'from', 'credential'],
  }]);
  assert.deepEqual(result.repair, {
    field: '/config/message',
    repairPaths: ['/config/message', '/config/from'],
    preserveArguments: ['nodeId', 'config'],
    maxAttempts: 1,
  });
  assert.equal(result.error, 'configuration contains unknown or unsupported fields');
  assert.match(String(result.instruction), /未写入/);
  assert.equal(String(result.instruction).includes('://'), false);
  assert.equal(String(result.instruction).includes('QueryById'), false);
  assert.equal(String(result.instruction).includes('FunctionInvoke'), false);

  const crash = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: false,
    error: 'iframe crashed',
  })).execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(crash.code, 'rule_editor.remote.failed');
  assert.equal(crash.failureDisposition, 'tool');
  assert.equal(crash.recoveryAction, 'terminal');
  assert.equal(crash.retryable, false);

  const misleadingDisposition = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: false,
    code: 'rule_editor.remote.failed',
    failureDisposition: 'tool',
    recoveryAction: 'terminal',
    unknownFields: ['message', 'from'],
  })).execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(misleadingDisposition.code, 'rule_editor.node_config.unknown_fields');
  assert.equal(misleadingDisposition.failureDisposition, 'request');
  assert.equal(misleadingDisposition.recoveryAction, 'repair');
  assert.equal(misleadingDisposition.retryable, false);
  assert.deepEqual(misleadingDisposition.unknownFields, ['message', 'from']);
  assert.deepEqual(misleadingDisposition.repair.repairPaths, ['/config/message', '/config/from']);
  assert.equal(String(misleadingDisposition.instruction).includes('{device,result}'), false);

  const unknownMutation = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: false,
    mutation: { status: 'unknown' },
    effects: { status: 'committed' },
    continuation: { producerId: 'unsupported' },
  })).execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(unknownMutation.success, false);
  assert.equal(unknownMutation.mutation.status, 'unknown');
  assert.equal(Object.hasOwn(unknownMutation, 'effects'), false);
  assert.equal(Object.hasOwn(unknownMutation, 'continuation'), false);

  const malformed = await toRuleEditorClientToolDefinition(remote, async () => ({
    ok: false,
    unknownFields: ['bad key!', 'x'.repeat(256)],
    issues: [{ path: 'not-a-json-pointer', owner: 'bad owner!' }],
  })).execute({}, {}, {} as any) as Record<string, unknown>;
  assert.equal(malformed.code, 'rule_editor.node_config.unknown_fields');
  assert.equal(malformed.repair, undefined);
  assert.equal(malformed.issues, undefined);
  assert.equal(malformed.unknownFields, undefined);
});

test('parent declares a date-stamped v3 resource target for the iframe handshake', () => {
  assert.match(RULE_EDITOR_RESOURCE_VERSION, /^\d{10}$/);
  assert.equal(RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION, 'rule-editor-orchestration/v3');
});

test('remote client-tool adapter declares the editor handshake versions', () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({}));
  assert.equal(definition._meta?.clientToolAdapter?.resourceVersion, RULE_EDITOR_RESOURCE_VERSION);
  assert.equal(
    definition._meta?.clientToolAdapter?.contractVersion,
    RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  );
});

test('R1 rejects string steps identically regardless of canvas occupancy context', async () => {
  const args = {
    flowMode: 'request-response',
    completion: { mode: 'partial-draft' },
    steps: '[{"op":',
  };
  const direct = coerceApplyCanvasPlanArguments(args);
  assert.equal(direct.ok, false);
  if (!direct.ok) {
    assert.equal(direct.field, 'steps');
    assert.equal(direct.instruction, BROKEN_CANVAS_STEPS_INSTRUCTION);
  }

  let called = false;
  for (const canvasContext of [undefined, emptyCanvasContext, () => ({ nodeCount: 3 })]) {
    const definition = toRuleEditorClientToolDefinition(applyTool(), async () => {
      called = true;
      return { ok: true };
    }, 'unversioned', canvasContext);
    const result = await definition.execute(args, {}, {} as any) as Record<string, unknown>;
    assert.equal(result.validationPath, '/steps');
    assert.equal(result.sameArgumentsAllowed, false);
    assert.equal(result.retryable, false);
  }
  assert.equal(called, false);
});

test('rule editor shared catalog exposes only the page-owned readonly evidence tools', () => {
  const expected = [
    'device_instance_search',
    'device_product_search',
    'device_metadata_search',
    'device_model_get',
  ];
  assert.deepEqual([...RULE_EDITOR_SHARED_TOOL_ALLOWLIST].sort(), expected.sort());
  for (const id of expected) {
    assert.equal(EXCLUDED_SHARED_TOOL_IDS.has(id), false, id);
  }
  assert.equal(RULE_EDITOR_SHARED_TOOL_ALLOWLIST.has('device_latest_properties'), false);
  assert.equal(RULE_EDITOR_SHARED_TOOL_ALLOWLIST.has('home_agent_search_capabilities'), false);
  assert.equal(isRuleEditorSharedToolAllowed({
    id: 'device_model_get', annotations: { readOnlyHint: true }, requiresConfirmation: false,
  }), true);
  assert.equal(isRuleEditorSharedToolAllowed({
    id: 'device_model_get', annotations: { readOnlyHint: false }, requiresConfirmation: false,
  }), false);
  assert.equal(isRuleEditorSharedToolAllowed({
    id: 'device_model_get', annotations: { readOnlyHint: true }, requiresConfirmation: true,
  }), false);
  assert.equal(isRuleEditorSharedToolAllowed({
    id: 'device_latest_properties', annotations: { readOnlyHint: true }, requiresConfirmation: false,
  }), false);
  const projectedSearch = projectRuleEditorSharedTool({
    id: 'device_product_search',
    inputs: [
      { id: 'keyword', required: false },
      { id: 'state', required: false },
      { id: 'limit', required: false },
      { id: 'pageIndex', required: false },
    ],
  });
  assert.deepEqual(projectedSearch.inputs, [
    { id: 'keyword', required: true },
    { id: 'limit', required: false },
  ]);
});

test('empty runtime reports translated metadata and structured zero-effect unavailability', async () => {
  const runtime = createEmptyRuleEditorToolRuntime((key) => `translated:${key}`);

  assert.equal(runtime.clientToolsName, 'translated:RuleEditor.agent.toolsName');
  assert.equal(runtime.clientToolsDescription, 'translated:RuleEditor.agent.toolsDescription');
  assert.equal(runtime.clientToolsVersion, 0);
  assert.equal(runtime.getToolHelp?.('unknown' as any), '');
  assert.equal(runtime.getAllToolHelp?.(), '');
  runtime.refreshClientTools();
  const unsubscribe = runtime.subscribeClientTools(() => undefined);
  assert.equal(typeof unsubscribe, 'function');
  unsubscribe();
  runtime.dispose();
  const result = await runtime.handleClientToolCall({} as any);
  assert.equal(result.code, 'rule_editor.bridge.unavailable');
  assert.equal(result.message, 'translated:RuleEditor.bridge.error.notReady');
  assert.equal(result.effectState, 'not-started');
  assert.equal(result.externalExecutionStarted, false);
  assert.equal(result.receipt.effect, 'not-applied');
  assert.equal(result.details.bridge.reason, 'not-initialized');
});

test('transport diagnostics preserve unknown dispatched effects and shared-owner failures', () => {
  const diagnostic = { transport: 'iframe' as const, reason: 'iframe-disposed' as const };
  const error = new RuleEditorBridgeUnavailableError('unavailable', diagnostic, true);
  assert.equal(error.name, 'RuleEditorBridgeUnavailableError');
  assert.equal(error.diagnostic, diagnostic);
  assert.equal(error.externalExecutionStarted, true);
  const unknown = createRuleEditorToolUnavailableResult(key => key, diagnostic, true);
  assert.equal(unknown.effectState, 'unknown');
  assert.equal(unknown.receipt.effect, 'unknown');
  assert.equal(unknown.externalExecutionStarted, true);
  assert.equal(unknown.retryable, false);
  assert.equal(unknown.recoveryAction, 'terminal');
  const shared = createRuleEditorToolUnavailableResult(key => key, {
    transport: 'shared', reason: 'provider-load-failed',
  });
  assert.equal(shared.code, 'rule_editor.shared_tool.unavailable');
  assert.equal(shared.receipt.effect, 'not-applied');
  assert.equal(new RuleEditorBridgeUnavailableError('unavailable', diagnostic).externalExecutionStarted, false);
});

test('client-owned rule profile is the runtime systemPrompt authority', () => {
  const pageSource = readFileSync(resolve(process.cwd(), 'views/Instance/RuleEditor/index.vue'), 'utf8');
  const compactZh = String((zhLang as Record<string, string>)['RuleEditor.agent.system.compact']);
  const compactEn = String((enLang as Record<string, string>)['RuleEditor.agent.system.compact']);

  assert.match(pageSource, /const buildSystemPrompt = \(\) => bridge\.systemPrompt\.value/);
  assert.doesNotMatch(pageSource, /RuleEditor\.agent\.system\.compact/);
  assert.match(compactZh, /兼容占位/);
  assert.match(compactEn, /Compatibility placeholder/);
});

test('explicit flowchart presentation does not create a preferred terminal obligation', () => {
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE, 'flowchart');
  assert.notEqual(RULE_EDITOR_FLOWCHART_PRESENTATION_TYPE, 'mermaid');
  assert.equal(TOPOLOGY_DIAGRAM_SHAPE, 'presentation.flowchart');
  assert.equal(TOPOLOGY_DIAGRAM_SHAPE.startsWith('presentation.'), true);
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION.mediaType, TOPOLOGY_DIAGRAM_MEDIA_TYPE);
  assert.equal(TOPOLOGY_DIAGRAM_MEDIA_TYPE, 'text/vnd.mermaid');
  assert.notEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.mediaType, 'application/vnd.mermaid');
  assert.deepEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.preferredInputShapes, [TOPOLOGY_DIAGRAM_SHAPE]);
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION.preferredInputShapes.includes('diagram.flowchart'), false);
  assert.equal(RULE_EDITOR_FLOWCHART_PRESENTATION.deliveryPolicy, 'explicit');
  assert.deepEqual(RULE_EDITOR_FLOWCHART_PRESENTATION.contentResponsibilities, ['topology', 'process.flow']);
});

test('presentation compatibility text keeps the canvas as the only topology visualization', () => {
  const presentationZh = String((zhLang as Record<string, string>)['RuleEditor.agent.system.presentation']);
  const presentationEn = String((enLang as Record<string, string>)['RuleEditor.agent.system.presentation']);

  for (const text of [presentationZh, presentationEn]) {
    assert.equal(text.includes('topology-diagram'), false);
    assert.equal(text.includes('JSON AnswerSpec'), true);
    assert.equal(text.includes('://'), false);
  }
  assert.match(presentationZh, /画布是唯一拓扑可视化/);
  assert.match(presentationEn, /canvas is the only topology visualization/i);
  assert.match(presentationZh, /流程图卡片/);
  assert.match(presentationEn, /flowchart card/i);
});

test('context-only ticks defer version changes while a tool call is in flight without consuming the digest', () => {
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
  assert.equal(inFlight.digest, first.digest);
  assert.notEqual(inFlight.pendingDigest, first.digest);
});

test('context digest tracks configuration and completion facts without retaining graph scripts', () => {
  const base = createRuleEditorContextDigest({
    canvasRevision: 3,
    nodeCount: 2,
    configurationDigest: 'config-a',
    completionChecks: { topology: 'pass', configuration: 'unknown' },
    nodes: [{ id: 'n1', func: 'secret script' }],
    orchestrationCapabilities: [{
      capabilityId: 'platform.entity.lookup',
      localizedName: { zh: '平台对象查询' },
      localizedDescription: { zh: '内部本地化说明' },
      discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
      effect: 'READ',
      bindingTemplates: [{ secret: 'private template' }],
    }],
  });
  const changedConfig = createRuleEditorContextDigest({
    canvasRevision: 3,
    nodeCount: 2,
    configurationDigest: 'config-b',
    completionChecks: { topology: 'pass', configuration: 'unknown' },
    nodes: [{ id: 'n1', func: 'different script' }],
    orchestrationCapabilities: [{
      capabilityId: 'device.message.send',
      localizedName: { zh: '设备消息发送' },
      localizedDescription: { zh: '发送设备消息' },
      discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
      effect: 'WRITE',
    }],
  });
  assert.notEqual(base, changedConfig);
  assert.match(base, /platform\.entity\.lookup/);
  assert.equal(base.includes('secret script'), false);
  assert.equal(base.includes('内部本地化说明'), true);
  assert.equal(base.includes('private template'), false);
  assert.equal(changedConfig.includes('different script'), false);
});

test('context digest tracks the complete projected capability contract, not only capability ids', () => {
  const first = createRuleEditorContextDigest({
    orchestrationCapabilities: [{
      capabilityId: 'platform.entity.lookup',
      localizedName: { en: 'Entity lookup' },
      localizedDescription: { en: 'Find an entity.' },
      discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
      effect: 'READ',
      outputContract: { kind: 'entity', open: false, uncertain: false, fields: [{ name: 'id', type: 'string', required: true }] },
    }],
  });
  const metadataChanged = createRuleEditorContextDigest({
    orchestrationCapabilities: [{
      capabilityId: 'platform.entity.lookup',
      localizedName: { en: 'Entity lookup' },
      localizedDescription: { en: 'Find one entity by id.' },
      discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
      effect: 'READ',
      outputContract: { kind: 'entity', open: false, uncertain: false, fields: [{ name: 'id', type: 'string', required: true }] },
    }],
  });
  assert.notEqual(metadataChanged, first);
  assert.match(metadataChanged, /Find one entity by id/);
  const bindingPolicyChanged = createRuleEditorContextDigest({
    orchestrationCapabilities: [{
      capabilityId: 'platform.entity.lookup',
      localizedName: { en: 'Entity lookup' },
      localizedDescription: { en: 'Find an entity.' },
      discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
      effect: 'READ',
      outputContract: { kind: 'entity', open: false, uncertain: false, fields: [{ name: 'id', type: 'string', required: true }] },
      bindingPolicy: {
        completeObjectTargets: ['request'],
        acceptedSourceTypes: ['object', 'invocation-parameters'],
        fieldOverrides: true,
      },
    }],
  });
  assert.notEqual(bindingPolicyChanged, first);
  assert.match(bindingPolicyChanged, /completeObjectTargets/);
});

test('task target reductions are isolated to the confirmed response', () => {
  const configured = createConfiguredRuleEditorTaskTarget();
  const complete = createCompleteRuleEditorTaskTarget();
  assert.deepEqual(configured.requiredChecks, ['configuration', 'bindings']);
  const targets = createRuleEditorTaskTargetStore();
  assert.deepEqual(targets.get('turn-1'), complete);
  assert.match(zhLang['RuleEditor.bridge.confirm.configured.content'], /局部草稿/);
  assert.match(enLang['RuleEditor.bridge.confirm.configured.content'], /partial draft/);
  targets.set('turn-1', configured);
  assert.deepEqual(targets.get('turn-1'), configured);
  assert.deepEqual(targets.get('turn-2'), complete);
  targets.clear();
  assert.deepEqual(targets.get('turn-1'), complete);
  const skeleton = { version: 'rule-editor-task-target/v1' as const, requiredChecks: ['topology'] as const };
  const requestedSkeleton = mergeRuleEditorTaskTarget(configured, skeleton);
  assert.deepEqual(requestedSkeleton.requiredChecks, ['topology', 'configuration', 'bindings']);
  const confirmedSkeleton = mergeRuleEditorTaskTarget(configured, skeleton, true);
  assert.deepEqual(confirmedSkeleton.requiredChecks, ['topology']);
  const firstTransportRequestId = createRuleEditorBridgeRequestId('logical-1', 'prepare');
  const secondTransportRequestId = createRuleEditorBridgeRequestId('logical-1', 'execute');
  assert.match(firstTransportRequestId, /^rule-editor-prepare-logical-1-/);
  assert.match(secondTransportRequestId, /^rule-editor-execute-logical-1-/);
  assert.notEqual(firstTransportRequestId, secondTransportRequestId);
});

test('bridge consumes an actual local confirmation callback before its apply call', async () => {
  const configured = createConfiguredRuleEditorTaskTarget();
  const complete = createCompleteRuleEditorTaskTarget();
  assert.equal(normalizeRuleEditorTaskTarget({ version: 'rule-editor-task-target/v1', requiredChecks: [] }), undefined);
  assert.deepEqual(normalizeRuleEditorTaskTarget({
    version: 'rule-editor-task-target/v1',
    requiredChecks: ['configuration'],
  }), { version: 'rule-editor-task-target/v1', requiredChecks: ['configuration'] });

  const call = {
    id: 'client-tool-rpc-1',
    arguments: { targetState: 'skeleton' },
  };
  const request = {
    id: call.id,
    toolId: 'rule_editor_apply_canvas_actions',
    toolName: 'apply canvas',
    title: 'Confirm Skeleton-Only Draft',
    content: 'Create only the current rule topology skeleton.',
    okText: 'Apply Change',
    cancelText: 'Cancel',
    arguments: call.arguments,
  };
  let requestedId = '';
  const confirmed = await requestRuleEditorLocalTargetConfirmation(configured, call, request, async (confirmation) => {
    requestedId = confirmation.id;
    return { approved: true, optionId: 'confirm' };
  });
  assert.equal(requestedId, call.id);
  assert.deepEqual(confirmed.taskTarget.requiredChecks, ['topology']);

  const modelOnly = await requestRuleEditorLocalTargetConfirmation(configured, {
    id: 'client-tool-rpc-2',
    arguments: { targetState: 'skeleton' },
  }, {
    ...request,
    id: 'client-tool-rpc-2',
    arguments: { targetState: 'skeleton' },
  }, async () => undefined);
  assert.deepEqual(modelOnly.taskTarget.requiredChecks, ['configuration', 'bindings']);

  const mismatchedCall = await requestRuleEditorLocalTargetConfirmation(configured, {
    id: 'client-tool-rpc-3',
    arguments: { targetState: 'skeleton' },
  }, {
    ...request,
    id: 'other-call',
    arguments: { targetState: 'skeleton' },
  }, async () => ({ approved: true }));
  assert.deepEqual(mismatchedCall.taskTarget.requiredChecks, ['configuration', 'bindings']);

  const partialCall = {
    id: 'client-tool-rpc-4',
    arguments: { targetState: 'configured', completion: { mode: 'partial-draft' } },
  };
  const confirmedPartial = await requestRuleEditorLocalTargetConfirmation(complete, partialCall, {
    ...request,
    id: partialCall.id,
    arguments: partialCall.arguments,
  }, async () => ({ approved: true }));
  assert.deepEqual(confirmedPartial.taskTarget, configured);

  const unconfirmedPartial = await requestRuleEditorLocalTargetConfirmation(complete, partialCall, {
    ...request,
    id: partialCall.id,
    arguments: partialCall.arguments,
  }, async () => ({ approved: false }));
  assert.deepEqual(unconfirmedPartial.taskTarget, complete);

  const fullPlan = await requestRuleEditorLocalTargetConfirmation(complete, {
    ...partialCall,
    arguments: { targetState: 'configured', completion: { mode: 'complete-topology' } },
  }, {
    ...request,
    id: partialCall.id,
  }, async () => ({ approved: true }));
  assert.deepEqual(fullPlan.taskTarget, complete);
});
