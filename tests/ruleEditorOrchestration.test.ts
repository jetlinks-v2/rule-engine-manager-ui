import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createAiClientToolRuntime,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  RULE_EDITOR_BUILTIN_TOOL_GROUPS,
  RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS,
  createRuleEditorAgentProfile,
} from '../views/Instance/RuleEditor/ruleEditorAgentProfile';
import {
  APPLY_CANVAS_TOOL_ID,
  PREPARE_CANVAS_TOOL_ID,
} from '../views/Instance/RuleEditor/toolRuntimeContracts';
import {
  createCompleteRuleEditorTaskTarget,
  createRuleEditorTaskTargetStore,
} from '../views/Instance/RuleEditor/ruleEditorAgentContext';
import {
  RULE_EDITOR_INSPECT_CANVAS_TOOL_ID,
  RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
  RULE_EDITOR_ORCHESTRATION_PROFILE_ID,
  RULE_EDITOR_RESOLVE_CAPABILITIES_TOOL_ID,
  createRuleCapabilityResolverJsonSchema,
  createRuleGoalJsonSchema,
  parseRuleGoal,
  projectCanvasApplyReceipt,
  projectRuleEditorCapabilityCatalog,
  projectRuleEditorCapabilityCatalogReport,
  type RuleEditorCapabilityCatalogItem,
} from '../views/Instance/RuleEditor/ruleEditorOrchestrationContracts';

const goal = {
  goal: {
    flow: 'request-response' as const,
    inputs: [{ name: 'deviceId', type: 'string' }],
    operations: [{
      intent: 'device.lookup', capabilityRef: 'platform.entity.lookup', candidateRef: 'candidate-session-1',
      bindings: { id: '$input.deviceId' }, output: 'device',
    }],
    output: { device: '$device' },
  },
};

const capabilityCatalog: RuleEditorCapabilityCatalogItem[] = [
  {
    capabilityId: 'platform.entity.lookup',
    localizedName: { zh: '平台对象查询', en: 'Entity lookup' },
    localizedDescription: { zh: '按稳定引用查询平台对象。', en: 'Find one entity by a stable reference.' },
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
  },
  {
    capabilityId: 'platform.event.forward',
    localizedName: { zh: '事件转发', en: 'Event forwarding' },
    localizedDescription: { zh: '将上游事件发送到已声明目标。', en: 'Forward an upstream event to a declared target.' },
    discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
    selectionRequired: false,
    effect: 'WRITE',
  },
];

const profileTool = (
  profile: ReturnType<typeof createRuleEditorAgentProfile>,
  toolId: string,
) => {
  const tool = profile.tools.find(item => item.id === toolId);
  assert.ok(tool);
  return tool;
};

const nativeRemoteTools = [PREPARE_CANVAS_TOOL_ID, ...RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS].map(id => ({
  id,
  name: id,
  description: `Registered ${id}`,
  inputs: [],
  output: { type: 'object' },
  write: id === APPLY_CANVAS_TOOL_ID,
  agentVisible: true,
}));

test('C0 fixture is anonymous and records only the v1 regression shape', () => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/ruleEditorOrchestrationV1Regression.fixture.json'), 'utf8'));
  assert.equal(fixture.sanitized, true);
  assert.equal(fixture.baseline.canvasNodeCount, 0);
  assert.deepEqual(fixture.failures, [
    'mapping-type-mismatch', 'unbounded-service-discovery', 'hidden-tool-next-query',
    'repeated-prepare-no-progress', 'unverified-terminal-summary',
  ]);
});

test('v3 profile publishes business orchestration and the bounded native authoring fallback', () => {
  const profile = createRuleEditorAgentProfile({
    executeInternalTool: async () => ({}), inspectCanvas: true, capabilityCatalog,
    remoteTools: nativeRemoteTools,
  });
  assert.equal(profile.id, RULE_EDITOR_ORCHESTRATION_PROFILE_ID);
  assert.deepEqual(profile.tools.map((tool) => tool.id), [
    RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    RULE_EDITOR_INSPECT_CANVAS_TOOL_ID,
    APPLY_CANVAS_TOOL_ID,
    'rule_editor_list_nodes',
    'rule_editor_get_node_detail',
    'rule_editor_search_node_types',
    'rule_editor_get_node_type_detail',
    'rule_editor_get_node_type_catalog',
    'rule_editor_get_node_type_manual',
    'rule_editor_execute_node_tool',
    'rule_editor_validate_flow',
  ]);
  assert.equal(profile.tools.some(tool => /insert_node|edit_node|delete_node|connect_nodes|layout_nodes/.test(tool.id)), false);
  assert.match(profile.prompt, /进度说明和最终答复使用与用户当前消息相同的语言/);
  assert.match(profile.prompt, /RuleGoal/);
  assert.match(profile.prompt, /不得追加用户没有要求的业务动作/);
  assert.match(profile.prompt, /同时匹配业务语义、effect（READ\/WRITE）和输入契约/);
  assert.match(profile.prompt, /高层编排内部完成有界能力发现/);
  assert.match(profile.prompt, /不要调用或猜测低层 resolver、cursor/);
  assert.match(profile.prompt, /不要求用户理解平台服务/);
  assert.match(profile.prompt, /只询问一个业务问题/);
  assert.match(profile.prompt, /candidateRef 仅用于兼容高层编排明确返回/);
  assert.match(profile.prompt, /稳定 ASCII 符号/);
  assert.match(profile.prompt, /\{"设备列表":"\$devices"\}/);
  assert.match(profile.prompt, /完整请求、消息或业务对象/);
  assert.match(profile.prompt, /不得把完整对象语义降级绑定到某个标量子字段/);
  assert.match(profile.prompt, /open\/uncertain 且没有字段声明时应把用户返回字段整体映射/);
  assert.match(profile.prompt, /serviceId、command、candidateId/);
  assert.match(profile.prompt, /原生节点、查询方言、流处理、转换或聚合/);
  assert.doesNotMatch(profile.prompt, /每轮最多两次/);
  assert.match(profile.prompt, /节点搜索只补未解决角色、空结果或预检明确缺口/);
  assert.match(profile.prompt, /候选只证明业务操作/);
  assert.match(profile.prompt, /configFields、contracts 足够时直接 apply/);
  assert.match(profile.prompt, /按详情中的 catalogs\[\]\.id\/sections 或 manuals\[\]\.id 定向补读/);
  assert.match(profile.prompt, /用户自然语言只是跨语言搜索线索，不是字段 ID/);
  assert.match(profile.prompt, /所有由规则调用方提供的运行时业务参数只需按输入契约引用/);
  assert.match(profile.prompt, /不得拿当前规则 ID 或其它页面 ID 代替参数值去查询资源目录/);
  assert.match(profile.prompt, /别名不能反向充当源字段证据/);
  assert.match(profile.prompt, /rule_editor_get_node_detail 只接受 inspect\/list 返回的真实画布节点 ID/);
  assert.match(profile.prompt, /结合节点类型详情已经足以生成首次计划时不要继续发现/);
  assert.match(profile.prompt, /预检诊断才是补充缺失事实的依据/);
  assert.match(profile.prompt, /仅当回执缺少所需检查或用户明确要求再次诊断时调用 rule_editor_validate_flow/);
  assert.match(profile.prompt, /局部配置使用 partial-draft \+ targetState=configured，不据此宣称完整业务完成/);
  assert.match(profile.prompt, /输出去向尚有业务歧义时先澄清/);
  assert.match(profile.prompt, /根据 owner 契约选择真实入口和终结边界/);
  assert.match(profile.prompt, /请求响应需要调用参数入口和结果返回出口/);
  assert.match(profile.prompt, /不追加无业务作用的透传或日志节点/);
  assert.match(profile.prompt, /nodeTypes\[\]\.type 是计划步骤的节点类型/);
  assert.match(profile.prompt, /必须写入 steps\[\]\.nodeType/);
  assert.match(profile.prompt, /既可使用一个真实 composition，也可使用完整的 insert-node\/connect 计划/);
  assert.match(profile.prompt, /mutation\.status=applied，就必须说明草稿已经修改/);
  assert.match(profile.prompt, /禁止改写成“未执行”或“未产生可验证结果”/);
  assert.match(profile.prompt, /预检失败时只修复诊断明确指出的计划字段/);
  assert.match(profile.prompt, /部分写入且存在可修复缺口/);
  assert.match(profile.prompt, /目标已满足时停止工具调用/);
  assert.match(profile.prompt, /targetState 若需要只能位于计划顶层/);
  assert.match(profile.prompt, /当前画布节点使用 \{kind:"node-id"/);
  assert.match(profile.prompt, /本计划较早插入的节点使用 \{kind:"alias"/);
  assert.match(profile.prompt, /模型不得生成或复制 preparedPlanId、planDigest/);
  assert.match(profile.prompt, /第一句直接说明完成、部分完成、未执行、已回滚或结果未知/);
  assert.match(profile.prompt, /画布是唯一拓扑可视化/);
  assert.match(profile.prompt, /与本次目标无关的既有问题时，明确区分后停止/);
  assert.match(profile.prompt, /不得调用或模拟逐节点 insert、edit、delete、connect、layout/);
  assert.match(profile.prompt, /nativeFallbackRequired 且有可信 nativeCandidates/);
  assert.match(profile.prompt, /按 nextAction 转入原生路径/);
  assert.match(profile.prompt, /保留原始 flowMode 与用户明确要求的业务边界/);
  assert.match(profile.prompt, /复用候选身份与参数\/输出契约/);
  assert.doesNotMatch(profile.prompt, /不再搜索节点或发现 owner metadata/);
  assert.match(profile.prompt, /首个工具使用 rule_editor_orchestrate_goal/);
  assert.match(profile.prompt, /goal\.output 只包含用户明确要求的返回字段/);
  assert.match(profile.prompt, /按需发现缺失角色并读取每个所选类型的 owner 详情/);
  assert.match(profile.prompt, /新增一条独立流程时，不调用 rule_editor_list_nodes 或 rule_editor_get_node_detail/);
  assert.match(profile.prompt, /旧画布保持原样但不进入本轮上下文/);
  assert.match(profile.prompt, /每个所需类型读取一次详情/);
  assert.match(profile.prompt, /serviceId 和 command 必须从同一返回项原样复制/);
  assert.match(profile.prompt, /不得据此翻译、缩写或合成平台标识/);
  assert.match(profile.prompt, /运行时参数由上游构造完整命令 envelope/);
  assert.match(profile.prompt, /命令节点使用 source=upstream/);
  assert.match(profile.prompt, /使用已选项的 detailArguments 直接读完整 schema/);
  assert.match(profile.prompt, /metadataComplete=false 不是完整配置证据/);
  assert.match(profile.prompt, /不换词搜索命令目录/);
  const orchestrate = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  assert.match(orchestrate.description || '', /自然语言业务需求的默认入口/);
  assert.match(
    profileTool(profile, 'rule_editor_search_node_types').description || '',
    /命令候选不等于完整拓扑/,
  );
  assert.equal(profile.tools.some(tool => tool.id === RULE_EDITOR_RESOLVE_CAPABILITIES_TOOL_ID), false);
  assert.deepEqual((orchestrate.expands?._schema as any)?.required, ['goal']);
  assert.equal('mode' in ((orchestrate.expands?._schema as any)?.properties || {}), false);
  assert.match(
    (orchestrate.expands?._schema as any)?.properties?.goal?.properties?.operations?.items
      ?.properties?.discoveryHints?.description,
    /高层编排内部传给 owner metadata resolver/,
  );
  assert.match(
    (orchestrate.expands?._schema as any)?.properties?.goal?.properties?.inputs?.items
      ?.properties?.type?.description,
    /完整请求、消息或业务对象使用 object/,
  );
  assert.deepEqual(
    (orchestrate.expands?._schema as any)?.properties?.goal?.properties?.inputs?.items
      ?.properties?.description,
    { type: 'string', minLength: 1, maxLength: 512 },
  );
  assert.match(
    (orchestrate.expands?._schema as any)?.properties?.goal?.properties?.operations?.items
      ?.properties?.bindings?.description,
    /completeObjectTargets/,
  );
  assert.match(
    (orchestrate.expands?._schema as any)?.properties?.goal?.properties?.output?.description,
    /open\/uncertain 且没有字段声明时引用整个/,
  );
});

test('native node discovery replays real evidence for exact arguments without limiting distinct roles', async () => {
  const searchCalls: Array<{ keyword?: unknown; responseId?: string }> = [];
  let emptyTurnCalls = 0;
  let failedTurnCalls = 0;
  const profile = createRuleEditorAgentProfile({
    executeInternalTool: async (toolId, args, executionContext) => {
      if (toolId === PREPARE_CANVAS_TOOL_ID && executionContext?.responseId === 'response-discovery') {
        return {
          ok: false,
          success: false,
          issues: [{ path: '/steps/0/nodeType', discoveryRequired: true, nextQuery: 'targeted node' }],
        };
      }
      if (toolId !== 'rule_editor_search_node_types') return {};
      searchCalls.push({ keyword: args.keyword, responseId: executionContext?.responseId });
      if (executionContext?.responseId === 'response-empty') {
        emptyTurnCalls += 1;
        return { success: true, total: emptyTurnCalls === 1 ? 0 : 2, nodeTypes: [], compositions: [] };
      }
      if (executionContext?.responseId === 'response-failure') {
        failedTurnCalls += 1;
        return failedTurnCalls === 1
          ? { success: false, total: 2, error: 'temporarily unavailable' }
          : { success: true, total: 2, nodeTypes: [{ type: 'source' }, { type: 'sink' }] };
      }
      return {
        success: true, total: 2, nodeTypes: [{ type: 'source' }, { type: 'sink' }],
        compositions: [], complete: true, truncated: false,
      };
    },
    remoteTools: nativeRemoteTools,
  });
  const search = profileTool(profile, 'rule_editor_search_node_types');
  const call = (id: string, responseId?: string) => ({
    id,
    toolName: 'rule_editor_search_node_types',
    arguments: {},
    executionContext: responseId ? { responseId, turnSeq: 1 } : { turnSeq: 1 },
  } as any);

  const first = await search.execute(
    { keyword: 'source sink' }, {}, call('search-1', 'response-1'),
  ) as Record<string, any>;
  const different = await search.execute(
    { keyword: 'sink' }, {}, call('search-2', 'response-1'),
  ) as Record<string, any>;
  assert.equal(searchCalls.filter(item => item.responseId === 'response-1').length, 2);
  assert.equal(first.reused, undefined);
  assert.equal(different.reused, undefined);
  assert.deepEqual(different.nodeTypes, [{ type: 'source' }, { type: 'sink' }]);
  assert.equal(different.code, undefined);
  assert.equal(different.complete, true);
  assert.equal(different.truncated, false);
  assert.equal(different.requestSatisfied, true);
  assert.equal(different.exhaustive, true);

  const third = await search.execute(
    { keyword: 'third search' }, {}, call('search-budget', 'response-1'),
  ) as Record<string, any>;
  await search.execute({ keyword: 'fourth role' }, {}, call('search-fourth', 'response-1'));
  assert.equal(searchCalls.filter(item => item.responseId === 'response-1').length, 4);
  assert.equal(third.reused, undefined);
  assert.equal(third.budgetExhausted, undefined);
  assert.deepEqual(third.nodeTypes, first.nodeTypes);

  const [, reused] = await Promise.all([
    search.execute({ keyword: 'same', limit: 10 }, {}, call('search-same-1', 'response-same')),
    search.execute({ limit: 10, keyword: 'same' }, {}, call('search-same-2', 'response-same')),
  ]) as Array<Record<string, any>>;
  assert.equal(searchCalls.filter(item => item.responseId === 'response-same').length, 1);
  assert.equal(reused.reused, true);
  assert.equal(reused.total, 2);
  assert.deepEqual(reused.nodeTypes, first.nodeTypes);
  assert.deepEqual(reused.compositions, []);
  assert.deepEqual(reused.outputBindings.map((binding: { path: string }) => binding.path), ['$.nodeTypes', '$.compositions']);
  assert.equal(reused.complete, true);
  assert.equal(reused.truncated, false);
  assert.equal(reused.requestSatisfied, true);
  assert.equal(reused.exhaustive, true);

  await search.execute({ keyword: 'first attempt' }, {}, call('search-3', 'response-empty'));
  await search.execute({ keyword: 'first attempt' }, {}, call('search-4', 'response-empty'));
  assert.equal(searchCalls.filter(item => item.responseId === 'response-empty').length, 2);

  const failed = await search.execute({ keyword: 'failed attempt' }, {}, call('search-failure-1', 'response-failure')) as Record<string, any>;
  assert.equal(failed.success, false);
  assert.equal(failed.outputBindings, undefined);
  await search.execute({ keyword: 'failed attempt' }, {}, call('search-failure-2', 'response-failure'));
  assert.equal(searchCalls.filter(item => item.responseId === 'response-failure').length, 2);

  await search.execute({ keyword: 'new turn' }, {}, call('search-5', 'response-2'));
  assert.equal(searchCalls.filter(item => item.responseId === 'response-2').length, 1);

  await search.execute({ keyword: 'initial node' }, {}, call('search-discovery-1', 'response-discovery'));
  const apply = profileTool(profile, APPLY_CANVAS_TOOL_ID);
  const preparation = await apply.prepare!({
    flowMode: 'request-response', completion: { mode: 'partial-draft' }, steps: [],
  }, {}, {
    id: 'prepare-discovery',
    toolName: APPLY_CANVAS_TOOL_ID,
    arguments: {},
    executionContext: { responseId: 'response-discovery', turnSeq: 1 },
  } as any) as Record<string, any>;
  assert.equal(preparation.success, false);
  await search.execute({ keyword: 'targeted node' }, {}, call('search-discovery-2', 'response-discovery'));
  assert.equal(searchCalls.filter(item => item.responseId === 'response-discovery').length, 2);
  const additionalRole = await search.execute(
    { keyword: 'another node' }, {}, call('search-discovery-3', 'response-discovery'),
  ) as Record<string, any>;
  assert.equal(searchCalls.filter(item => item.responseId === 'response-discovery').length, 3);
  assert.equal(additionalRole.success, true);
  assert.equal(additionalRole.reused, undefined);
  assert.equal(additionalRole.budgetExhausted, undefined);
  assert.deepEqual(additionalRole.nodeTypes, first.nodeTypes);

  await search.execute({ keyword: 'unscoped one' }, {}, call('search-6'));
  await search.execute({ keyword: 'unscoped two' }, {}, call('search-7'));
  assert.equal(searchCalls.filter(item => item.responseId === undefined).length, 2);
});

test('cached native discovery preserves partial coverage and cannot satisfy an aborted call', async () => {
  let reads = 0;
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async () => {
      reads += 1;
      return {ok: true, total: 20, nodeTypes: [{type: 'source'}], complete: false, truncated: true};
    },
  });
  const search = profileTool(profile, 'rule_editor_search_node_types');
  const args = {keyword: 'source'};
  const call = {executionContext: {responseId: 'partial-search'}} as any;
  await search.execute(args, {}, call);
  const replay = await search.execute(args, {}, call) as Record<string, any>;
  assert.equal(reads, 1);
  assert.equal(replay.reused, true);
  assert.equal(replay.complete, false);
  assert.equal(replay.truncated, true);
  assert.deepEqual(replay.nodeTypes, [{type: 'source'}]);
  assert.deepEqual(replay.outputBindings.map((binding: {path: string}) => binding.path), ['$.nodeTypes']);
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  const cancelled = await search.execute(args, {}, {...call, signal: controller.signal}) as Record<string, any>;
  assert.equal(cancelled.success, false);
  assert.equal(cancelled.outputBindings, undefined);
  assert.equal(reads, 1);
});

