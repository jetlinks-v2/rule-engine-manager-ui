import {
  defineAiClientToolContract,
  type AiClientToolCall,
  type AiClientToolDefinition,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  RULE_EDITOR_INSPECT_CANVAS_TOOL_ID,
  RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
  RULE_EDITOR_ORCHESTRATION_PROFILE_ID,
  createRuleGoalJsonSchema,
  projectRuleEditorCapabilityCatalog,
  projectCanvasApplyReceipt,
  type RuleEditorCapabilityCatalogItem,
} from './ruleEditorOrchestrationContracts';
import { createRuleEditorOrchestrator } from './useRuleEditorOrchestrator';
import {
  toRuleEditorClientToolDefinition,
  type RemoteRuleEditorToolDefinition,
} from './toolRuntime';
import {
  APPLY_CANVAS_TOOL_ID,
  PREPARE_CANVAS_TOOL_ID,
  orderRuleEditorRemoteTools,
} from './toolRuntimeContracts';
import {
  createCompleteRuleEditorTaskTarget,
  createConfiguredRuleEditorTaskTarget,
  mergeRuleEditorTaskTarget,
  type RuleEditorTaskTargetState,
} from './ruleEditorAgentContext';
import { resolveRuleEditorApplyConfirmationText } from './confirmOptions';
import type { GeneralAgentConversationChatPayload } from '@jetlinks-web-core/layout/components/AiChat/generalAgentExtensions';

export type RuleEditorBuiltinToolGroup =
  | 'skill'
  | 'session'
  | 'fs'
  | 'json'
  | 'document'
  | 'media'
  | 'chart'
  | 'dataset'
  | 'validate'
  | 'tools'
  | 'memory'
  | 'script';

// Backend treats an empty list as "use defaults", so every known group must be disabled explicitly.
export const RULE_EDITOR_BUILTIN_TOOL_GROUPS = Object.freeze({
  skill: false,
  session: false,
  fs: false,
  json: false,
  document: false,
  media: false,
  chart: false,
  dataset: false,
  validate: false,
  tools: false,
  memory: false,
  script: false,
}) satisfies Readonly<Record<RuleEditorBuiltinToolGroup, false>>;

const RULE_EDITOR_LANGUAGE_PROMPT =
  '进度说明和最终答复使用与用户当前消息相同的语言；工具标识、字段名和配置字面量保持原样。';

export const RULE_EDITOR_TURN_ADMISSION_PROMPT = [
  '本轮当前非空用户消息就是业务目标，不得因缺少 flow、节点、平台标识或配置等实现细节要求用户重述。',
  '通知、存储或返回去向未明确且影响业务结果时，先询问一个必要业务问题，不诱导用户补终点。实现事实由适用的规则编排工具补齐；工具事实证明多个选择会改变业务结果时，同样只询问一个业务问题。',
].join('\n');

export const appendRuleEditorTurnAdmission = (
  payload: GeneralAgentConversationChatPayload,
) => {
  if (!String(payload.content || '').trim()) return;
  if (payload.systemPromptAppend?.includes(RULE_EDITOR_TURN_ADMISSION_PROMPT)) return;
  payload.systemPromptAppend = [
    payload.systemPromptAppend,
    RULE_EDITOR_TURN_ADMISSION_PROMPT,
  ].filter(Boolean).join('\n\n');
};

