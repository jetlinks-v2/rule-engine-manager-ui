import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { createAiClientToolCatalogSnapshot } from '@jetlinks-web-core/layout/components/AiChat/clientToolCatalog';
import { createRuleEditorAgentProfile } from '../views/Instance/RuleEditor/ruleEditorAgentProfile';
import {
  RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
  type RuleEditorCapabilityCatalogItem,
} from '../views/Instance/RuleEditor/ruleEditorOrchestrationContracts';
import {
  toRuleEditorClientToolDefinition,
  type RemoteRuleEditorToolDefinition,
} from '../views/Instance/RuleEditor/toolRuntime';
import { APPLY_CANVAS_TOOL_ID, PREPARE_CANVAS_TOOL_ID } from '../views/Instance/RuleEditor/toolRuntimeContracts';

interface CanvasPlanContract {
  getApplyCanvasToolInputs(): RemoteRuleEditorToolDefinition['inputs'];
  getApplyCanvasToolExpands(): NonNullable<RemoteRuleEditorToolDefinition['expands']>;
  getPrepareCanvasToolInputs(): RemoteRuleEditorToolDefinition['inputs'];
  getPrepareCanvasToolExpands(): NonNullable<RemoteRuleEditorToolDefinition['expands']>;
}

// The harness sets cwd to this package even though esbuild runs tests from a temporary directory.
const workspaceRoot = resolve(process.cwd(), '../../..');
const contract: CanvasPlanContract = createRequire(import.meta.url)(resolve(
  workspaceRoot,
  'modules/rule-engine-manager/src/main/resources/static/rule-editor/ai-agent-canvas-plan-contract.js',
));
const fixturePath = resolve(
  workspaceRoot,
  'modules/jetlinks-ai-agent/ai-agent-general/src/test/resources/rule-editor-client-tools.json',
);

// Only the business catalog is synthetic; the profile owns its schema and all effect/routing metadata.
const capabilityCatalog: RuleEditorCapabilityCatalogItem[] = [{
  capabilityId: 'platform.entity.lookup',
  localizedName: { en: 'Entity lookup' },
  localizedDescription: { en: 'Find one entity by a stable reference.' },
  discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
  selectionRequired: true,
  effect: 'READ',
  inputContract: {
    kind: 'invocation-parameters', open: false, uncertain: false,
    fields: [{ name: 'id', type: 'string', required: true }],
  },
  outputContract: {
    kind: 'entity-detail', open: true, uncertain: false,
    fields: [{ name: 'id', type: 'string', required: true }],
  },
}];

const applyRemote: RemoteRuleEditorToolDefinition = {
  id: APPLY_CANVAS_TOOL_ID,
  name: APPLY_CANVAS_TOOL_ID,
  write: true,
  inputs: contract.getApplyCanvasToolInputs(),
  expands: contract.getApplyCanvasToolExpands(),
  output: { type: 'object' },
};
const prepareRemote: RemoteRuleEditorToolDefinition = {
  id: PREPARE_CANVAS_TOOL_ID,
  name: PREPARE_CANVAS_TOOL_ID,
  inputs: contract.getPrepareCanvasToolInputs(),
  expands: contract.getPrepareCanvasToolExpands(),
  output: { type: 'object' },
};
const unexpectedExecution = async (): Promise<never> => {
  throw new Error('Contract export must not execute editor tools');
};
const profile = createRuleEditorAgentProfile({
  executeInternalTool: unexpectedExecution,
  capabilityCatalog,
  remoteTools: [prepareRemote, applyRemote],
  locale: 'en',
});
const snapshot = createAiClientToolCatalogSnapshot(profile.tools, {
  requireRouting: false,
  requireResultBindings: true,
});
const fixture = {
  version: 'rule-editor-client-tools/v1',
  tools: JSON.parse(JSON.stringify(snapshot.wireDefinitions)),
};

// Updates are explicit. Normal runs compare the entire wire payload and fail on contract drift.
if (process.env.RULE_EDITOR_EXPORT_CLIENT_TOOL_FIXTURE === '1') {
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

test('raw iframe apply schema and inputs pass through the real RuleEditor adapter', () => {
  const adapted = toRuleEditorClientToolDefinition(applyRemote, unexpectedExecution);
  assert.deepEqual(adapted.expands?._schema, contract.getApplyCanvasToolExpands()._schema);
  assert.deepEqual(adapted.inputs?.map(input => input.id), applyRemote.inputs?.map(input => input.id));
  assert.equal(adapted.expands?.effect, 'WRITE');
  assert.equal(adapted.annotations?.readOnlyHint, false);
});

test('published profile apply exposes the real structured prepare contract', () => {
  const apply = profile.tools.find(tool => tool.id === APPLY_CANVAS_TOOL_ID);
  assert.ok(apply);
  assert.deepEqual(apply.expands?._schema, contract.getPrepareCanvasToolExpands()._schema);
  assert.deepEqual(apply.inputs?.map(input => input.id), prepareRemote.inputs?.map(input => input.id));
  assert.equal(apply.inputs?.some(input => input.id === 'preparedPlanId' || input.id === 'planDigest'), false);
  assert.equal(typeof apply.prepare, 'function');
  assert.equal(profile.tools.some(tool => tool.id === PREPARE_CANVAS_TOOL_ID), false);
});

test('shared catalog publishes both real schemas and write effects without browser metadata', () => {
  assert.equal(snapshot.report.valid, true, JSON.stringify(snapshot.report.issues));
  assert.equal(snapshot.report.summary.typed, 2);
  assert.deepEqual(snapshot.wireDefinitions.map(tool => tool.id), [RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, APPLY_CANVAS_TOOL_ID]);
  for (const wire of snapshot.wireDefinitions) {
    const source = profile.tools.find(tool => tool.id === wire.id);
    assert.ok(source);
    assert.equal(wire.name, wire.id);
    assert.deepEqual(wire.expands?._schema, source.expands?._schema);
    assert.equal(wire.expands?.effect, 'WRITE');
    assert.equal(wire.annotations?.readOnlyHint, false);
    assert.ok(wire.expands?.['x-ai-routing']);
    for (const key of ['_meta', 'routing', 'execute', 'prepare', 'confirm']) {
      assert.equal(key in wire, false, `${wire.id} leaked ${key}`);
    }
  }
});

test('Java fixture exactly matches the current frontend wire definitions', () => {
  const stored = JSON.parse(readFileSync(fixturePath, 'utf8'));
  assert.deepEqual(stored, fixture,
    'Published client-tool contract changed. Review then regenerate with node scripts/run-agent-tool-tests.mjs --export-client-tool-fixture');
});