test('native owner tools reuse identical calls without freezing resource arguments or pages', async () => {
  const calls: Array<{ responseId?: string; args: Record<string, unknown> }> = [];
  const profile = createRuleEditorAgentProfile({
    executeInternalTool: async (toolId, args, executionContext) => {
      if (toolId !== 'rule_editor_execute_node_tool') return {};
      calls.push({ responseId: executionContext?.responseId, args });
      const ownerArgs = args.arguments as Record<string, unknown>;
      const cursor = String(ownerArgs?.cursor || '0');
      return {
        ok: true,
        result: {
          items: [{ title: `candidate-${cursor}` }],
          cursor,
          nextCursor: cursor === '0' ? '24' : '48',
          truncated: true,
        },
      };
    },
    remoteTools: nativeRemoteTools,
  });
  const ownerTool = profileTool(profile, 'rule_editor_execute_node_tool');
  const call = (id: string, responseId?: string) => ({
    id,
    toolName: 'rule_editor_execute_node_tool',
    arguments: {},
    executionContext: responseId ? { responseId, turnSeq: 1 } : { turnSeq: 1 },
  } as any);
  const firstArgs = {
    type: 'command-support', toolId: 'search-command-capabilities',
    arguments: { keywords: ['device list'], limit: 24 },
  };

  await ownerTool.execute(firstArgs, {}, call('owner-1', 'owner-response'));
  const duplicate = await ownerTool.execute(firstArgs, {}, call('owner-2', 'owner-response')) as Record<string, any>;
  const restarted = await ownerTool.execute({
    ...firstArgs, arguments: { keywords: ['different terms'], limit: 24 },
  }, {}, call('owner-3', 'owner-response')) as Record<string, any>;
  await ownerTool.execute({
    ...firstArgs, arguments: { ...firstArgs.arguments, cursor: '24' },
  }, {}, call('owner-4', 'owner-response'));
  const exhausted = await ownerTool.execute({
    ...firstArgs, arguments: { ...firstArgs.arguments, cursor: '48' },
  }, {}, call('owner-5', 'owner-response')) as Record<string, any>;

  assert.equal(calls.filter(item => item.responseId === 'owner-response').length, 4);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.discoveryExecuted, false);
  assert.equal(duplicate.result.items[0].title, 'candidate-0');
  assert.equal(restarted.reused, undefined);
  assert.equal(exhausted.result.cursor, '48');

  const resources = { type: 'extension-owner', toolId: 'search-resources' };
  await ownerTool.execute({ ...resources, arguments: { resource: 'product' } }, {}, call('product', 'resource-response'));
  await ownerTool.execute({ ...resources, arguments: { resource: 'property', productId: 'verified-product' } }, {}, call('property', 'resource-response'));
  assert.equal(calls.filter(item => item.responseId === 'resource-response').length, 2);

  await ownerTool.execute(firstArgs, {}, call('owner-new-response', 'owner-response-2'));
  await ownerTool.execute(firstArgs, {}, call('owner-unscoped-1'));
  await ownerTool.execute({
    ...firstArgs, arguments: { keywords: ['unscoped terms'], limit: 24 },
  }, {}, call('owner-unscoped-2'));
  assert.equal(calls.filter(item => item.responseId === 'owner-response-2').length, 1);
  assert.equal(calls.filter(item => item.responseId === undefined).length, 2);
});

test('native owner tools share concurrent identical reads but retry incomplete or failed results', async () => {
  let calls = 0;
  let incomplete: Record<string, unknown> | undefined;
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async () => {
      calls += 1;
      return { ok: true, result: incomplete || { complete: true, items: [{ id: 'verified' }] } };
    },
  });
  const ownerTool = profileTool(profile, 'rule_editor_execute_node_tool');
  const args = { type: 'extension-owner', toolId: 'read-facts', arguments: { resource: 'schema' } };
  const call = (responseId: string) => ({ executionContext: { responseId } } as any);
  const concurrent = await Promise.all([
    ownerTool.execute(args, {}, call('concurrent')),
    ownerTool.execute(args, {}, call('concurrent')),
  ]) as Array<Record<string, any>>;
  assert.equal(calls, 1);
  assert.equal(concurrent[1].reused, true);
  assert.deepEqual(concurrent[1].result, concurrent[0].result);

  for (const failure of [
    { complete: false, items: [] },
    { complete: true, items: [], failures: [{ stage: 'metadata', retryable: true }] },
    { ok: false },
  ]) {
    incomplete = failure;
    const responseId = `retry-${calls}`;
    const before = calls;
    await ownerTool.execute(args, {}, call(responseId));
    incomplete = undefined;
    const recovered = await ownerTool.execute(args, {}, call(responseId)) as Record<string, any>;
    assert.equal(calls, before + 2);
    assert.equal(recovered.result.items[0].id, 'verified');
  }
});

test('native owner read cache is bounded and rejected calls remain retryable', async () => {
  let calls = 0;
  let shouldThrow = true;
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async () => {
      calls += 1;
      if (shouldThrow) throw new Error('temporary transport failure');
      return { ok: true, result: { complete: true, items: [] } };
    },
  });
  const tool = profileTool(profile, 'rule_editor_execute_node_tool');
  const args = (index: number) => ({ type: 'extension-owner', toolId: 'read-facts', arguments: { index } });
  const call = { executionContext: { responseId: 'bounded-cache' } } as any;
  const failed = await tool.execute(args(0), {}, call) as Record<string, any>;
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'rule_editor.remote.failed');
  assert.equal(failed.message, 'temporary transport failure');
  shouldThrow = false;
  await tool.execute(args(0), {}, call);
  assert.equal(calls, 2);
  for (let index = 1; index <= 32; index += 1) await tool.execute(args(index), {}, call);
  await tool.execute(args(32), {}, call);
  assert.equal(calls, 34);
  await tool.execute(args(0), {}, call);
  assert.equal(calls, 35);
});