export const RULE_EDITOR_ORCHESTRATION_PROMPT = [
  '业务目标能由 capability catalog 表达时，首个工具使用 rule_editor_orchestrate_goal；目标无法由 catalog 表达，或用户明确指定原生节点、查询方言、流处理、转换或聚合时走原生路径。',
  '历史回复、旧画布、示例和 metadata 只作证据，不得追加用户没有要求的业务动作。',
  '参数只包含 RuleGoal 的流程、输入、intent、capabilityRef、绑定和输出。',
  'capabilityRef 必须精确引用 catalog capabilityId，同时匹配业务语义、effect（READ/WRITE）和输入契约，不得从 intent 编造。',
  'intent 和 discoveryHints 使用用户语言，由高层编排内部完成有界能力发现；不要调用或猜测低层 resolver、cursor、serviceId、command、candidateId。',
  'selectionRequired 表示业务歧义，不要求用户理解平台服务；先按目标选择，仍不明确时只询问一个业务问题。',
  'candidateRef 仅用于兼容高层编排明确返回的同目标候选，不自行构造或改动其它 operation、bindings、output。',
  'nativeFallbackRequired 且有可信 nativeCandidates 时停止高层重试，按 nextAction 转入原生路径；复用候选身份与参数/输出契约，但候选只证明业务操作。保留原始 flowMode 与用户明确要求的业务边界，按需发现缺失角色并读取每个所选类型的 owner 详情；metadataComplete=false 的候选需要精确详情。',
  'capability 声明 completeObjectTargets 时，如果用户输入本身是完整请求、消息或业务对象，将该输入声明为 object，并优先整体绑定到其中一个目标；只有用户明确提供独立字段时才追加字段覆盖。不得把完整对象语义降级绑定到某个标量子字段。',
  'inputs[].name 和 operations[].output 是供引用使用的稳定 ASCII 符号（如 productId、devices）；用户语言写在 description、intent 和 goal.output 的字段名中。bindings 使用 $input.<name> 或 $<operationOutput> 的已声明引用；只有 owner outputContract 明确声明字段时才使用 $<operationOutput>.<field>，open/uncertain 且没有字段声明时应把用户返回字段整体映射到 $<operationOutput>；goal.output 必须原样保留用户明确给出的返回对象字段名，并直接引用已声明 operation 输出（如 {"设备列表":"$devices"}）。编排返回 request/repair 时，只修复返回诊断指向的业务 binding 或语义缺口，然后直接重试高层编排。',
  'goal.output 只包含用户明确要求的返回字段，不回显输入或追加其它输出。',
  '无法从用户请求或 catalog 确定的类型保持为 unknown；owner 已声明运行时验证时 unknown 是有效值。不要生成内部实现、schema、私有配置、坐标、steps、prepared handle 或技术教程。',
  '只有用户明确询问当前画布或诊断已有规则时，才调用 rule_editor_list_nodes，并按需读取目标节点详情。',
  '最终以 receipt 区分未提交、部分完成、回滚、效果未知和成功。',
].join('\n');

export const RULE_EDITOR_NATIVE_AUTHORING_PROMPT = [
  '节点搜索只补未解决角色、空结果或预检明确缺口，复用相同参数结果。每个所需类型读取一次详情；configFields、contracts 足够时直接 apply。缺少函数签名或复杂语义时，按详情中的 catalogs[].id/sections 或 manuals[].id 定向补读；目录 query 可一次包含多个关键词，section 可省略以覆盖 owner 已声明分类，手册 query/section 可读取相关章节。按必要事实一次读取，不强制逐字段、逐函数轮询，不重复全量浏览。owner nodeTools 只按声明的 toolId 调用。',
  '搜索只用于定位身份和用途。组合的 slots/aliases 按 compositions[].next 读取；命令字段、必填性、枚举或嵌套结构缺失时，使用已选项的 detailArguments 直接读完整 schema，不换词搜索命令目录。metadataComplete=false 不是完整配置证据。已有完整详情就复用，查询变更后只沿新结果的 nextCursor 分页。',
  'owner 候选是平台标识事实源。serviceId 和 command 必须从同一返回项原样复制；本地化文本只用于语义判断，不得据此翻译、缩写或合成平台标识。无匹配就报告证据缺口。',
  '配置依赖领域字段时先定位指定产品或设备并读取真实物模型；用户自然语言只是跨语言搜索线索，不是字段 ID。字段 ID 和类型只来自用户标准 ID、节点或上游契约、工具结果；查不到就报告证据缺口或问一个业务问题。所有由规则调用方提供的运行时业务参数只需按输入契约引用，不得拿当前规则 ID 或其它页面 ID 代替参数值去查询资源目录；仅用户指定设计期资源时才发现它。',
  'SQL 或脚本可为已验证源字段定义别名，但别名不能反向充当源字段证据；模板占位符必须替换为已验证值。',
  '仅修改、复用、连接、替换或诊断现有节点时查看画布。新增一条独立流程时，不调用 rule_editor_list_nodes 或 rule_editor_get_node_detail，按已发现类型构造 fragment，旧画布保持原样但不进入本轮上下文。',
  'rule_editor_get_node_detail 只接受 inspect/list 返回的真实画布节点 ID；节点类型使用 rule_editor_get_node_type_detail。',
  '节点搜索结果 nodeTypes[].type 是计划步骤的节点类型，提交时必须写入 steps[].nodeType；不得改名为 type，也不得把节点类型当作画布 nodeId。',
  '增量修改先读目标详情并保留 configDigest；结合节点类型详情已经足以生成首次计划时不要继续发现，预检诊断才是补充缺失事实的依据。',
  'connect 引用必须显式区分来源：当前画布节点使用 {kind:"node-id",value:"真实节点ID"}，本计划较早插入的节点使用 {kind:"alias",value:"真实alias"}；不要用裸字符串混用节点 ID 与 alias。',
  '用户目标有明确端到端边界时使用 complete-topology；局部配置使用 partial-draft + targetState=configured，不据此宣称完整业务完成。输出去向尚有业务歧义时先澄清，不自动添加通知、存储或返回节点。根据 owner 契约选择真实入口和终结边界；请求响应需要调用参数入口和结果返回出口，不追加无业务作用的透传或日志节点。既可使用一个真实 composition，也可使用完整的 insert-node/connect 计划，不得混用。运行时参数由上游构造完整命令 envelope，命令节点使用 source=upstream，不用固定参数占位符。',
  'owner 已证明可独立运行并声明结果完成边界时，complete-topology 的 sources 和 terminals 可引用同一节点，零连线不天然不完整。计算结果不能替代用户明确要求的告警、通知或写入动作；已有 targetState.requiredChecks 保持不变。partial-draft 的 completion 仅含 mode，禁止附加 sources/terminals。',
  '使用 rule_editor_apply_canvas_actions 提交结构化计划；客户端负责预检、确认和提交，模型不得生成或复制 preparedPlanId、planDigest。只用 schema 字段；targetState 若需要只能位于计划顶层。预检失败时只修复诊断明确指出的计划字段；部分写入且存在可修复缺口时，读取相关节点的最新 revision/configDigest 后提交增量修复，不重复插入已写入节点。目标已满足时停止工具调用。steps 和 completion 禁止字符串化。',
  '仅当回执缺少所需检查或用户明确要求再次诊断时调用 rule_editor_validate_flow。与本次目标无关的既有问题时，明确区分后停止。不得调用或模拟逐节点 insert、edit、delete、connect、layout。',
].join('\n');

