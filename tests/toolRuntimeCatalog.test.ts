import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_CLIENT_TOOL_ROUTING_EXPAND_KEY,
  createAiClientToolCatalogReport,
  normalizeAiClientToolRoutingMetadata,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
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

test('apply tool stays typed after the real core runtime projects routing into expands', () => {
  const definition = toRuleEditorClientToolDefinition(applyTool(), async () => ({}));
  const routing = normalizeAiClientToolRoutingMetadata(definition);
  assert.ok(routing, 'the producer-owned routing contract must survive core validation');
  assert.equal(routing.exposure, 'auto', 'FLAT must expose the editor primary action without route preselection');

  // createAiClientToolRuntime moves validated routing into expands before AgentConversation audits
  // the catalog. This integration probe intentionally uses the workspace core implementation.
  const runtimeDefinition = {
    id: definition.id,
    expands: {
      ...(definition.expands || {}),
      ...(routing ? { [AI_CLIENT_TOOL_ROUTING_EXPAND_KEY]: routing } : {}),
    },
    _meta: definition._meta,
  };
  const report = createAiClientToolCatalogReport([runtimeDefinition], {
    requireRouting: false,
    requireResultBindings: true,
  });

  assert.equal(report.valid, true);
  assert.equal(report.tools[0]?.routingStatus, 'valid');
  assert.equal(report.tools[0]?.contractStatus, 'typed');
  assert.equal(report.summary.malformedContract, 0);
  assert.equal(report.issues.some(issue => issue.code === 'result_binding_unexpected'), false);
});