test('an unconfirmed write does not retain owner facts from before the write attempt', async () => {
  let reads = 0;
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => {
      if (toolId === APPLY_CANVAS_TOOL_ID) throw new Error('write receipt unavailable');
      reads += 1;
      return { ok: true, result: { complete: true, items: [{ sequence: reads }] } };
    },
  });
  const call = { executionContext: { responseId: 'unconfirmed-write' } } as any;
  const owner = profileTool(profile, 'rule_editor_execute_node_tool');
  const args = { nodeId: 'node-1', toolId: 'read-facts', arguments: {} };
  await owner.execute(args, {}, call);
  await owner.execute(args, {}, call);
  assert.equal(reads, 1);
  const write = await profileTool(profile, APPLY_CANVAS_TOOL_ID).execute(
    { preparedPlanId: 'prepared-write', planDigest: 'write-digest' }, {}, call,
  ) as Record<string, any>;
  assert.equal(write.mutation.status, 'unknown');
  const refreshed = await owner.execute(args, {}, call) as Record<string, any>;
  assert.equal(refreshed.reused, undefined);
  assert.equal(refreshed.result.items[0].sequence, 2);
});

test('native fallback summaries preserve exact-detail access without closing discovery', async () => {
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    remoteTools: nativeRemoteTools,
    executeInternalTool: async () => ({
      ok: false, nativeFallbackRequired: true,
      diagnostics: {ownerType: 'command-support'},
      nativeCandidates: [{serviceId: 'asset-registry', command: 'Lookup',
        inputs: [{id: 'criteria', required: true, valueType: {type: 'object'}}],
        output: {type: 'array'}, metadataComplete: false,
        detailArguments: {serviceId: 'asset-registry', command: 'Lookup'},
      }],
    }),
  });
  const fallback = await profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID).prepare!(goal, {}, {
    id: 'summary-fallback', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, arguments: goal,
    executionContext: {responseId: 'summary-fallback'},
  } as any) as Record<string, any>;
  assert.equal(fallback.nativeCandidates[0].metadataComplete, false);
  assert.deepEqual(fallback.nativeCandidates[0].detailArguments, {serviceId: 'asset-registry', command: 'Lookup'});
  assert.equal(fallback.nativeCandidates[0].parameterTemplate, undefined);
  assert.match(fallback.instruction, /read exact detailArguments when metadataComplete=false/);
  assert.equal(fallback.discoveryClosed, undefined);
});

test('operation candidates do not close discovery or strip owner authoring details', async () => {
  const internalCalls: string[] = [];
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => {
      internalCalls.push(toolId);
      if (toolId === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID) {
        return {
          ok: false,
          success: false,
          code: 'operation-binding-native-fallback-required',
          nativeFallbackRequired: true,
          diagnostics: { ownerType: 'command-support', candidateCount: 0 },
          candidateHints: [{ serviceId: 'deviceService:device', command: 'QueryList' }],
          nativeCandidates: [{
            title: '查询设备列表',
            serviceName: '设备服务',
            serviceDescription: '重复的服务摘要',
            commandName: '查询设备列表',
            description: '按条件查询设备',
            bindingSlots: [{ name: 'filter', type: 'object', required: true }],
            serviceId: 'deviceService:device',
            command: 'QueryList',
            inputs: [{
              id: 'filter', name: 'filter', description: '查询条件', required: true, type: 'object',
            }],
            parameterTemplate: { filter: {} },
            output: { type: 'array' },
          }],
          issues: [{ code: 'operation-binding-type-incompatible', message: 'duplicate diagnostics' }],
          instruction: 'long duplicate authoring guidance',
        };
      }
      if (toolId === 'rule_editor_get_node_type_detail') {
        return {
          ok: true,
          type: 'command-support',
          name: 'Command support',
          fields: [{ id: 'serviceId', required: true }],
          contracts: { input: { type: 'object' }, output: { type: 'object' } },
          templates: [{ id: 'command-request' }],
          nodeTools: [{ id: 'search-command-capabilities' }],
          manuals: [{ id: 'command-manual', description: 'long duplicate prose' }],
          catalogs: [{ id: 'command-catalog' }],
          catalogMatches: { items: [{ id: 'duplicate-candidate' }] },
          help: 'long duplicate help',
          aiAgent: { purpose: 'duplicate prose', configFields: { serviceId: {} } },
        };
      }
      return { ok: true, success: true, result: { items: [{ id: 'unexpected' }] }, total: 1 };
    },
  });
  const responseId = 'native-fallback-response';
  const orchestrate = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  const fallback = await orchestrate.prepare!(goal, {}, {
    id: 'orchestrate-fallback',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: goal,
    executionContext: { responseId, turnSeq: 1 },
  } as any) as Record<string, any>;
  assert.equal(fallback.nativeFallbackRequired, true);
  assert.equal(fallback.discoveryClosed, undefined);
  assert.equal(fallback.sameArgumentsAllowed, false);
  assert.equal(fallback.authoringMode, 'complete-goal');
  assert.equal(fallback.nativeCandidateCount, 1);
  assert.equal(fallback.priorResultAvailable, true);
  assert.equal(fallback.requestSatisfied, false);
  assert.equal(fallback.candidateHints, undefined);
  assert.deepEqual(fallback.diagnostics, { ownerType: 'command-support' });
  assert.equal(fallback.issues, undefined);
  assert.equal(fallback.message, undefined);
  assert.deepEqual(fallback.nativeCandidates, [{
    label: '查询设备列表',
    description: '按条件查询设备',
    serviceId: 'deviceService:device',
    command: 'QueryList',
    inputs: [{ id: 'filter', description: '查询条件', required: true, valueType: 'object' }],
    parameterTemplate: { filter: {} },
    output: { type: 'array' },
  }]);
  assert.equal(fallback.nativeCandidates[0].title, undefined);
  assert.equal(fallback.nativeCandidates[0].serviceName, undefined);
  assert.equal(fallback.nativeCandidates[0].bindingSlots, undefined);
  assert.ok(
    Buffer.byteLength(JSON.stringify(fallback), 'utf8') <= 3_000,
    `native fallback projection grew to ${Buffer.byteLength(JSON.stringify(fallback), 'utf8')} bytes`,
  );
  assert.match(fallback.instruction, /nextAction/);
  assert.match(fallback.instruction, /Candidates cover business operations only/);
  assert.doesNotMatch(fallback.instruction, /literal or structured owner input/);
  assert.equal(fallback.nextAction.ownerType, 'command-support');
  assert.equal(fallback.nextAction.applyTool, APPLY_CANVAS_TOOL_ID);
  assert.equal(fallback.nextAction.flowMode, 'request-response');
  assert.equal(fallback.nextAction.completionMode, 'complete-topology');

  const owner = await profileTool(profile, 'rule_editor_execute_node_tool').execute({
    type: 'command-support',
    toolId: 'search-command-capabilities',
    arguments: { keywords: ['different words'], limit: 12 },
  }, {}, {
    id: 'redundant-owner',
    toolName: 'rule_editor_execute_node_tool',
    arguments: {},
    executionContext: { responseId, turnSeq: 1 },
  } as any) as Record<string, any>;
  const search = await profileTool(profile, 'rule_editor_search_node_types').execute({
    keyword: 'input command output', limit: 20,
  }, {}, {
    id: 'redundant-search',
    toolName: 'rule_editor_search_node_types',
    arguments: {},
    executionContext: { responseId, turnSeq: 1 },
  } as any) as Record<string, any>;

  assert.deepEqual(internalCalls, [
    RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    'rule_editor_execute_node_tool',
    'rule_editor_search_node_types',
  ]);
  assert.equal(owner.reused, undefined);
  assert.equal(search.reused, undefined);
  assert.equal(search.total, 1);

  const compactDetail = await profileTool(profile, 'rule_editor_get_node_type_detail').execute({
    type: 'command-support',
  }, {}, {
    id: 'configured-detail',
    toolName: 'rule_editor_get_node_type_detail',
    arguments: {},
    executionContext: { responseId, turnSeq: 1 },
  } as any) as Record<string, any>;
  assert.deepEqual(internalCalls, [
    RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    'rule_editor_execute_node_tool',
    'rule_editor_search_node_types',
    'rule_editor_get_node_type_detail',
  ]);
  assert.equal(compactDetail.discoveryClosed, undefined);
  assert.deepEqual(compactDetail.fields, [{ id: 'serviceId', required: true }]);
  assert.deepEqual(compactDetail.contracts, { input: { type: 'object' }, output: { type: 'object' } });
  assert.deepEqual(compactDetail.templates, [{ id: 'command-request' }]);
  assert.deepEqual(compactDetail.nodeTools, [{ id: 'search-command-capabilities' }]);
  assert.deepEqual(compactDetail.manuals, [{ id: 'command-manual', description: 'long duplicate prose' }]);
  assert.deepEqual(compactDetail.catalogs, [{ id: 'command-catalog' }]);
  assert.deepEqual(compactDetail.catalogMatches, { items: [{ id: 'duplicate-candidate' }] });
  assert.equal(compactDetail.help, 'long duplicate help');
  assert.deepEqual(compactDetail.aiAgent, { purpose: 'duplicate prose', configFields: { serviceId: {} } });

  const explicitDetail = await profileTool(profile, 'rule_editor_get_node_type_detail').execute({
    type: 'command-support',
  }, {}, {
    id: 'explicit-detail',
    toolName: 'rule_editor_get_node_type_detail',
    arguments: {},
    executionContext: { responseId: 'explicit-native-response', turnSeq: 1 },
  } as any) as Record<string, any>;
  assert.deepEqual(explicitDetail.manuals, [{ id: 'command-manual', description: 'long duplicate prose' }]);
  assert.deepEqual(explicitDetail.nodeTools, [{ id: 'search-command-capabilities' }]);
  assert.equal(explicitDetail.help, 'long duplicate help');
  assert.deepEqual(explicitDetail.aiAgent, { purpose: 'duplicate prose', configFields: { serviceId: {} } });

  await profileTool(profile, 'rule_editor_search_node_types').execute({
    keyword: 'new response', limit: 20,
  }, {}, {
    id: 'new-response-search',
    toolName: 'rule_editor_search_node_types',
    arguments: {},
    executionContext: { responseId: 'new-response', turnSeq: 1 },
  } as any);
  assert.deepEqual(internalCalls, [
    RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    'rule_editor_execute_node_tool',
    'rule_editor_search_node_types',
    'rule_editor_get_node_type_detail',
    'rule_editor_get_node_type_detail',
    'rule_editor_search_node_types',
  ]);
});

test('fallback preserves each original flow and leaves unrelated owner roles discoverable', async () => {
  for (const [flow, flowMode] of [
    ['request-response', 'request-response'], ['stream', 'realtime-stream'], ['event', 'one-way-trigger'],
  ] as const) {
    const calls: string[] = [];
    const profile = createRuleEditorAgentProfile({
      capabilityCatalog,
      remoteTools: nativeRemoteTools,
      executeInternalTool: async (toolId, args) => {
        calls.push(toolId);
        if (toolId === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID) return {
          ok: false, success: false, nativeFallbackRequired: true,
          diagnostics: { ownerType: 'extension-operation' },
          nativeCandidates: [{ serviceId: 'extension-service', command: 'Resolve', inputs: [] }],
          nextAction: { completionMode: 'partial-draft', flowMode: 'one-way-trigger' },
        };
        if (toolId === 'rule_editor_search_node_types') return {
          ok: true, total: 1, nodeTypes: [{ type: args.keyword }],
        };
        return { ok: true, result: { items: [{ id: 'owner-fact' }] } };
      },
    });
    const responseId = `extension-${flow}`;
    const context = { executionContext: { responseId, turnSeq: 1 } } as any;
    const result = await profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID).prepare!(
      { goal: { ...goal.goal, flow } }, {}, context,
    ) as Record<string, any>;
    assert.equal(result.nextAction.flowMode, flowMode);
    assert.equal(result.nextAction.completionMode, 'complete-topology');
    assert.equal(result.discoveryClosed, undefined);
    const search = profileTool(profile, 'rule_editor_search_node_types');
    await search.execute({ keyword: 'extension-source' }, {}, context);
    await search.execute({ keyword: 'extension-terminal' }, {}, context);
    const additional = await search.execute({ keyword: 'extension-transform' }, {}, context) as Record<string, any>;
    assert.equal(additional.budgetExhausted, undefined);
    assert.deepEqual(additional.nodeTypes, [{ type: 'extension-transform' }]);
    await profileTool(profile, 'rule_editor_execute_node_tool').execute({
      type: 'extension-transform', toolId: 'read-contract', arguments: {},
    }, {}, context);
    assert.deepEqual(calls, [
      RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, 'rule_editor_search_node_types',
      'rule_editor_search_node_types', 'rule_editor_search_node_types', 'rule_editor_execute_node_tool',
    ]);
  }
});