const RULE_EDITOR_RESULT_PROMPT = [
  '最终答复只能依据工具回执中的真实 mutation、verification 和 taskProgress；第一句直接说明完成、部分完成、未执行、已回滚或结果未知。',
  '只要 mutation.status=applied，就必须说明草稿已经修改；taskProgress 未满足时报告为部分完成并列出回执中的未决检查，禁止改写成“未执行”或“未产生可验证结果”。',
  '画布是唯一拓扑可视化。除非用户明确索要，不输出流程图、内部工具名、句柄、节点 ID、调试过程或未出现在回执中的配置；成功写入时用一两句概括草稿变化并说明尚未保存或发布。',
].join('\n');

export const RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS = Object.freeze([
  'rule_editor_list_nodes',
  'rule_editor_get_node_detail',
  'rule_editor_search_node_types',
  'rule_editor_get_node_type_detail',
  'rule_editor_get_node_type_catalog',
  'rule_editor_get_node_type_manual',
  'rule_editor_execute_node_tool',
  APPLY_CANVAS_TOOL_ID,
  'rule_editor_validate_flow',
]);

const nativeFallbackToolIds = new Set<string>(RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS);
const NODE_TYPE_SEARCH_TOOL_ID = 'rule_editor_search_node_types';
const OWNER_DISCOVERY_TOOL_ID = 'rule_editor_execute_node_tool';
const OWNER_RESOURCE_READ_TOOL_IDS = new Set([
  'rule_editor_get_node_type_detail',
  'rule_editor_get_node_type_catalog',
  'rule_editor_get_node_type_manual',
]);
const MAX_NODE_TYPE_SEARCH_TURN_CACHE = 8;
const MAX_OWNER_TOOL_CALL_CACHE = 32;
const MAX_TURN_EVIDENCE = 32;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableJsonValue(value[key])]),
  );
};

const normalizeSearchArguments = (args: Record<string, unknown>) => JSON.stringify(stableJsonValue(args));

const resolveSearchTurnKey = (executionContext?: AiClientToolCall['executionContext']) => {
  const responseId = executionContext?.responseId?.trim();
  return responseId && responseId.length <= 256 ? responseId : undefined;
};

const isNonEmptyNodeTypeSearch = (value: unknown): value is Record<string, unknown> => (
  isRecord(value)
  && value.success !== false
  && value.ok !== false
  && (value.error === undefined || value.error === null || value.error === '')
  && Number.isFinite(Number(value.total))
  && Number(value.total) > 0
);

const toReusedNodeTypeSearch = (value: unknown) => {
  if (!isNonEmptyNodeTypeSearch(value)) return value;
  // Replay the same evidence so typed output bindings remain resolvable, including partial coverage.
  return {
    ...value,
    reused: true,
    searchExecuted: false,
  };
};

const ownerDiscoveryResult = (value: unknown) => {
  if (!isRecord(value) || value.ok === false || value.success === false) return undefined;
  const result = isRecord(value.result) ? value.result : value;
  const incomplete = result.ok === false || result.success === false || result.complete === false
    || Boolean(value.error) || Boolean(result.error)
    || (isRecord(result.manual) && result.manual.truncated === true)
    || result.fieldsTruncated === true
    || (Array.isArray(result.failures) && result.failures.length > 0);
  return incomplete ? undefined : result;
};

