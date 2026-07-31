import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyRuleEditorToolRuntime,
  toRuleEditorClientToolDefinition,
  type RemoteRuleEditorToolDefinition,
} from '../views/Instance/RuleEditor/toolRuntime';

const canonicalStepsSchema = {
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
      oneOf: [
        { type: 'object', required: ['mode'], properties: { mode: { const: 'partial-draft' } } },
        {
          type: 'object',
          required: ['mode', 'sources', 'terminals'],
          properties: {
            mode: { const: 'complete-topology' },
            sources: { type: 'array' },
            terminals: { type: 'array' },
          },
        },
      ],
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
  assert.deepEqual(definition.routing?.accepts, ['rule-editor.canvas-plan']);
  assert.equal(definition.routing?.evidencePolicy, 'required');
  assert.deepEqual(definition.routing?.produces, ['canvas-changes', 'topology-diagram']);
  assert.equal(definition._meta?.clientToolContract.outputs[0].kind, 'state-events');
  assert.equal(definition._meta?.clientToolContract.outputs[1].kind, 'artifact');
  assert.equal(definition._meta?.clientToolContract.outputs[1].mediaType, 'application/vnd.mermaid');
  assert.deepEqual(definition.expands?._schema, canonicalPlanSchema);
  assert.equal(definition.inputs?.[0].expands, undefined);
  assert.equal(definition.annotations?.readOnlyHint, false);
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

test('legacy parent fallback keeps a per-input schema when no root schema is declared', () => {
  const tool = applyTool();
  delete tool.expands;
  const definition = toRuleEditorClientToolDefinition(tool, async () => ({}));

  assert.deepEqual(definition.inputs?.[0].expands._schema.items.oneOf, canonicalStepsSchema.items.oneOf);
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
  assert.equal(result.outputBindings[0].shape, 'rule-editor.canvas-change[]');
  assert.equal(result.outputBindings[1].name, 'topology-diagram');
  assert.equal(result.outputBindings[1].mediaType, 'application/vnd.mermaid');
  assert.equal(result.outputBindings[1].path, '$.presentation.mermaid');
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

test('unrelated remote tools keep their original execution contract', async () => {
  const remote = {
    id: 'rule_editor_get_context',
    name: 'context',
    write: false,
    annotations: { idempotentHint: true },
  } satisfies RemoteRuleEditorToolDefinition;
  const payload = { ok: true, canvasRevision: 3 };
  const definition = toRuleEditorClientToolDefinition(remote, async () => payload, 'revision-7');

  assert.equal(definition.routing, undefined);
  assert.equal(definition._meta?.clientToolAdapter?.source, 'rule-editor-iframe');
  assert.equal(definition._meta?.clientToolAdapter?.sourceRevision, 'revision-7');
  assert.equal(definition.annotations?.readOnlyHint, true);
  assert.equal(definition.annotations?.idempotentHint, true);
  assert.equal(await definition.execute({}, {}, {} as any), payload);
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