test('native fallback preserves source business questions and the original complete target', async () => {
  for (const flow of ['request-response', 'stream', 'event'] as const) {
    const questions = [{id: 'result-use', question: 'How should the result be used?'}];
    const profile = createRuleEditorAgentProfile({
      capabilityCatalog,
      remoteTools: nativeRemoteTools,
      executeInternalTool: async (toolId) => toolId === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID
        ? {
          ok: false, success: false, userInputRequired: true, questions,
          instruction: 'Resolve the business choice before continuing.',
          nativeFallbackRequired: true,
          nativeCandidates: [{serviceId: 'extension-service', command: 'Read'}],
          nextAction: {completionMode: 'partial-draft', flowMode: 'one-way-trigger'},
        }
        : {ok: false, success: false, mutation: {status: 'unknown'}, error: 'receipt unavailable'},
    });
    const scopedGoal = {goal: {...goal.goal, flow}};
    delete scopedGoal.goal.output;
    const call = {id: `business-choice-${flow}`, executionContext: {responseId: `business-choice-${flow}`}} as any;
    const result = await profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID).prepare!(
      scopedGoal, {}, call,
    ) as Record<string, any>;
    assert.equal(result.success, false);
    assert.equal(result.userInputRequired, true);
    assert.equal(result.completion, 'awaiting-input');
    assert.equal(result.receipt.completion, 'awaiting-input');
    assert.deepEqual(result.questions, questions);
    assert.equal(result.instruction, 'Resolve the business choice before continuing.');
    assert.notEqual(result.priorResultAvailable, true);
    assert.equal(result.nextAction.completionMode, 'complete-topology');
    assert.equal(result.nextAction.flowMode, flow === 'stream' ? 'realtime-stream'
      : flow === 'event' ? 'one-way-trigger' : 'request-response');
    const uncertain = await profileTool(profile, APPLY_CANVAS_TOOL_ID).execute({}, {}, call) as Record<string, any>;
    assert.equal(uncertain.success, false);
    assert.deepEqual(uncertain.taskProgress.requiredChecks, ['topology', 'configuration', 'bindings']);
  }
});

test('native fallback recovery survives the shared client-tool runtime projection', async () => {
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => {
      assert.equal(toolId, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
      return {
        ok: false,
        success: false,
        code: 'operation-binding-native-fallback-required',
        nativeFallbackRequired: true,
        diagnostics: { ownerType: 'command-support', candidateCount: 1 },
        nativeCandidates: [{
          serviceId: 'genericService:entity',
          command: 'QueryList',
          inputs: [{ id: 'filter', type: 'object' }],
          parameterTemplate: { filter: {} },
          output: { type: 'array' },
        }],
      };
    },
  });
  const runtime = createAiClientToolRuntime(profile.tools, { includeHelpTool: false });
  try {
    const result = await runtime.handleClientToolCall({
      id: 'native-fallback-runtime',
      toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      arguments: goal,
      executionContext: { responseId: 'native-fallback-runtime-response', turnSeq: 1 },
    }) as Record<string, any>;

    assert.equal(result.success, false);
    assert.equal(result.nativeFallbackRequired, true);
    assert.equal(result.priorResultAvailable, true);
    assert.equal(result.requestSatisfied, false);
    assert.deepEqual(result.recoveryPlan, result.nextAction);
    assert.equal(result.recoveryPlan.ownerType, 'command-support');
    assert.equal(result.recoveryPlan.applyTool, APPLY_CANVAS_TOOL_ID);
    assert.equal(result.recoveryPlan.flowMode, 'request-response');
    assert.equal(result.recoveryPlan.completionMode, 'complete-topology');
    assert.equal(result.effectState, 'not-started');
    assert.equal(result.externalExecutionStarted, false);
    assert.deepEqual(result.nativeCandidates, [{
      serviceId: 'genericService:entity',
      command: 'QueryList',
      inputs: [{ id: 'filter', valueType: 'object' }],
      parameterTemplate: { filter: {} },
      output: { type: 'array' },
    }]);
  } finally {
    runtime.dispose();
  }
});

test('native fallback continuation requires a complete candidate identity', async () => {
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    remoteTools: nativeRemoteTools,
    executeInternalTool: async () => ({
      ok: false,
      success: false,
      code: 'operation-binding-native-fallback-required',
      nativeFallbackRequired: true,
      diagnostics: { ownerType: 'command-support' },
      candidateHints: [{ title: 'Untrusted candidate' }],
      nativeCandidates: [{ serviceId: 'genericService:entity', inputs: [] }],
    }),
  });
  const result = await profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID).prepare!(goal, {}, {
    id: 'native-fallback-invalid',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: goal,
    executionContext: { responseId: 'native-fallback-invalid-response', turnSeq: 1 },
  } as any) as Record<string, any>;

  assert.equal(result.success, false);
  assert.equal(result.priorResultAvailable, undefined);
  assert.equal(result.discoveryClosed, undefined);
  assert.deepEqual(result.candidateHints, [{ title: 'Untrusted candidate' }]);
});

test('rule editor disables every known generic builtin tool group with an explicit map', () => {
  assert.deepEqual(Object.keys(RULE_EDITOR_BUILTIN_TOOL_GROUPS), [
    'skill', 'session', 'fs', 'json', 'document', 'media',
    'chart', 'dataset', 'validate', 'tools', 'memory', 'script',
  ]);
  assert.equal(Object.values(RULE_EDITOR_BUILTIN_TOOL_GROUPS).every(enabled => enabled === false), true);
  assert.equal(Object.isFrozen(RULE_EDITOR_BUILTIN_TOOL_GROUPS), true);
  const pageSource = readFileSync(resolve(process.cwd(), 'views/Instance/RuleEditor/index.vue'), 'utf8');
  assert.match(pageSource, /builtinToolGroups:\s*RULE_EDITOR_BUILTIN_TOOL_GROUPS/);
  assert.doesNotMatch(pageSource, /builtinToolGroups:\s*\[\s*\]/);
});

test('model-visible rule profile stays bounded and excludes legacy mutation tools', () => {
  const profile = createRuleEditorAgentProfile({
    executeInternalTool: async () => ({}), inspectCanvas: false, capabilityCatalog,
    remoteTools: nativeRemoteTools,
  });
  const modelSurface = JSON.stringify({ prompt: profile.prompt, tools: profile.tools });
  assert.deepEqual(
    profile.tools.filter(tool => RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS.includes(tool.id as any)).map(tool => tool.id),
    [
      APPLY_CANVAS_TOOL_ID,
      'rule_editor_list_nodes',
      'rule_editor_get_node_detail',
      'rule_editor_search_node_types',
      'rule_editor_get_node_type_detail',
      'rule_editor_get_node_type_catalog',
      'rule_editor_get_node_type_manual',
      'rule_editor_execute_node_tool',
      'rule_editor_validate_flow',
    ],
  );
  // Detailed owner documents are available only through explicit read-only tool calls.
  assert.ok(Buffer.byteLength(modelSurface, 'utf8') <= 30_000, `model surface grew to ${Buffer.byteLength(modelSurface, 'utf8')} bytes`);
  assert.equal(modelSurface.includes('rule_editor_edit_node'), false);
  assert.equal(modelSurface.includes(RULE_EDITOR_INSPECT_CANVAS_TOOL_ID), false);
  assert.equal(modelSurface.includes('rule_editor_delete_node'), false);
  assert.equal(modelSurface.includes('rule_editor_connect_nodes'), false);
  assert.equal(modelSurface.includes('rule_editor_get_node_contract'), false);
  assert.equal(modelSurface.includes('bindingTemplates'), false);
  assert.equal(modelSurface.includes('metadataResolver'), false);
});

test('owner resource reads reuse valid facts across discovery and canvas writes', async () => {
  const counts = new Map<string, number>();
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId, args) => {
      counts.set(toolId, (counts.get(toolId) || 0) + 1);
      return { ok: true, type: args.type, manual: { content: 'Runtime facts', truncated: args.query === 'truncated' } };
    },
  });
  const call = { id: 'resource-read', toolName: '', arguments: {}, executionContext: { responseId: 'resource-turn' } };
  const tool = profileTool(profile, 'rule_editor_get_node_type_manual');
  const args = { type: 'extension', manualId: 'runtime', query: 'lifecycle mapping' };
  const [first, reused] = await Promise.all([tool.execute(args, {}, call), tool.execute(args, {}, call)]) as Array<{ manual?: unknown }>;
  assert.equal(counts.get(tool.id), 1);
  assert.deepEqual(reused.manual, first.manual);
  await profileTool(profile, 'rule_editor_get_node_type_detail').execute({ type: 'extension' }, {}, call);
  await profileTool(profile, APPLY_CANVAS_TOOL_ID).execute({}, {}, call);
  await tool.execute(args, {}, call);
  assert.equal(counts.get(tool.id), 1, 'immutable owner manuals remain valid after canvas writes');
  await tool.execute({ ...args, query: 'truncated' }, {}, call);
  await tool.execute({ ...args, query: 'truncated' }, {}, call);
  assert.equal(counts.get(tool.id), 3, 'truncated manual content is retryable evidence');
  await tool.execute(args, {}, { ...call, executionContext: { responseId: 'new-turn' } });
  assert.equal(counts.get(tool.id), 4);
});

test('owner catalog and manual reads preserve their requested content', async () => {
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => toolId === 'rule_editor_get_node_type_catalog'
      ? { ok: true, items: [{ insertText: 'avg(value)', label: 'avg' }], truncated: false }
      : { ok: true, manual: { id: 'syntax-functions', content: 'group by interval(...)' }, manuals: [] },
  });
  const catalog = await profileTool(profile, 'rule_editor_get_node_type_catalog').execute(
    { type: 'reactor-ql', catalogId: 'reactor-ql-language', section: 'groupFunctions' }, {}, {} as any,
  ) as Record<string, any>;
  const manual = await profileTool(profile, 'rule_editor_get_node_type_manual').execute(
    { type: 'reactor-ql', manualId: 'syntax-functions' }, {}, {} as any,
  ) as Record<string, any>;
  assert.equal(catalog.items[0].insertText, 'avg(value)');
  assert.equal(manual.manual.content, 'group by interval(...)');
});

test('native canvas apply keeps prepared handles inside the client lifecycle', async () => {
  const calls: Array<{ id: string; args: Record<string, unknown> }> = [];
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (id, args) => {
      calls.push({ id, args });
      if (id === PREPARE_CANVAS_TOOL_ID) {
        return {
          ok: true,
          success: true,
          preparedPlanId: 'prepared-native-1',
          planDigest: 'digest-native-1',
          previewSummary: { nodeCount: 3, linkCount: 2 },
        };
      }
      return {
        ok: true,
        success: true,
        contract: 'rule-editor.canvas-apply-result/v1',
        flowMode: 'request-response',
        completion: {
          mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1,
        },
        changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
        canvasRevision: 2,
        rolledBack: false,
      };
    },
  });
  const apply = profileTool(profile, APPLY_CANVAS_TOOL_ID);
  assert.equal(profile.tools.some(tool => tool.id === PREPARE_CANVAS_TOOL_ID), false);
  assert.ok(apply.prepare);

  const rawPlan = {
    flowMode: 'request-response',
    completion: { mode: 'complete-topology' },
    steps: [{ op: 'insert-composition', compositionId: 'request-response' }],
  };
  const prepared = await apply.prepare!(rawPlan, {}, {
    id: 'native-apply-1', toolName: APPLY_CANVAS_TOOL_ID, arguments: rawPlan,
  } as any) as Record<string, any>;
  assert.deepEqual(prepared.arguments, {
    preparedPlanId: 'prepared-native-1', planDigest: 'digest-native-1',
  });
  assert.match(prepared.confirmation.content, /RuleEditor\.bridge\.confirm\.preview\.counts/);

  await apply.execute(prepared.arguments, {}, {
    id: 'native-apply-1', toolName: APPLY_CANVAS_TOOL_ID, arguments: prepared.arguments,
  } as any);
  assert.deepEqual(calls, [
    { id: PREPARE_CANVAS_TOOL_ID, args: rawPlan },
    {
      id: APPLY_CANVAS_TOOL_ID,
      args: { preparedPlanId: 'prepared-native-1', planDigest: 'digest-native-1' },
    },
  ]);

  const partialPlan = {
    ...rawPlan,
    completion: { mode: 'partial-draft' },
    targetState: 'configured',
  };
  const partialPrepared = await apply.prepare!(partialPlan, {}, {
    id: 'native-partial-1', toolName: APPLY_CANVAS_TOOL_ID, arguments: partialPlan,
    executionContext: { responseId: 'native-partial-response' },
  } as any) as Record<string, any>;
  assert.equal(partialPrepared.confirmation.title, 'RuleEditor.bridge.confirm.configured.title');
  assert.match(partialPrepared.confirmation.content, /RuleEditor\.bridge\.confirm\.configured\.content/);
});