type NativeFallbackEvidence = {
  candidateCount: number;
  ownerType?: string;
  authoringMode: 'complete-goal' | 'configured-fragment';
  completionMode: 'complete-topology' | 'partial-draft';
  flowMode?: 'request-response' | 'realtime-stream' | 'one-way-trigger';
  taskTarget: RuleEditorTaskTargetState;
};

const hasNativeFallbackCandidateIdentity = (value: unknown) => (
  isRecord(value)
  && typeof value.serviceId === 'string'
  && Boolean(value.serviceId.trim())
  && typeof value.command === 'string'
  && Boolean(value.command.trim())
);

const nativeFallbackGoalContext = (value: unknown): Pick<
  NativeFallbackEvidence,
  'authoringMode' | 'completionMode' | 'flowMode' | 'taskTarget'
> => {
  const goal = isRecord(value) && isRecord(value.goal) ? value.goal : undefined;
  const flow = typeof goal?.flow === 'string' ? goal.flow : '';
  const flowMode = flow === 'request-response'
    ? 'request-response' as const
    : flow === 'stream'
      ? 'realtime-stream' as const
      : flow === 'event'
        ? 'one-way-trigger' as const
        : undefined;
  // The submitted goal's flow retains its completion obligation; this is not a new boundary inference.
  return flowMode
    ? {
      authoringMode: 'complete-goal',
      completionMode: 'complete-topology',
      flowMode,
      taskTarget: createCompleteRuleEditorTaskTarget(),
    }
    : {
      authoringMode: 'configured-fragment',
      completionMode: 'partial-draft',
      taskTarget: createConfiguredRuleEditorTaskTarget(),
    };
};

const nativeFallbackEvidence = (
  value: unknown,
  goalContext?: ReturnType<typeof nativeFallbackGoalContext>,
): NativeFallbackEvidence | undefined => {
  if (!isRecord(value) || value.nativeFallbackRequired !== true || !Array.isArray(value.nativeCandidates)) {
    return undefined;
  }
  const candidateCount = value.nativeCandidates.filter(hasNativeFallbackCandidateIdentity).length;
  if (!candidateCount) return undefined;
  const diagnostics = isRecord(value.diagnostics) ? value.diagnostics : undefined;
  const ownerType = typeof diagnostics?.ownerType === 'string' ? diagnostics.ownerType.trim() : '';
  const nextAction = isRecord(value.nextAction) ? value.nextAction : undefined;
  const completionMode = goalContext?.completionMode === 'complete-topology'
    ? 'complete-topology' as const
    : nextAction?.completionMode === 'complete-topology'
    ? 'complete-topology' as const
    : nextAction?.completionMode === 'partial-draft'
      ? 'partial-draft' as const
      : goalContext?.completionMode || 'partial-draft';
  const flowMode = goalContext?.flowMode || (nextAction?.flowMode === 'request-response'
    || nextAction?.flowMode === 'realtime-stream'
    || nextAction?.flowMode === 'one-way-trigger'
    ? nextAction.flowMode
    : undefined);
  const authoringMode = completionMode === 'complete-topology'
    ? 'complete-goal' as const
    : 'configured-fragment' as const;
  return {
    candidateCount,
    ...(ownerType ? { ownerType } : {}),
    authoringMode,
    completionMode,
    ...(flowMode ? { flowMode } : {}),
    taskTarget: completionMode === 'complete-topology'
      ? createCompleteRuleEditorTaskTarget()
      : createConfiguredRuleEditorTaskTarget(),
  };
};

const nativeFallbackNextAction = (evidence: NativeFallbackEvidence) => ({
  ...(evidence.ownerType ? { detailTool: 'rule_editor_get_node_type_detail', ownerType: evidence.ownerType } : {}),
  applyTool: APPLY_CANVAS_TOOL_ID,
  ...(evidence.flowMode ? { flowMode: evidence.flowMode } : {}),
  completionMode: evidence.completionMode,
});

const compactNativeCandidateText = (value: unknown, maxLength: number) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, maxLength) : undefined;
};

