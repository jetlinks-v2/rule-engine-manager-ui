import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAiClientToolCatalogReport,
} from '@jetlinks-web-core/layout/components/AiChat/clientToolCatalog';
import {
  AI_CLIENT_TOOL_ROUTING_EXPAND_KEY,
  normalizeAiClientToolRoutingMetadata,
} from '@jetlinks-web-core/layout/components/AiChat/clientToolRouting';
import { createBoundedQueryEvidence } from '../agentCapabilities/alarmAnalysis/alarmAnalysis.shared';
import { createAlarmAnalysisTools } from '../agentCapabilities/alarmAnalysis/tools';
import { createAlarmDashboardTools } from '../views/DashBoard/homeAgentTools';
import { createRuleInstanceTools } from '../views/Instance/homeAgentProvider';

const catalogize = (tool: Record<string, any>) => {
  const routing = normalizeAiClientToolRoutingMetadata(tool);
  return {
    id: tool.id,
    expands: {
      ...(tool.expands || {}),
      ...(routing ? { [AI_CLIENT_TOOL_ROUTING_EXPAND_KEY]: routing } : {}),
    },
    _meta: tool._meta,
  };
};

const reportFor = (tools: readonly Record<string, any>[]) => createAiClientToolCatalogReport(
  tools.map(catalogize),
  {
    requireRouting: false,
    requireResultBindings: true,
  },
);

const toolById = (tools: readonly Record<string, any>[], id: string) => {
  const tool = tools.find((item) => item.id === id);
  assert.ok(tool, id);
  return tool!;
};

test('create draft compiles as a defineClientTool write with state-change producer', () => {
  const tools = createRuleInstanceTools();
  const draft = toolById(tools, 'rule_engine_create_rule_draft');
  assert.equal(draft._meta?.clientToolDefinition?.effect, 'WRITE');
  assert.ok(draft.confirm);
  assert.deepEqual(draft.routing?.produces, ['navigation-receipt']);
  assert.equal(JSON.stringify(draft).includes('nextAction'), false);
  assert.equal(JSON.stringify(draft).includes('replyPolicy'), false);

  const report = reportFor(tools);
  assert.equal(report.tools[0]?.contractStatus, 'typed');
  assert.equal(report.summary.malformedContract, 0);
});

test('alarm analysis trend/rank/overview stay typed with temporal and aligned consumers', () => {
  const tools = createAlarmAnalysisTools();
  const report = reportFor(tools);
  const byId = Object.fromEntries(report.tools.map((item) => [item.toolId, item]));

  ['alarm_get_overview', 'alarm_query_trend', 'alarm_query_rank'].forEach((id) => {
    assert.equal(byId[id]?.contractStatus, 'typed', id);
  });
  assert.equal(report.summary.malformedContract, 0);

  const trend = toolById(tools, 'alarm_query_trend');
  assert.ok(trend.routing?.analyticalCapability);
  assert.ok(trend.routing?.analyticalCapability?.argumentBindings?.some((item: any) => item.semantic === 'temporal'));

  const rank = toolById(tools, 'alarm_query_rank');
  assert.equal(rank.routing?.analyticalCapability?.completeness?.boundedBy?.limitArgument, 'limit');
  assert.ok(rank._meta?.resultBindings?.[0]?.fields?.some((field: any) => (
    field.name === 'id' && (field.role === 'dimension' || field.semanticRole === 'dimension')
  )));

  const detail = toolById(tools, 'alarm_get_record_detail');
  const recordIdConsumer = (detail.routing?.consumerPorts || []).find((item: any) => (
    item.name === 'alarm-record-id'
  ));
  assert.equal(recordIdConsumer?.required, true);
  assert.ok(detail.inputs?.some((item: any) => item.id === 'alarmRecordId' && item.required === true));
});

test('alarm dashboard keeps independent IDs and compiles typed analytical producers', () => {
  const tools = createAlarmDashboardTools();
  const ids = tools.map((item) => item.id);
  assert.deepEqual(ids, [
    'alarm_dashboard_get_overview',
    'alarm_dashboard_get_target_types',
    'alarm_dashboard_get_config_stats',
    'alarm_dashboard_query_records',
    'alarm_dashboard_query_trend',
    'alarm_dashboard_query_rank',
  ]);

  const report = reportFor(tools);
  assert.equal(report.summary.malformedContract, 0);
  ids.forEach((id) => {
    assert.equal(report.tools.find((item) => item.toolId === id)?.contractStatus, 'typed', id);
  });

  const rank = toolById(tools, 'alarm_dashboard_query_rank');
  assert.equal(rank.routing?.analyticalCapability?.completeness?.boundedBy?.limitArgument, 'limit');
  assert.ok(rank._meta?.resultBindings?.[0]?.fields?.some((field: any) => (
    field.name === 'targetId' && (field.role === 'dimension' || field.semanticRole === 'dimension')
  )));
});

test('bounded rank evidence never publishes an unproven population total', () => {
  const evidence = createBoundedQueryEvidence(20, 20);
  assert.equal(evidence.truncated, true);
  assert.equal(evidence.exhaustive, false);
  assert.equal(evidence.supportsAbsenceClaim, false);
  assert.equal(evidence.facts.evidenceWindow.returnedCount, 20);
  assert.equal(evidence.facts.evidenceWindow.requestedLimit, 20);
  assert.equal(evidence.facts.evidenceWindow.exhaustive, false);
  assert.equal(evidence.facts.evidenceWindow.populationCountSupported, false);
  assert.equal(evidence.cardinality.kind, 'preview');
  assert.equal('totalCount' in evidence.cardinality, false);
  assert.equal(JSON.stringify(evidence).includes('"total"'), false);
  assert.equal(JSON.stringify(evidence).includes('totalCount'), false);

  const empty = createBoundedQueryEvidence(0, 10);
  assert.equal(empty.supportsAbsenceClaim, false);
  assert.equal(empty.facts.evidenceWindow.returnedCount, 0);
});