test('a canonical applied receipt does not block reads or a different incremental plan in the same response', async () => {
  const calls: string[] = [];
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => {
      calls.push(toolId);
      if (toolId === 'rule_editor_execute_node_tool') {
        return { ok: true, result: { complete: true, items: [{ sequence: calls.length }] } };
      }
      if (toolId === PREPARE_CANVAS_TOOL_ID) {
        return { preparedPlanId: 'prepared-once', planDigest: 'digest-once' };
      }
      if (toolId === APPLY_CANVAS_TOOL_ID) {
        return {
          ok: true,
          success: true,
          contract: 'rule-editor.canvas-apply-result/v1',
          flowMode: 'request-response',
          completion: {
            mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1,
          },
          changes: [{ kind: 'node-inserted', nodeId: 'node-1' }],
          mutation: { status: 'applied', requestId: 'apply-once', baseRevision: 1 },
          canvasRevision: 2,
          rolledBack: false,
          verification: {
            topology: { status: 'pass' },
            configuration: { status: 'pass' },
            bindings: { status: 'pass' },
          },
          taskProgress: {
            satisfied: true,
            requiredChecks: ['topology', 'configuration', 'bindings'],
            unresolved: [],
          },
        };
      }
      return { ok: true, success: true, node: { id: 'unexpected-read' } };
    },
  });
  const responseId = 'applied-response';
  const call = (id: string, toolName: string) => ({
    id,
    toolName,
    arguments: {},
    executionContext: { responseId, turnSeq: 1 },
  } as any);
  const apply = profileTool(profile, APPLY_CANVAS_TOOL_ID);
  const owner = profileTool(profile, 'rule_editor_execute_node_tool');
  const ownerArgs = { nodeId: 'node-1', toolId: 'read-facts', arguments: {} };
  const beforeWrite = await owner.execute(
    ownerArgs, {}, call('owner-before-write', owner.id),
  ) as Record<string, any>;
  const reusedBeforeWrite = await owner.execute(
    ownerArgs, {}, call('owner-before-write-again', owner.id),
  ) as Record<string, any>;
  assert.equal(reusedBeforeWrite.reused, true);
  assert.deepEqual(reusedBeforeWrite.result, beforeWrite.result);
  const plan = {
    flowMode: 'request-response',
    completion: { mode: 'complete-topology' },
    steps: [{ op: 'insert-composition', compositionId: 'request-response' }],
  };
  const prepared = await apply.prepare!(plan, {}, call('prepare-once', APPLY_CANVAS_TOOL_ID)) as Record<string, any>;
  await apply.execute(prepared.arguments, {}, call('apply-once', APPLY_CANVAS_TOOL_ID));
  const afterWrite = await owner.execute(
    ownerArgs, {}, call('owner-after-write', owner.id),
  ) as Record<string, any>;
  assert.equal(afterWrite.reused, undefined);
  assert.notDeepEqual(afterWrite.result, beforeWrite.result);

  const readResult = await profileTool(profile, 'rule_editor_get_node_detail').execute({
    nodeId: 'node-after-write',
  }, {}, call('read-after-write', 'rule_editor_get_node_detail')) as Record<string, any>;
  assert.equal(readResult.node.id, 'unexpected-read');
  assert.equal(readResult.code, undefined);

  const repairPlan = { ...plan, steps: [{
    op: 'edit-node', node: { kind: 'node-id', value: 'node-1' }, configDigest: 'current-digest', config: { name: 'repaired' },
  }] };
  const preparedRepair = await apply.prepare!(repairPlan, {}, call('prepare-repair', APPLY_CANVAS_TOOL_ID)) as Record<string, any>;
  assert.equal(preparedRepair.arguments.preparedPlanId, 'prepared-once');
  assert.notEqual(preparedRepair.skipConfirmation, true);
  const repaired = await apply.execute(
    preparedRepair.arguments, {}, call('apply-repair', APPLY_CANVAS_TOOL_ID),
  ) as Record<string, any>;
  assert.equal(repaired.contract, 'rule-editor.canvas-apply-result/v1');
  assert.equal(repaired.mutation.status, 'applied');
  assert.deepEqual(calls, [owner.id, PREPARE_CANVAS_TOOL_ID, APPLY_CANVAS_TOOL_ID, owner.id,
    'rule_editor_get_node_detail', PREPARE_CANVAS_TOOL_ID, APPLY_CANVAS_TOOL_ID]);

  await profileTool(profile, 'rule_editor_get_node_detail').execute({
    nodeId: 'node-new-turn',
  }, {}, {
    ...call('read-new-response', 'rule_editor_get_node_detail'),
    executionContext: { responseId: 'next-response', turnSeq: 2 },
  });
  assert.equal(calls.at(-1), 'rule_editor_get_node_detail');
  assert.equal(calls.length, 8);
});

test('native fallback keeps the original complete target scoped to its response', async () => {
  const fallbackResponseId = 'native-fallback-complete-target';
  const partialResult = {
    ok: true,
    success: true,
    contract: 'rule-editor.canvas-apply-result/v1',
    flowMode: 'request-response',
    completion: { mode: 'partial-draft', satisfied: false, sourceCount: 0, terminalCount: 0 },
    changes: [{ kind: 'node-inserted', nodeId: 'command-only' }],
    mutation: { status: 'applied', requestId: 'partial-write', baseRevision: 1, appliedRevision: 2 },
    canvasRevision: 2,
    rolledBack: false,
    verification: {
      topology: { status: 'unknown' },
      configuration: { status: 'pass' },
      bindings: { status: 'pass' },
      execution: { status: 'not-required' },
    },
    taskProgress: {
      requiredChecks: ['configuration', 'bindings'],
      satisfied: true,
      unresolved: [],
    },
  };
  let applyCount = 0;
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => {
      if (toolId === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID) {
        return {
          ok: false,
          success: false,
          nativeFallbackRequired: true,
          nextAction: { completionMode: 'partial-draft', flowMode: 'request-response' },
          diagnostics: { ownerType: 'command-support' },
          nativeCandidates: [{
            serviceId: 'genericService:entity', command: 'QueryList',
            inputs: [{ id: 'filter', type: 'object' }], parameterTemplate: { filter: {} },
          }],
        };
      }
      if (toolId === PREPARE_CANVAS_TOOL_ID) {
        return { preparedPlanId: `prepared-${applyCount}`, planDigest: `digest-${applyCount}` };
      }
      if (toolId === APPLY_CANVAS_TOOL_ID) {
        applyCount += 1;
        const canvasRevision = applyCount + 1;
        return {
          ...partialResult,
          canvasRevision,
          mutation: {
            status: 'applied', requestId: `partial-write-${applyCount}`,
            baseRevision: canvasRevision - 1, appliedRevision: canvasRevision,
          },
        };
      }
      return { ok: true };
    },
  });
  const orchestrate = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  const fallback = await orchestrate.prepare!(goal, {}, {
    id: 'fallback-goal', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, arguments: goal,
    executionContext: { responseId: fallbackResponseId, turnSeq: 1 },
  } as any) as Record<string, any>;
  assert.equal(fallback.nextAction.completionMode, 'complete-topology');

  const apply = profileTool(profile, APPLY_CANVAS_TOOL_ID);
  const partialPlan = {
    flowMode: 'request-response', completion: { mode: 'partial-draft' },
    steps: [{ op: 'insert-node', nodeType: 'command-support', alias: 'command', config: {} }],
  };
  const fallbackCall = (id: string, args: Record<string, unknown>) => ({
    id, toolName: APPLY_CANVAS_TOOL_ID, arguments: args,
    executionContext: { responseId: fallbackResponseId, turnSeq: 1 },
  } as any);
  const prepared = await apply.prepare!(
    partialPlan, {}, fallbackCall('fallback-prepare', partialPlan),
  ) as Record<string, any>;
  const incomplete = await apply.execute(
    prepared.arguments, {}, fallbackCall('fallback-apply', prepared.arguments),
  ) as Record<string, any>;
  assert.equal(incomplete.requestSatisfied, false);
  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.taskProgress.requiredChecks, ['topology', 'configuration', 'bindings']);
  assert.equal(incomplete.taskProgress.satisfied, false);

  const read = await profileTool(profile, 'rule_editor_get_node_detail').execute(
    { nodeId: 'command-only' }, {}, fallbackCall('read-after-partial', {}),
  ) as Record<string, any>;
  assert.equal(read.ok, true);
  assert.equal(read.code, undefined);
  const repairPlan = { ...partialPlan, steps: [{
    op: 'edit-node', node: { kind: 'node-id', value: 'command-only' }, configDigest: 'latest', config: { name: 'repair' },
  }] };
  const repairPrepared = await apply.prepare!(repairPlan, {}, fallbackCall('repair-prepare', repairPlan)) as Record<string, any>;
  const repairResult = await apply.execute(repairPrepared.arguments, {}, fallbackCall('repair-apply', repairPrepared.arguments)) as Record<string, any>;
  assert.equal(applyCount, 2);
  assert.equal(repairResult.mutation.requestId, 'partial-write-2');
  assert.equal(repairResult.requestSatisfied, false);

  const nextResponseId = 'native-partial-next-response';
  const nextCall = (id: string, args: Record<string, unknown>) => ({
    id, toolName: APPLY_CANVAS_TOOL_ID, arguments: args,
    executionContext: { responseId: nextResponseId, turnSeq: 2 },
  } as any);
  const nextPrepared = await apply.prepare!(
    partialPlan, {}, nextCall('next-prepare', partialPlan),
  ) as Record<string, any>;
  const nextTurn = await apply.execute(
    nextPrepared.arguments, {}, nextCall('next-apply', nextPrepared.arguments),
  ) as Record<string, any>;
  assert.equal(nextTurn.requestSatisfied, false);
  assert.deepEqual(nextTurn.taskProgress.requiredChecks, ['topology', 'configuration', 'bindings']);
});

test('same-response native fallback preserves trusted execution checks until they pass', async () => {
  for (const executionStatus of ['not-required', 'unknown', 'pass'] as const) {
    const responseId = `native-fallback-trusted-execution-${executionStatus}`;
    const executionContext = { responseId, turnSeq: 1 };
    const targets = createRuleEditorTaskTargetStore();
    const trustedTarget = createCompleteRuleEditorTaskTarget();
    trustedTarget.requiredChecks.push('execution');
    targets.set(responseId, trustedTarget);
    const profile = createRuleEditorAgentProfile({
      capabilityCatalog,
      remoteTools: nativeRemoteTools,
      getTaskTargetState: context => targets.get(context?.responseId),
      executeInternalTool: async (toolId) => {
        if (toolId === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID) {
          return {
            ok: false, success: false, nativeFallbackRequired: true,
            nextAction: { completionMode: 'partial-draft', flowMode: 'request-response' },
            diagnostics: { ownerType: 'command-support' },
            nativeCandidates: [{ serviceId: 'genericService:entity', command: 'QueryList', inputs: [] }],
          };
        }
        if (toolId === PREPARE_CANVAS_TOOL_ID) {
          return { preparedPlanId: 'native-prepared', planDigest: 'native-digest' };
        }
        assert.equal(toolId, APPLY_CANVAS_TOOL_ID);
        return {
          ok: true, success: true, contract: 'rule-editor.canvas-apply-result/v1',
          flowMode: 'request-response',
          completion: { mode: 'complete-topology', satisfied: true, sourceCount: 1, terminalCount: 1 },
          changes: [{ kind: 'node-inserted', nodeId: 'native-node' }],
          mutation: { status: 'applied', requestId: 'native-write', baseRevision: 1, appliedRevision: 2 },
          canvasRevision: 2, rolledBack: false,
          verification: {
            topology: { status: 'pass' }, configuration: { status: 'pass' },
            bindings: { status: 'pass' }, execution: { status: executionStatus },
          },
          taskProgress: { requiredChecks: ['topology', 'configuration', 'bindings'], satisfied: true, unresolved: [] },
        };
      },
    });
    const fallback = await profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID).prepare!(goal, {}, {
      id: 'fallback-goal', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, arguments: goal, executionContext,
    } as any) as Record<string, any>;
    assert.equal(fallback.nativeFallbackRequired, true);
    assert.equal(fallback.nextAction.completionMode, 'complete-topology');

    const apply = profileTool(profile, APPLY_CANVAS_TOOL_ID);
    const plan = {
      flowMode: 'request-response',
      completion: { mode: 'complete-topology', sources: ['input'], terminals: ['output'] },
      steps: [{ op: 'insert-node', nodeType: 'command-support', alias: 'native', config: {} }],
    };
    const call = (id: string, args: Record<string, unknown>) => ({
      id, toolName: APPLY_CANVAS_TOOL_ID, arguments: args, executionContext,
    } as any);
    const prepared = await apply.prepare!(plan, {}, call('native-prepare', plan)) as Record<string, any>;
    const result = await apply.execute(prepared.arguments, {}, call('native-apply', prepared.arguments)) as Record<string, any>;
    assert.equal(result.mutation.status, 'applied');
    assert.deepEqual(result.taskProgress.requiredChecks, ['topology', 'configuration', 'bindings', 'execution']);
    assert.equal(result.requestSatisfied, executionStatus === 'pass');
    assert.equal(result.complete, executionStatus === 'pass');
    assert.equal(result.taskProgress.satisfied, executionStatus === 'pass');
    assert.equal(result.taskProgress.unresolved.some((issue: { code: string }) => issue.code === 'execution-not-verified'), executionStatus !== 'pass');
    assert.deepEqual(targets.get(responseId), trustedTarget);
  }
});