const projectNativeFallbackCandidate = (value: unknown) => {
  if (!isRecord(value)) return undefined;
  const serviceId = compactNativeCandidateText(value.serviceId, 128);
  const command = compactNativeCandidateText(value.command, 128);
  if (!serviceId || !command) return undefined;
  const label = compactNativeCandidateText(value.commandName, 120)
    || compactNativeCandidateText(value.title, 120)
    || compactNativeCandidateText(value.serviceName, 120);
  const description = compactNativeCandidateText(value.description, 180)
    || compactNativeCandidateText(value.serviceDescription, 180);
  const inputs = (Array.isArray(value.inputs) ? value.inputs : [])
    .filter(isRecord)
    .slice(0, 12)
    .map((input) => {
      const id = compactNativeCandidateText(input.id ?? input.name, 80);
      if (!id) return undefined;
      const name = compactNativeCandidateText(input.name, 120);
      const inputDescription = compactNativeCandidateText(input.description, 180);
      const valueType = input.valueType ?? input.type;
      return {
        id,
        ...(name && name !== id ? { name } : {}),
        ...(inputDescription ? { description: inputDescription } : {}),
        ...(typeof input.required === 'boolean' ? { required: input.required } : {}),
        ...(valueType !== undefined ? { valueType } : {}),
      };
    })
    .filter(isRecord);
  return {
    ...(label && label !== command ? { label } : {}),
    ...(description ? { description } : {}),
    serviceId,
    command,
    inputs,
    ...(typeof value.metadataComplete === 'boolean' ? { metadataComplete: value.metadataComplete } : {}),
    ...(value.metadataComplete === false ? { detailArguments: { serviceId, command } } : {}),
    ...(value.inputsTruncated === true ? { inputsTruncated: true } : {}),
    ...(value.parameterTemplate !== undefined ? { parameterTemplate: value.parameterTemplate } : {}),
    ...(value.output !== undefined ? { output: value.output } : {}),
  };
};

const projectNativeFallbackResult = <T>(value: T, goal?: unknown): T => {
  const evidence = nativeFallbackEvidence(value, nativeFallbackGoalContext(goal));
  if (!evidence || !isRecord(value)) return value;
  // Owner-reported business questions take priority over native continuation; retain their real payload.
  if (value.userInputRequired === true) {
    return {
      ...value,
      authoringMode: evidence.authoringMode,
      nextAction: {
        ...(isRecord(value.nextAction) ? value.nextAction : {}),
        completionMode: evidence.completionMode,
        ...(evidence.flowMode ? { flowMode: evidence.flowMode } : {}),
      },
    } as T;
  }
  const sourceDiagnostics = isRecord(value.diagnostics) ? value.diagnostics : undefined;
  const operationIndex = Number(sourceDiagnostics?.operationIndex);
  const diagnostics = {
    ...(Number.isSafeInteger(operationIndex) ? { operationIndex } : {}),
    ...(evidence.ownerType ? { ownerType: evidence.ownerType } : {}),
  };
  const nativeCandidates = (Array.isArray(value.nativeCandidates) ? value.nativeCandidates : [])
    .map(projectNativeFallbackCandidate)
    .filter(isRecord);
  const projected: Record<string, unknown> = {
    ok: false,
    success: false,
    code: typeof value.code === 'string' ? value.code : 'operation-binding-native-fallback-required',
    effect: 'not-applied',
    completion: 'blocked',
    effectState: 'not-started',
    externalExecutionStarted: false,
    userInputRequired: value.userInputRequired === true,
    failureDisposition: 'request',
    recoveryAction: 'repair',
    retryable: false,
    priorResultAvailable: true,
    requestSatisfied: false,
    nativeFallbackRequired: true,
    sameArgumentsAllowed: false,
    authoringMode: evidence.authoringMode,
    nativeCandidateContract: typeof value.nativeCandidateContract === 'string'
      ? value.nativeCandidateContract
      : 'rule-editor.native-command-candidates/v1',
    nativeCandidateCount: nativeCandidates.length,
    nativeCandidates,
    ...(Object.keys(diagnostics).length ? { diagnostics } : {}),
    nextAction: nativeFallbackNextAction(evidence),
    instruction: evidence.completionMode === 'complete-topology'
      ? 'Candidates cover business operations only. Preserve the original flow and requested scope; resolve outstanding business choices before using nextAction. Reuse candidate identity and read exact detailArguments when metadataComplete=false. Discover only missing owner facts.'
      : 'Reuse the candidate identity for the configured fragment; read exact detailArguments when metadataComplete=false and only missing owner facts.',
  };
  return projected as T;
};