test('a non-canonical applied shape cannot close rule-editor tool use', async () => {
  const calls: string[] = [];
  const profile = createRuleEditorAgentProfile({
    remoteTools: nativeRemoteTools,
    executeInternalTool: async (toolId) => {
      calls.push(toolId);
      if (toolId === APPLY_CANVAS_TOOL_ID) {
        return { ok: true, success: true, mutation: { status: 'applied' } };
      }
      return { ok: true, success: true, node: { id: 'read-after-invalid-apply' } };
    },
  });
  const responseId = 'non-canonical-applied-response';
  const executionContext = { responseId, turnSeq: 1 };
  const invalidApply = await profileTool(profile, APPLY_CANVAS_TOOL_ID).execute(
    { preparedPlanId: 'invalid', planDigest: 'invalid' }, {}, {
      id: 'invalid-apply', toolName: APPLY_CANVAS_TOOL_ID, arguments: {}, executionContext,
    } as any,
  ) as Record<string, any>;
  assert.equal(invalidApply.code, 'rule_editor.canvas_plan.invalid_result');

  await profileTool(profile, 'rule_editor_get_node_detail').execute(
    { nodeId: 'read-after-invalid-apply' }, {}, {
      id: 'read-after-invalid-apply', toolName: 'rule_editor_get_node_detail', arguments: {}, executionContext,
    } as any,
  );
  assert.deepEqual(calls, [APPLY_CANVAS_TOOL_ID, 'rule_editor_get_node_detail']);
});

test('RuleGoal requires exact capability references and normalizes bounded discovery hints', () => {
  assert.deepEqual(parseRuleGoal({
    goal: {
      flow: 'request-response',
      inputs: [{ name: ' request ', type: ' object ', description: ' complete request payload ' }],
      operations: [{
        intent: 'lookup',
        capabilityRef: 'platform.entity.lookup',
        candidateRef: 'candidate-session-1',
        discoveryHints: [' device ', 'device', 'device detail'],
      }],
    },
  }), {
    goal: {
      flow: 'request-response',
      inputs: [{ name: 'request', type: 'object', description: 'complete request payload' }],
      operations: [{
        intent: 'lookup',
        capabilityRef: 'platform.entity.lookup',
        candidateRef: 'candidate-session-1',
        discoveryHints: ['device', 'device detail'],
      }],
    },
  });
  assert.equal(parseRuleGoal({ goal: { flow: 'event', operations: [{ intent: 'missing capabilityRef' }] } }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', candidateRef: '' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      inputs: 'not-an-array',
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      inputs: Array.from({ length: 17 }, (_, index) => ({ name: `input-${index}`, type: 'string' })),
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      inputs: [{ name: 'request', type: 'object', description: '' }],
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      inputs: [{ name: 'request', type: 'object', description: 'x'.repeat(513) }],
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      inputs: [{ name: 'request', type: 'object', description: 'payload', extra: true }],
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', output: '' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      operations: [{ intent: 'extra field', capabilityRef: 'platform.entity.lookup', discoveryHints: [''] , serviceId: 'invented' }],
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event',
      operations: [{ intent: 'long hint', capabilityRef: 'platform.entity.lookup', discoveryHints: ['x'.repeat(49)] }],
    },
  }), undefined);
});

test('profile projects only the bounded model-facing capability catalog', () => {
  const profile = createRuleEditorAgentProfile({
    executeInternalTool: async () => ({}),
    locale: 'zh-CN',
    capabilityCatalog: [
      {
        capabilityId: 'platform.entity.lookup',
        localizedName: { zh: '平台对象查询', en: 'Entity lookup' },
        localizedDescription: { zh: '按稳定引用查询平台对象。', en: 'Find one entity by a stable reference.' },
        selectionRequired: true,
        discoveryHintPolicy: { required: true, locale: 'en-US', maxItems: 4, maxLength: 48 },
        effect: 'READ',
        inputContract: {
          kind: 'invocation-parameters', open: false, uncertain: false,
          fields: [{ name: 'id', type: 'string', required: true }],
        },
        outputContract: {
          kind: 'entity-detail', open: true, uncertain: false,
          fields: [{ name: 'id', type: 'string', required: true }],
        },
        bindingPolicy: {
          completeObjectTargets: ['request', 'query'],
          acceptedSourceTypes: ['object', 'invocation-parameters'],
          fieldOverrides: true,
        },
        bindingTemplates: [{ secret: 'must not reach the prompt' }],
        metadataResolver: { secret: 'must not reach the prompt' },
      } as RuleEditorCapabilityCatalogItem & { bindingTemplates: Array<{ secret: string }> },
    ],
  });
  assert.equal(profile.prompt.includes('platform.entity.lookup'), false);
  assert.equal(profile.prompt.includes('Entity lookup'), false);
  const capabilityChoice = (profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID).expands?._schema as any)
    ?.properties?.goal?.properties?.operations?.items?.properties?.capabilityRef?.oneOf?.[0];
  assert.equal(capabilityChoice.const, 'platform.entity.lookup');
  assert.equal(capabilityChoice.title, '平台对象查询 [READ]');
  assert.match(capabilityChoice.description, /selectionRequired=true/);
  assert.match(capabilityChoice.description, /requiredInputs=id:string/);
  assert.match(capabilityChoice.description, /completeObjectTargets=request\|query/);
  assert.match(capabilityChoice.description, /completeObjectSourceTypes=object\|invocation-parameters/);
  assert.match(capabilityChoice.description, /completeObjectFieldsMayOverride=true/);
  assert.equal(profile.prompt.includes('bindingTemplates'), false);
  assert.equal(profile.prompt.includes('metadataResolver'), false);
  assert.equal(profile.prompt.includes('must not reach the prompt'), false);
  assert.equal(profile.prompt.match(/platform\.entity\.lookup/g)?.length || 0, 0);
});

test('complete-object policy is bounded, owner-derived, and optional for field-only capabilities', () => {
  const completeObjectCapability = {
    ...capabilityCatalog[0]!,
    bindingPolicy: {
      completeObjectTargets: ['request', 'request', 'message'],
      acceptedSourceTypes: ['object', 'invocation-parameters'],
      fieldOverrides: true,
    },
  };
  const projected = projectRuleEditorCapabilityCatalog([
    completeObjectCapability,
    capabilityCatalog[1],
  ]);
  assert.deepEqual(projected[0]?.bindingPolicy, {
    completeObjectTargets: ['request', 'message'],
    acceptedSourceTypes: ['object', 'invocation-parameters'],
    fieldOverrides: true,
  });
  assert.equal(projected[1]?.bindingPolicy, undefined);
  assert.deepEqual(projectRuleEditorCapabilityCatalog([{
    ...completeObjectCapability,
    bindingPolicy: { ...completeObjectCapability.bindingPolicy, fieldOverrides: false },
  }]), []);
});

test('capability catalog isolates invalid entries and duplicate-id collision groups', () => {
  const valid = capabilityCatalog[0]!;
  const legacyProjection = projectRuleEditorCapabilityCatalog([{ ...valid, selectionRequired: undefined }]);
  assert.equal(legacyProjection[0]?.selectionRequired, false);
  assert.deepEqual(legacyProjection[0]?.inputContract, valid.inputContract);
  assert.deepEqual(legacyProjection[0]?.outputContract, valid.outputContract);
  assert.deepEqual(projectRuleEditorCapabilityCatalog([
    valid,
    { ...valid, capabilityId: 'platform.other', effect: undefined },
  ]).map(item => item.capabilityId), ['platform.entity.lookup']);
  assert.deepEqual(projectRuleEditorCapabilityCatalog([
    valid,
    { ...valid, localizedName: 'Duplicate owner' },
    capabilityCatalog[1],
  ]).map(item => item.capabilityId), ['platform.event.forward']);
  assert.deepEqual(projectRuleEditorCapabilityCatalog([
    valid,
    { ...valid, effect: undefined },
    capabilityCatalog[1],
  ]).map(item => item.capabilityId), ['platform.event.forward']);
  const report = projectRuleEditorCapabilityCatalogReport([
    valid,
    { ...valid, capabilityId: 'platform.other', effect: 'DELETE' },
    capabilityCatalog[1],
  ]);
  assert.deepEqual(report.items.map(item => item.capabilityId), [
    'platform.entity.lookup', 'platform.event.forward',
  ]);
  assert.deepEqual(report.diagnostics, [{
    code: 'invalid-entry', capabilityId: 'platform.other', index: 1,
  }]);
  const oversized = projectRuleEditorCapabilityCatalogReport(Array.from({ length: 70 }, (_, index) => ({
    ...valid,
    capabilityId: `platform.capability.${String(index).padStart(2, '0')}`,
  })).reverse());
  assert.equal(oversized.items.length, 64);
  assert.equal(oversized.truncated, true);
  assert.equal(oversized.items[0]?.capabilityId, 'platform.capability.00');
  assert.equal(oversized.diagnostics.some(item => item.code === 'catalog-truncated'), true);
});

test('RuleGoal string maps reject unsafe, unbounded, or lossy keys while preserving multilingual keys', () => {
  const schema = createRuleGoalJsonSchema(capabilityCatalog) as any;
  const bindingsSchema = schema.properties.goal.properties.operations.items.properties.bindings;
  const inputNameSchema = schema.properties.goal.properties.inputs.items.properties.name;
  const operationOutputSchema = schema.properties.goal.properties.operations.items.properties.output;
  const goalOutputSchema = schema.properties.goal.properties.output;
  assert.equal(bindingsSchema.maxProperties, 32);
  assert.equal(bindingsSchema.propertyNames.maxLength, 128);
  assert.equal(inputNameSchema.pattern, '^[A-Za-z][A-Za-z0-9_-]*$');
  assert.equal(operationOutputSchema.pattern, '^[A-Za-z][A-Za-z0-9_-]*$');
  assert.match('$devices', new RegExp(goalOutputSchema.additionalProperties.pattern));
  assert.doesNotMatch('$在线设备列表', new RegExp(goalOutputSchema.additionalProperties.pattern));
  assert.ok(parseRuleGoal({
    goal: {
      flow: 'event',
      inputs: [{ name: 'id', type: 'string', description: '设备编号' }],
      operations: [{
        intent: 'lookup', capabilityRef: 'platform.entity.lookup',
        bindings: { '设备编号': '$input.id' }, output: 'device',
      }],
      output: { '查询结果': '$device' },
    },
  }));
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event', inputs: [{ name: '产品编号', type: 'string' }],
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', output: 'devices' }],
      output: { '设备列表': '$devices' },
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event', inputs: [{ name: 'productId', type: 'string' }],
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', output: '在线设备列表' }],
      output: { '设备列表': '$在线设备列表' },
    },
  }), undefined);
  assert.equal(parseRuleGoal({
    goal: {
      flow: 'event', inputs: [{ name: 'productId', type: 'string' }],
      operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', output: 'devices' }],
      output: { '设备列表': '$missing' },
    },
  }), undefined);
  for (const unsafeKey of ['__proto__', 'constructor', 'prototype', ' trailing ', `control\u0000key`]) {
    const bindings = JSON.parse(`{"${unsafeKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\u0000/g, '\\u0000')}":"$input.id"}`);
    assert.equal(parseRuleGoal({
      goal: { flow: 'event', operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', bindings }] },
    }), undefined, unsafeKey);
  }
  const tooMany = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`key-${index}`, '$input.id']));
  assert.equal(parseRuleGoal({
    goal: { flow: 'event', operations: [{ intent: 'lookup', capabilityRef: 'platform.entity.lookup', bindings: tooMany }] },
  }), undefined);
});

test('RuleGoal schema uses stable catalog ids and localizes only descriptive text', () => {
  const chinese = createRuleGoalJsonSchema(capabilityCatalog, 'zh-CN') as any;
  const english = createRuleGoalJsonSchema(capabilityCatalog, 'en-US') as any;
  const chineseChoices = chinese.properties.goal.properties.operations.items.properties.capabilityRef.oneOf;
  const englishChoices = english.properties.goal.properties.operations.items.properties.capabilityRef.oneOf;
  assert.deepEqual(chineseChoices.map((item: any) => item.const), [
    'platform.entity.lookup', 'platform.event.forward',
  ]);
  assert.deepEqual(englishChoices.map((item: any) => item.const), [
    'platform.entity.lookup', 'platform.event.forward',
  ]);
  assert.equal(chineseChoices[0].title, '平台对象查询 [READ]');
  assert.equal(englishChoices[0].title, 'Entity lookup [READ]');
  assert.equal(chineseChoices[1].title, '事件转发 [WRITE]');
  assert.match(chineseChoices[0].description, /effect=READ/);
  assert.match(englishChoices[1].description, /effect=WRITE/);
  assert.match(chineseChoices[0].description, /selectionRequired=true/);
  assert.match(chineseChoices[0].description, /requiredInputs=id:string/);
  assert.match(chineseChoices[1].description, /selectionRequired=false/);
  assert.match(chineseChoices[1].description, /requiredInputs=none/);
  const operationProperties = chinese.properties.goal.properties.operations.items.properties;
  assert.match(operationProperties.candidateRef.description, /仅兼容高层编排为同一目标明确返回/);
  const resolverSchema = createRuleCapabilityResolverJsonSchema(capabilityCatalog, 'zh-CN') as any;
  assert.deepEqual(resolverSchema.required, ['goal', 'operationIndex']);
  assert.equal(resolverSchema.properties.operationIndex.maximum, 15);
  assert.equal(resolverSchema.properties.limit.maximum, 12);
  assert.equal(resolverSchema.properties.searchTerms.maxItems, 4);
});

test('empty catalogs omit the write tool while unknown capability references fail before iframe preparation', async () => {
  let calls = 0;
  const missingCatalog = createRuleEditorAgentProfile({
    executeInternalTool: async () => { calls += 1; return {}; },
    inspectCanvas: true,
  });
  const unknownCapability = createRuleEditorAgentProfile({
    executeInternalTool: async () => { calls += 1; return {}; },
    capabilityCatalog,
  });
  const call = {
    id: 'catalog-guard', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-catalog-guard' },
  };
  assert.deepEqual(missingCatalog.tools.map(tool => tool.id), [RULE_EDITOR_INSPECT_CANVAS_TOOL_ID]);
  assert.match(missingCatalog.prompt, /不得构造 capabilityRef/);
  const emptyCapabilityRef = (createRuleGoalJsonSchema([]) as any)
    .properties.goal.properties.operations.items.properties.capabilityRef;
  assert.equal(emptyCapabilityRef.type, 'string');
  assert.equal(emptyCapabilityRef.minLength, 1);
  assert.equal(emptyCapabilityRef.maxLength, 128);
  assert.equal('not' in emptyCapabilityRef, false);
  assert.equal('oneOf' in emptyCapabilityRef, false);
  const orchestrate = unknownCapability.tools.find(tool => tool.id === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID)!;
  const unknown = await orchestrate.prepare!({
    goal: { flow: 'event', operations: [{ intent: 'forward', capabilityRef: 'unknown' }] },
  }, {}, { ...call, id: 'unknown-capability', executionContext: { logicalToolCallId: 'logical-unknown' } }) as Record<string, any>;
  assert.equal(unknown.code, 'rule_editor.goal.capability_ref_unavailable');
  assert.equal(unknown.receipt.effect, 'not-applied');
  assert.equal(calls, 0);
});

test('prepare failures carry a not-started receipt and never imply an unknown write effect', async () => {
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    executeInternalTool: async () => ({
      ok: false,
      success: false,
      code: 'platform-capability-unavailable',
      message: 'No owner capability declares the requested intent',
      effect: 'not-applied',
      completion: 'blocked',
    }),
  });
  const tool = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  const result = await tool.prepare!(goal, {}, {
    id: 'prepare-failure',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-prepare-failure' },
  }) as Record<string, any>;
  assert.equal(result.success, false);
  assert.equal(result.effectState, 'not-started');
  assert.equal(result.externalExecutionStarted, false);
  assert.equal(result.receipt.effect, 'not-applied');
  assert.equal(result.receipt.completion, 'blocked');
  assert.equal(result.receipt.effectState, 'not-started');
});

test('internal metadata ambiguity stays blocked and does not expose platform choices', async () => {
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    executeInternalTool: async () => ({
      ok: false,
      success: false,
      code: 'ambiguous-command-capability',
      message: 'More than one command satisfies the metadata contract',
      effect: 'not-applied',
      completion: 'awaiting-input',
      userInputRequired: false,
      failureDisposition: 'request',
      recoveryAction: 'repair',
      choices: [{ id: 'internal-service', title: 'Internal service' }],
      questions: [{ id: 'internal-question', prompt: 'Select an internal service' }],
    }),
  });
  const tool = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  const result = await tool.prepare!(goal, {}, {
    id: 'metadata-ambiguity',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-metadata-ambiguity' },
  }) as Record<string, any>;
  assert.equal(result.success, false);
  assert.equal(result.completion, 'blocked');
  assert.equal(result.userInputRequired, false);
  assert.equal(result.failureDisposition, 'request');
  assert.equal(result.recoveryAction, 'repair');
  assert.equal('choices' in result, false);
  assert.equal('questions' in result, false);
  assert.equal(result.receipt.completion, 'blocked');
});

test('literal command binding remains a repairable zero-write failure', async () => {
  let executeCalls = 0;
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    executeInternalTool: async (_id, _args, executionContext) => {
      assert.equal(executionContext?.phase, 'prepare');
      executeCalls += 1;
      return {
      ok: false,
      code: 'command-binding-unsupported',
      message: 'command bindings must reference declared upstream fields',
      effect: 'not-applied',
      completion: 'blocked',
      effectState: 'not-started',
      externalExecutionStarted: false,
      userInputRequired: false,
      failureDisposition: 'request',
      recoveryAction: 'repair',
      choices: [{ id: 'internal-binding', title: 'Internal binding' }],
      questions: [{ id: 'internal-question', prompt: 'Select an internal binding' }],
      };
    },
  });
  const runtime = createAiClientToolRuntime(profile.tools, { includeHelpTool: false });
  try {
    const result = await runtime.handleClientToolCall({
      id: 'literal-binding',
      toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      arguments: goal,
      executionContext: { logicalToolCallId: 'logical-literal-binding' },
    }) as Record<string, any>;
    assert.equal(result.ok, false);
    assert.equal(result.success, false);
    assert.equal(result.code, 'command-binding-unsupported');
    assert.equal(result.completion, 'blocked');
    assert.equal(result.userInputRequired, false);
    assert.equal(result.failureDisposition, 'request');
    assert.equal(result.recoveryAction, 'repair');
    assert.equal(result.effectState, 'not-started');
    assert.equal(result.externalExecutionStarted, false);
    assert.equal('choices' in result, false);
    assert.equal('questions' in result, false);
    assert.equal(result.receipt.effect, 'not-applied');
    assert.equal(result.receipt.completion, 'blocked');
    assert.equal(executeCalls, 1);
  } finally {
    runtime.dispose();
  }
});

test('one v3 goal call prepares, confirms, applies and reports real lifecycle states', async () => {
  const calls: Array<{ id: string; args: Record<string, unknown>; phase?: string }> = [];
  const progress: string[] = [];
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    locale: 'zh-CN',
    executeInternalTool: async (id, args, executionContext, reportProgress) => {
      calls.push({ id, args, phase: executionContext?.phase });
      assert.equal(id, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
      if (executionContext?.phase === 'prepare') {
        reportProgress?.({
          version: 'client-tool-progress/v1', stepId: 'resolve-capability', status: 'running',
          label: 'Resolving declared capabilities', completed: 1, total: 4,
        });
        return {
          preparedPlanId: 'prepared-1', planDigest: 'digest-1', editorSessionId: 'session-1', baseRevision: 4,
          previewSummary: { nodeCount: 2, linkCount: 1, stepCount: 3 },
        };
      }
      return {
        ok: true, success: true, effect: 'applied', completion: 'completed', newRevision: 5,
        requestId: 'logical-1', planDigest: 'digest-1', baseRevision: 4,
        changes: [{ kind: 'node-added', nodeId: 'private-node' }],
        verification: { topology: { status: 'pass' }, configuration: { status: 'pass' }, bindings: { status: 'pass' } },
        taskProgress: { satisfied: true, requiredChecks: ['topology', 'configuration', 'bindings'], unresolved: [] },
      };
    },
    inspectCanvas: true,
  });
  const tool = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  const call = {
    id: 'rpc-1', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-1' },
    reportProgress: (item: { stepId: string }) => progress.push(item.stepId),
  };
  const prepared = await tool.prepare!(goal, {}, call);
  assert.equal(prepared.success, undefined);
  if ('success' in prepared && prepared.success === false) throw new Error('unexpected preparation failure');
  assert.match(prepared.confirmation.content, /1 项业务操作：device\.lookup/);
  assert.match(prepared.confirmation.content, /平台对象查询（读取）/);
  assert.match(prepared.confirmation.content, /2 个变更节点、1 条连线/);
  assert.match(prepared.confirmation.content, /画布修订 4/);
  assert.match(prepared.confirmation.content, /不会保存、发布或执行规则/);
  const result = await tool.execute(prepared.arguments, {}, { ...call, arguments: prepared.arguments }) as Record<string, any>;
  assert.deepEqual(calls.map((item) => item.id), [RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID]);
  assert.deepEqual(calls[0]?.args, goal);
  assert.deepEqual(calls[1]?.args, { preparedPlanId: 'prepared-1', planDigest: 'digest-1', editorSessionId: 'session-1', baseRevision: 4 });
  assert.equal(result.receipt.effect, 'applied');
  assert.equal(result.receipt.completion, 'completed');
  assert.deepEqual(progress, ['resolve-capability', 'awaiting_confirmation', 'applying', 'verifying', 'completed']);
});