const createNativeToolExecutor = (options: RuleEditorAgentProfileOptions) => {
  const searchByTurnAndArguments = new Map<string, Promise<unknown>>();
  const searchTurns = new Set<string>();
  const ownerToolCalls = new Map<string, Promise<unknown>>();
  const nativeFallbackByTurn = new Map<string, NativeFallbackEvidence>();
  const invalidateOwnerFacts = () => {
    // Canvas writes invalidate config-bound owner queries, while immutable type resources remain valid.
    for (const key of ownerToolCalls.keys()) {
      if (key.split('\u0000')[1] === OWNER_DISCOVERY_TOOL_ID) ownerToolCalls.delete(key);
    }
  };
  const clearSearchTurn = (turnKey: string) => {
    for (const key of searchByTurnAndArguments.keys()) {
      if (key.startsWith(`${turnKey}\u0000`)) searchByTurnAndArguments.delete(key);
    }
    searchTurns.delete(turnKey);
  };
  const trimSearchCache = () => {
    while (searchTurns.size > MAX_NODE_TYPE_SEARCH_TURN_CACHE) {
      const oldestTurn = searchTurns.values().next().value;
      if (typeof oldestTurn !== 'string') break;
      clearSearchTurn(oldestTurn);
    }
  };
  const trimOwnerToolCache = () => {
    while (ownerToolCalls.size > MAX_OWNER_TOOL_CALL_CACHE) {
      const oldestCall = ownerToolCalls.keys().next().value;
      if (typeof oldestCall !== 'string') break;
      ownerToolCalls.delete(oldestCall);
    }
  };
  const trimTurnEvidence = <T>(values: Map<string, T>) => {
    while (values.size > MAX_TURN_EVIDENCE) {
      const oldestTurn = values.keys().next().value;
      if (typeof oldestTurn !== 'string') break;
      values.delete(oldestTurn);
    }
  };
  const observeTurnResult = (
    executionContext: AiClientToolCall['executionContext'] | undefined,
    result: unknown,
  ) => {
    if (isRecord(result) && isRecord(result.mutation)
      && (result.mutation.status === 'applied' || result.mutation.status === 'unknown')) {
      invalidateOwnerFacts();
    }
    const turnKey = resolveSearchTurnKey(executionContext);
    if (!turnKey) return;
    const fallback = nativeFallbackEvidence(result);
    if (fallback) {
      nativeFallbackByTurn.set(turnKey, fallback);
      trimTurnEvidence(nativeFallbackByTurn);
    }
  };
  const executeOwnerTool = (
    toolId: string,
    args: Record<string, unknown>,
    turnKey: string,
    executionContext?: AiClientToolCall['executionContext'],
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => {
    // Owner tools may query different resources or pages; only identical calls are duplicates.
    const cacheKey = `${turnKey}\u0000${toolId}\u0000${normalizeSearchArguments(args)}`;
    const cached = ownerToolCalls.get(cacheKey);
    if (cached) return cached.then(result => (
      ownerDiscoveryResult(result) && isRecord(result)
        ? { ...result, reused: true, ...(toolId === OWNER_DISCOVERY_TOOL_ID ? { discoveryExecuted: false } : {}) }
        : result
    ));

    let pending: Promise<unknown>;
    pending = options.executeInternalTool(
      toolId, args, executionContext, reportProgress, signal,
    ).then((result) => {
      if (!ownerDiscoveryResult(result) && ownerToolCalls.get(cacheKey) === pending) {
        ownerToolCalls.delete(cacheKey);
      }
      return result;
    }, (error) => {
      if (ownerToolCalls.get(cacheKey) === pending) ownerToolCalls.delete(cacheKey);
      throw error;
    });
    ownerToolCalls.set(cacheKey, pending);
    trimOwnerToolCache();
    return pending;
  };
  const execute = (
    toolId: string,
    args: Record<string, unknown>,
    executionContext?: AiClientToolCall['executionContext'],
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => {
    if (signal?.aborted) return Promise.reject(signal.reason || new Error('rule editor tool cancelled'));
    if (options.remoteTools?.some(tool => tool.id === toolId && tool.write === true)) invalidateOwnerFacts();
    const turnKey = resolveSearchTurnKey(executionContext);
    if ((toolId === OWNER_DISCOVERY_TOOL_ID || OWNER_RESOURCE_READ_TOOL_IDS.has(toolId)) && turnKey) {
      return executeOwnerTool(toolId, args, turnKey, executionContext, reportProgress, signal);
    }
    if (toolId !== NODE_TYPE_SEARCH_TOOL_ID) {
      return options.executeInternalTool(toolId, args, executionContext, reportProgress, signal)
        .then((result) => {
          observeTurnResult(executionContext, result);
          return result;
        });
    }
    if (!turnKey) {
      return options.executeInternalTool(toolId, args, executionContext, reportProgress, signal);
    }
    const cacheKey = `${turnKey}\u0000${normalizeSearchArguments(args)}`;
    const cached = searchByTurnAndArguments.get(cacheKey);
    if (cached) return cached.then(toReusedNodeTypeSearch);
    searchTurns.add(turnKey);

    let pending: Promise<unknown>;
    pending = options.executeInternalTool(toolId, args, executionContext, reportProgress, signal)
      .then((result) => {
        if (!isNonEmptyNodeTypeSearch(result) && searchByTurnAndArguments.get(cacheKey) === pending) {
          searchByTurnAndArguments.delete(cacheKey);
        }
        return result;
      }, (error) => {
        if (searchByTurnAndArguments.get(cacheKey) === pending) searchByTurnAndArguments.delete(cacheKey);
        throw error;
      });
    searchByTurnAndArguments.set(cacheKey, pending);
    trimSearchCache();
    return pending;
  };
  return {
    execute,
    observeTurnResult,
    getTaskTargetState: (executionContext?: AiClientToolCall['executionContext']) => {
      const turnKey = resolveSearchTurnKey(executionContext);
      const existingTarget = options.getTaskTargetState?.(executionContext)
        || createCompleteRuleEditorTaskTarget();
      const fallbackTarget = turnKey ? nativeFallbackByTurn.get(turnKey)?.taskTarget : undefined;
      // Native continuation can add obligations, but cannot reduce the trusted target.
      return fallbackTarget ? mergeRuleEditorTaskTarget(existingTarget, fallbackTarget) : existingTarget;
    },
  };
};

const RULE_EDITOR_ORCHESTRATION_UNAVAILABLE_PROMPT = [
  '当前规则编辑器尚未提供可验证的业务能力目录，不得构造 capabilityRef，也不得声明画布已修改。',
  '业务能力和画布读取工具加载后，规则编排能力会由客户端自动恢复。',
].join('\n');

const orchestrationContract = defineAiClientToolContract({
  routingKind: 'action',
  routing: {
    capabilities: ['rule-editor.goal.orchestrate'],
    intents: ['orchestrate-rule-goal'],
    evidencePolicy: 'required',
    validationHints: ['canvas-apply-receipt-exists'],
    exposure: 'auto',
  },
  outputs: [{
    kind: 'state-events', type: 'state', name: 'canvas-apply-receipt', shape: 'rule-editor.canvas-apply-receipt',
    path: '$.receipt', mediaType: 'application/json', audience: 'model-evidence', delivery: 'inline',
  }],
});

const inspectContract = defineAiClientToolContract({
  routingKind: 'discovery',
  routing: { capabilities: ['rule-editor.canvas.inspect'], evidencePolicy: 'optional' },
  outputs: [{
    kind: 'lookup', name: 'canvas-summary', shape: 'rule-editor.canvas-summary', path: '$.summary',
    mediaType: 'application/json', audience: 'model-evidence', delivery: 'inline',
  }],
});

export interface RuleEditorAgentProfileOptions {
  executeInternalTool: (
    toolId: string,
    args: Record<string, unknown>,
    executionContext?: AiClientToolCall['executionContext'],
    reportProgress?: AiClientToolCall['reportProgress'],
    signal?: AbortSignal,
  ) => Promise<unknown>;
  inspectCanvas?: boolean;
  capabilityCatalog?: readonly RuleEditorCapabilityCatalogItem[];
  remoteTools?: readonly RemoteRuleEditorToolDefinition[];
  remoteToolSourceRevision?: string;
  getCanvasContext?: () => unknown;
  getTaskTargetState?: (executionContext?: AiClientToolCall['executionContext']) => RuleEditorTaskTargetState;
  locale?: string;
}

export const createRuleEditorAgentProfile = (options: RuleEditorAgentProfileOptions) => {
  const capabilityCatalog = projectRuleEditorCapabilityCatalog(options.capabilityCatalog);
  const tools: AiClientToolDefinition<Record<string, unknown>>[] = [];
  const nativeToolExecutor = createNativeToolExecutor(options);
  const executeNativeTool = nativeToolExecutor.execute;
  if (capabilityCatalog.length) {
    const orchestrator = createRuleEditorOrchestrator({
      executeInternalTool: options.executeInternalTool,
      capabilityCatalog,
      locale: options.locale,
    });
    tools.push({
      id: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      name: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      displayName: '编排规则目标',
      description: '自然语言业务需求的默认入口：编译 RuleGoal，经本地确认后原子提交画布；明确原生节点或方言时跳过。',
      ...orchestrationContract,
      expands: { _schema: createRuleGoalJsonSchema(capabilityCatalog, options.locale), effect: 'WRITE' },
      annotations: { readOnlyHint: false },
      confirm: {
        localConfirmation: true,
        risk: { readOnly: false, parallelSafe: false },
      },
      prepare: async (args, _context, call) => {
        const result = projectNativeFallbackResult(await orchestrator.prepare(args, call), args);
        nativeToolExecutor.observeTurnResult(call.executionContext, result);
        return result;
      },
      execute: async (args, _context, call) => {
        const result = projectNativeFallbackResult(await orchestrator.execute(args, call));
        nativeToolExecutor.observeTurnResult(call.executionContext, result);
        return result;
      },
    });
  }
  if (options.inspectCanvas) {
    tools.push({
      id: RULE_EDITOR_INSPECT_CANVAS_TOOL_ID,
      name: RULE_EDITOR_INSPECT_CANVAS_TOOL_ID,
      displayName: '查看规则画布',
      description: '读取当前规则画布的有界摘要，不修改画布。',
      ...inspectContract,
      annotations: { readOnlyHint: true },
      execute: async (_args, _context, call) => {
        const result = await options.executeInternalTool(
          'rule_editor_get_graph_summary', {}, call.executionContext, call.reportProgress, call.signal,
        );
        return { ok: true, success: true, summary: result, receipt: projectCanvasApplyReceipt({ mutation: { status: 'not-applied' } }) };
      },
    });
  }
  const orderedRemoteTools = orderRuleEditorRemoteTools(options.remoteTools || []);
  const nativePrepareTool = orderedRemoteTools.find(tool => tool.id === PREPARE_CANVAS_TOOL_ID);
  const nativeTools = orderedRemoteTools
    .filter(tool => nativeFallbackToolIds.has(tool.id))
    .map((tool) => {
      const modelFacingTool = tool.id === APPLY_CANVAS_TOOL_ID && nativePrepareTool
        ? {
          ...tool,
          description: '提交结构化画布计划。客户端自动预检，在用户确认后原子应用；只使用 schema 已声明字段，targetState 仅可位于计划顶层；不要提供内部计划句柄。',
          inputs: nativePrepareTool.inputs,
          expands: nativePrepareTool.expands,
        }
        : tool.id === NODE_TYPE_SEARCH_TOOL_ID
          ? {
            ...tool,
            description: '按未解决角色发现可用节点，复用已有候选。命令候选不等于完整拓扑；保留原始 flowMode 与明确的业务边界。',
          }
        : tool;
      const definition = toRuleEditorClientToolDefinition(
        modelFacingTool,
        (toolId, args, executionContext, reportProgress, signal) => executeNativeTool(
          toolId, args, executionContext, reportProgress, signal,
        ),
        options.remoteToolSourceRevision,
        options.getCanvasContext,
        nativeToolExecutor.getTaskTargetState,
      );
      if (tool.id === APPLY_CANVAS_TOOL_ID && nativePrepareTool) {
        definition.prepare = async (args, _context, call) => {
          const prepared = await executeNativeTool(
            PREPARE_CANVAS_TOOL_ID,
            args,
            call.executionContext,
            call.reportProgress,
            call.signal,
          );
          if (isRecord(prepared) && (prepared.ok === false || prepared.success === false)) {
            return prepared as any;
          }
          const preparedPlanId = isRecord(prepared) ? String(prepared.preparedPlanId || '').trim() : '';
          const planDigest = isRecord(prepared) ? String(prepared.planDigest || '').trim() : '';
          if (!preparedPlanId || !planDigest) {
            return {
              ok: false,
              success: false,
              code: 'rule_editor.canvas_prepared_plan.invalid_result',
              failureDisposition: 'tool',
              recoveryAction: 'terminal',
              instruction: '规则画布预检没有返回可执行句柄，本次未修改画布。',
            } as any;
          }
          const previewValue = isRecord(prepared) ? prepared.previewSummary : undefined;
          const preview = isRecord(previewValue) ? previewValue : undefined;
          const nodeCount = Number(preview?.nodeCount);
          const linkCount = Number(preview?.linkCount);
          const confirmation = resolveRuleEditorApplyConfirmationText(args, { nodeCount, linkCount });
          return {
            arguments: { preparedPlanId, planDigest },
            confirmation: {
              title: confirmation.title,
              content: confirmation.content,
            },
          };
        };
      }
      return definition;
    });
  tools.push(...nativeTools);
  const prompts = [
    RULE_EDITOR_LANGUAGE_PROMPT,
    capabilityCatalog.length ? RULE_EDITOR_ORCHESTRATION_PROMPT : '',
    nativeTools.length ? RULE_EDITOR_NATIVE_AUTHORING_PROMPT : '',
    capabilityCatalog.length || nativeTools.length ? RULE_EDITOR_RESULT_PROMPT : '',
  ].filter(Boolean);
  return {
    id: RULE_EDITOR_ORCHESTRATION_PROFILE_ID,
    prompt: prompts.length > 1
      ? prompts.join('\n')
      : `${RULE_EDITOR_LANGUAGE_PROMPT}\n${RULE_EDITOR_ORCHESTRATION_UNAVAILABLE_PROMPT}`,
    tools,
  };
};