test('contract-family scenarios use one high-level lifecycle without discovery or help loops', async () => {
  const scenarios = [
    {
      name: 'request-response scalar', locale: 'en-US',
      value: {
        goal: {
          flow: 'request-response',
          inputs: [{ name: 'id', type: 'string' }],
          operations: [{
            intent: 'read one business entity', capabilityRef: 'platform.entity.lookup',
            bindings: { id: '$input.id' }, output: 'entity',
          }],
          output: { entity: '$entity' },
        },
      },
    },
    {
      name: 'event complete object with field override', locale: 'zh-CN',
      value: {
        goal: {
          flow: 'event',
          inputs: [{ name: 'event', type: 'object' }, { name: 'tenantId', type: 'string' }],
          operations: [{
            intent: '转发业务事件', capabilityRef: 'platform.event.forward',
            bindings: { request: '$input.event', tenantId: '$input.tenantId' }, output: 'forwarded',
          }],
          output: { result: '$forwarded' },
        },
      },
    },
    {
      name: 'stream dependent dag', locale: 'en-US',
      value: {
        goal: {
          flow: 'stream',
          inputs: [{ name: 'id', type: 'string' }],
          operations: [
            {
              intent: 'lookup stream entity', capabilityRef: 'platform.entity.lookup',
              bindings: { id: '$input.id' }, output: 'entity',
            },
            {
              intent: 'forward resolved entity', capabilityRef: 'platform.event.forward',
              bindings: { payload: '$entity' }, output: 'forwarded',
            },
          ],
          output: { result: '$forwarded' },
        },
      },
    },
    {
      name: 'parallel fan-in', locale: 'zh-CN',
      value: {
        goal: {
          flow: 'request-response',
          inputs: [{ name: 'leftId', type: 'string' }, { name: 'rightId', type: 'string' }],
          operations: [
            {
              intent: '查询左侧对象', capabilityRef: 'platform.entity.lookup',
              bindings: { id: '$input.leftId' }, output: 'left',
            },
            {
              intent: 'query right entity', capabilityRef: 'platform.entity.lookup',
              bindings: { id: '$input.rightId' }, output: 'right',
            },
          ],
          output: { primary: '$left', secondary: '$right' },
        },
      },
    },
  ] as const;

  for (const [index, scenario] of scenarios.entries()) {
    const calls: Array<{ id: string; phase?: string; args: Record<string, unknown> }> = [];
    const requestId = `contract-scenario-${index}`;
    const profile = createRuleEditorAgentProfile({
      capabilityCatalog,
      locale: scenario.locale,
      inspectCanvas: true,
      executeInternalTool: async (id, args, executionContext) => {
        calls.push({ id, phase: executionContext?.phase, args });
        if (executionContext?.phase === 'prepare') {
          return {
            preparedPlanId: `prepared-${index}`,
            planDigest: `digest-${index}`,
            baseRevision: index,
          };
        }
        return {
          effect: 'applied',
          completion: 'completed',
          requestId,
          planDigest: `digest-${index}`,
          baseRevision: index,
          newRevision: index + 1,
          verification: {
            topology: { status: 'pass' },
            configuration: { status: 'pass' },
            bindings: { status: 'pass' },
          },
          taskProgress: {
            satisfied: true,
            requiredChecks: ['topology', 'configuration', 'bindings'],
            unresolved: [],
          },
        };
      },
    });
    const tool = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
    const call = {
      id: requestId,
      toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      executionContext: { logicalToolCallId: requestId },
    };
    const prepared = await tool.prepare!(scenario.value, {}, call);
    if ('success' in prepared && prepared.success === false) {
      throw new Error(`${scenario.name} unexpectedly failed during prepare`);
    }
    const result = await tool.execute(prepared.arguments, {}, { ...call, arguments: prepared.arguments }) as Record<string, any>;
    assert.deepEqual(calls.map(item => item.phase), ['prepare', 'execute'], scenario.name);
    assert.equal(calls.every(item => item.id === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID), true, scenario.name);
    assert.deepEqual(calls[0]?.args, parseRuleGoal(scenario.value), scenario.name);
    assert.equal(result.receipt.completion, 'completed', scenario.name);
    assert.equal(result.requestSatisfied, true, scenario.name);
  }
});

test('execute timeout performs one read-only verify and never replays apply', async () => {
  const phases: string[] = [];
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    executeInternalTool: async (_id, _args, executionContext) => {
      const phase = executionContext?.phase || '';
      phases.push(phase);
      if (phase === 'prepare') {
        return { preparedPlanId: 'prepared-timeout', planDigest: 'digest-timeout', baseRevision: 7 };
      }
      if (phase === 'execute') {
        const error = new Error('bridge timeout');
        error.name = 'RuleEditorBridgeTimeout';
        throw error;
      }
      assert.equal(phase, 'verify');
      return {
        ok: true, success: true, effect: 'applied', completion: 'completed',
        requestId: 'logical-timeout', planDigest: 'digest-timeout', baseRevision: 7, newRevision: 8,
        verification: { topology: { status: 'pass' } },
        taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
      };
    },
  });
  const tool = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  const call = {
    id: 'rpc-timeout', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-timeout' },
  };
  const prepared = await tool.prepare!(goal, {}, call);
  if ('success' in prepared && prepared.success === false) throw new Error('unexpected preparation failure');
  const result = await tool.execute(prepared.arguments, {}, { ...call, arguments: prepared.arguments }) as Record<string, any>;

  assert.deepEqual(phases, ['prepare', 'execute', 'verify']);
  assert.equal(phases.filter((phase) => phase === 'execute').length, 1);
  assert.equal(result.receipt.effect, 'applied');
  assert.equal(result.receipt.completion, 'completed');
});

test('receipt projection never upgrades unknown or rolled-back effects to success', () => {
  assert.deepEqual(projectCanvasApplyReceipt({ mutation: { status: 'unknown' } }), {
    effect: 'unknown', completion: 'failed', effectState: 'unknown',
  });
  assert.deepEqual(projectCanvasApplyReceipt({ mutation: { status: 'rolled-back' } }), {
    effect: 'rolled-back', completion: 'failed', effectState: 'rolled-back',
  });
  assert.equal(projectCanvasApplyReceipt({ ok: false, userInputRequired: true }).completion, 'awaiting-input');
  assert.equal(projectCanvasApplyReceipt({
    ok: false, completion: 'awaiting-input', userInputRequired: false,
  }).completion, 'blocked');
  assert.equal(projectCanvasApplyReceipt({
    ok: false, completion: 'completed', userInputRequired: true,
  }).completion, 'blocked');
  assert.equal(projectCanvasApplyReceipt({ effect: 'not-applied', completion: 'blocked' }).completion, 'blocked');
  assert.equal(projectCanvasApplyReceipt({ effect: 'applied', completion: 'partial' }).completion, 'partial');
  assert.equal(projectCanvasApplyReceipt({ effect: 'applied', complete: true }).completion, 'partial');
  assert.equal(projectCanvasApplyReceipt({ effect: 'applied', completion: 'completed' }).completion, 'partial');
  assert.equal(projectCanvasApplyReceipt({ effect: 'unknown', completion: 'completed' }).completion, 'failed');
  assert.equal(projectCanvasApplyReceipt({ effect: 'rolled-back', completion: 'completed' }).completion, 'failed');
  assert.equal(projectCanvasApplyReceipt({ effect: 'not-applied', completion: 'completed' }).completion, 'blocked');
  assert.deepEqual(projectCanvasApplyReceipt({
    effect: 'applied',
    mutation: { status: 'rolled-back' },
    verification: { topology: { status: 'pass' } },
    taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
  }), {
    effect: 'unknown',
    completion: 'failed',
    effectState: 'unknown',
    verification: { topology: { status: 'pass' } },
    taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
  });
  assert.equal(projectCanvasApplyReceipt({
    effect: 'applied',
    verification: { topology: { status: 'pass' } },
    taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
  }).completion, 'completed');
  assert.equal(projectCanvasApplyReceipt({
    effect: 'applied',
    verification: { topology: { status: 'unknown' } },
    taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
  }).completion, 'partial');
  const projected = projectCanvasApplyReceipt({
    effect: 'applied',
    instruction: '草稿已写入，仍需补齐绑定。',
    taskProgress: {
      satisfied: false,
      requiredChecks: ['topology', 'bindings'],
      unresolved: [{ code: 'binding-unresolved', message: '缺少输出绑定。' }],
    },
  });
  assert.equal(projected.instruction, '草稿已写入，仍需补齐绑定。');
  assert.deepEqual(projected.taskProgress, {
    satisfied: false,
    requiredChecks: ['topology', 'bindings'],
    unresolved: [{ code: 'binding-unresolved', message: '缺少输出绑定。' }],
  });
  assert.deepEqual(projected.unmet, [{ code: 'binding-unresolved', message: '缺少输出绑定。' }]);
});

test('partial receipt reports a successful write without claiming request completion', async () => {
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    executeInternalTool: async (_id, _args, executionContext) => (
      executionContext?.phase === 'prepare'
        ? { preparedPlanId: 'prepared-partial', planDigest: 'digest-partial' }
        : { ok: true, success: true, effect: 'applied', completion: 'partial', instruction: '草稿已部分写入。' }
    ),
  });
  const progress: string[] = [];
  const runtime = createAiClientToolRuntime(profile.tools, { includeHelpTool: false });
  try {
    const result = await runtime.handleClientToolCall({
      id: 'rpc-partial', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, arguments: goal,
      executionContext: { logicalToolCallId: 'logical-partial' },
      requestConfirmation: () => ({ approved: true }),
      reportProgress: (item: { stepId: string }) => progress.push(item.stepId),
    }) as Record<string, any>;
    assert.equal(result.ok, true);
    assert.equal(result.success, true);
    assert.equal(result.complete, false);
    assert.equal(result.requestSatisfied, false);
    assert.equal(result.partial, true);
    assert.equal(result.instruction, '草稿已部分写入。');
    assert.equal(result.resultStatus, 'partial');
    assert.equal(result.receipt.completion, 'partial');
    assert.equal(result.outputBindings[0].name, 'canvas-apply-receipt');
    assert.equal(result.outputBindings[0].complete, false);
    assert.equal(result.outputBindings[0].requestSatisfied, false);
    assert.equal(progress.at(-1), 'partial');
  } finally {
    runtime.dispose();
  }
});

test('terminal entries replay through prepare without a second confirmation or write', async () => {
  const previousNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  let runtime: ReturnType<typeof createAiClientToolRuntime> | undefined;
  try {
    let prepareCount = 0;
    let executeCount = 0;
    let confirmationCount = 0;
    const profile = createRuleEditorAgentProfile({
      capabilityCatalog,
      executeInternalTool: async (_id, _args, executionContext) => {
        if (executionContext?.phase === 'prepare') {
          prepareCount += 1;
          return { preparedPlanId: `prepared-${prepareCount}`, planDigest: `digest-${prepareCount}` };
        }
        executeCount += 1;
        return {
          effect: 'applied', completion: 'completed',
          verification: { topology: { status: 'pass' } },
          taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
        };
      },
    });
    runtime = createAiClientToolRuntime(profile.tools, { includeHelpTool: false });
    const call = {
      id: 'rpc-cleanup', toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID, arguments: goal,
      executionContext: { logicalToolCallId: 'logical-cleanup' },
      requestConfirmation: () => {
        confirmationCount += 1;
        return { approved: true };
      },
    };
    const first = await runtime.handleClientToolCall(call);
    const replay = await runtime.handleClientToolCall(call);
    assert.equal(prepareCount, 1);
    assert.equal(executeCount, 1);
    assert.equal(confirmationCount, 1);
    assert.deepEqual(replay, first);
    const mismatch = await runtime.handleClientToolCall({
      ...call,
      arguments: {
        goal: {
          ...goal.goal,
          operations: [{ ...goal.goal.operations[0], intent: 'different.lookup' }],
        },
      },
    }) as Record<string, any>;
    assert.equal(mismatch.code, 'rule_editor.orchestration.duplicate_mismatch');
    const candidateMismatch = await runtime.handleClientToolCall({
      ...call,
      arguments: {
        goal: {
          ...goal.goal,
          operations: [{ ...goal.goal.operations[0], candidateRef: 'candidate-session-2' }],
        },
      },
    }) as Record<string, any>;
    assert.equal(candidateMismatch.code, 'rule_editor.orchestration.duplicate_mismatch');
    assert.equal(prepareCount, 1);
    assert.equal(executeCount, 1);
    assert.equal(confirmationCount, 1);
    now += 60_001;
    const lateReplay = await runtime.handleClientToolCall(call);
    assert.equal(prepareCount, 1);
    assert.equal(executeCount, 1);
    assert.equal(confirmationCount, 1);
    assert.deepEqual(lateReplay, first);
  } finally {
    runtime?.dispose();
    Date.now = previousNow;
  }
});

test('new logical calls are blocked when live prepared entries reach capacity', async () => {
  let prepareCount = 0;
  const profile = createRuleEditorAgentProfile({
    capabilityCatalog,
    executeInternalTool: async (_id, _args, executionContext) => {
      assert.equal(executionContext?.phase, 'prepare');
      prepareCount += 1;
      return { preparedPlanId: `prepared-${prepareCount}`, planDigest: `digest-${prepareCount}` };
    },
  });
  const tool = profileTool(profile, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
  for (let index = 0; index < 128; index += 1) {
    const prepared = await tool.prepare!(goal, {}, {
      id: `rpc-live-${index}`,
      toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      executionContext: { logicalToolCallId: `logical-live-${index}` },
    });
    if ('success' in prepared && prepared.success === false) throw new Error('unexpected preparation failure');
  }
  const saturated = await tool.prepare!(goal, {}, {
    id: 'rpc-over-capacity',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-over-capacity' },
  }) as Record<string, any>;
  const replay = await tool.prepare!(goal, {}, {
    id: 'rpc-live-replay',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    executionContext: { logicalToolCallId: 'logical-live-0' },
  }) as Record<string, any>;
  assert.equal(prepareCount, 128);
  assert.equal(saturated.code, 'rule_editor.orchestration.capacity_exhausted');
  assert.equal(saturated.retryable, false);
  assert.equal(saturated.receipt.effect, 'not-applied');
  assert.equal(saturated.receipt.completion, 'blocked');
  assert.equal(replay.code, 'rule_editor.orchestration.duplicate');
});
