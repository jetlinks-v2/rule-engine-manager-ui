import i18n from '@jetlinks-web-core/locales';
import {
  createHomeAgentContinuationReceipt,
  registerHomeAgentCapabilityProvider,
  type HomeAgentCapabilityContext,
  type HomeAgentCapabilityProvider,
  type HomeAgentWorkflowGuide,
} from '@jetlinks-web-core/layout/components/AiChat/homeAgentCapabilities';
import type { AiClientToolDefinition } from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import { saveAiAgentHandoff } from '@jetlinks-web-core/layout/components/AiChat/agentHandoff';
import { saveRule } from '../../api/instance';

const RULE_INSTANCE_MENU_CODE = 'rule-engine/Instance';
const RULE_INSTANCE_PATH = '/iot/rule-engine/Instance';
const RULE_EDITOR_CLIENT_ID = 'ruleEditorChat';
const RULE_EDITOR_SUBJECT_TYPE = 'ruleInstance';
const CREATE_RULE_DRAFT_TOOL = 'rule_engine_create_rule_draft';
const MAX_RULE_NAME_LENGTH = 32;
const MAX_RULE_DESCRIPTION_LENGTH = 200;

const TOOL_INPUTS = [
  'name',
  'description',
  'summary',
  'userGoal',
  'sourceContext',
  'product',
  'productId',
  'productName',
  'event',
  'eventId',
  'eventName',
  'action',
  'actionType',
  'kafka',
  'missingItems',
];

const normalizeText = (value: unknown) => String(value || '').trim();

const isPlainRecord = (value: unknown): value is Record<string, any> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const truncateText = (value: unknown, maxLength: number) => {
  const text = normalizeText(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
};

const toRecord = (value: unknown): Record<string, any> => (
  isPlainRecord(value)
    ? value
    : {}
);

const firstTextArg = (args: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    const text = normalizeText(args[key]);
    if (text) return text;
  }
  return '';
};

const firstRecordText = (record: Record<string, any>, ...keys: string[]) => {
  for (const key of keys) {
    const text = normalizeText(record[key]);
    if (text) return text;
  }
  return '';
};

const compactDefined = (value: Record<string, any>) => (
  Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (Array.isArray(item)) return item.length > 0;
    return item !== undefined && item !== null && item !== '';
  }))
);

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? text.split(/[,，;\n]/).map(normalizeText).filter(Boolean) : [];
};

const isRuleInstanceRoute = (context: HomeAgentCapabilityContext) => (
  context.currentRoute.path === RULE_INSTANCE_PATH
  || context.currentRoute.name === RULE_INSTANCE_MENU_CODE
  || context.currentView === RULE_INSTANCE_MENU_CODE
);

const isRuleInstanceAvailable = (context: HomeAgentCapabilityContext) => (
  !!context.findMenu(RULE_INSTANCE_MENU_CODE)
  || !!context.findMenu(RULE_INSTANCE_PATH)
);

const resolveProductSummary = (args: Record<string, any>) => {
  const product = toRecord(args.product);
  return compactDefined({
    id: firstTextArg(args, 'productId') || firstRecordText(product, 'id', 'productId', 'value'),
    name: firstTextArg(args, 'productName') || firstRecordText(product, 'name', 'productName', 'label', 'text'),
  });
};

const resolveEventSummary = (args: Record<string, any>) => {
  const event = toRecord(args.event);
  return compactDefined({
    id: firstTextArg(args, 'eventId') || firstRecordText(event, 'id', 'eventId', 'value'),
    name: firstTextArg(args, 'eventName') || firstRecordText(event, 'name', 'eventName', 'label', 'text'),
  });
};

const resolveActionSummary = (args: Record<string, any>) => {
  const action = toRecord(args.action);
  const kafka = toRecord(args.kafka);
  return compactDefined({
    type: firstTextArg(args, 'actionType') || firstRecordText(action, 'type', 'actionType', 'kind') || (Object.keys(kafka).length ? 'kafka' : ''),
    name: firstRecordText(action, 'name', 'label', 'text'),
    kafka: compactDefined({
      topic: firstRecordText(kafka, 'topic', 'topicName'),
      broker: firstRecordText(kafka, 'broker', 'brokerAddress', 'bootstrapServers'),
      auth: firstRecordText(kafka, 'auth', 'security', 'securityProtocol'),
    }),
  });
};

const resolveUserGoal = (args: Record<string, any>, context: HomeAgentCapabilityContext) => (
  firstTextArg(args, 'userGoal', 'goal', 'requirement', 'prompt')
  || normalizeText(context.latestUserMessage?.content)
);

const resolveRuleName = (args: Record<string, any>) => {
  const explicit = firstTextArg(args, 'name', 'ruleName', 'title', 'shortTitle');
  if (explicit) {
    return truncateText(explicit, MAX_RULE_NAME_LENGTH);
  }

  return i18n.global.t('Instance.homeAgent.ruleDraft.fallbackShortName');
};

const resolveRuleDescription = (args: Record<string, any>, userGoal: string) => (
  truncateText(
    firstTextArg(args, 'description', 'summary', 'ruleSummary', 'abstract', 'describe')
    || userGoal
    || i18n.global.t('Instance.homeAgent.ruleDraft.defaultDescription'),
    MAX_RULE_DESCRIPTION_LENGTH,
  )
);

const createHandoffContext = (
  args: Record<string, any>,
  context: HomeAgentCapabilityContext,
  rule: Record<string, any>,
  userGoal: string,
) => {
  const latestUserMessage = context.latestUserMessage
    ? {
        id: context.latestUserMessage.id,
        content: context.latestUserMessage.content,
        createdAt: context.latestUserMessage.createdAt,
      }
    : undefined;

  return compactDefined({
    sourcePage: 'runtime-home',
    sourceContext: firstTextArg(args, 'sourceContext', 'context'),
    userGoal,
    rule,
    product: resolveProductSummary(args),
    event: resolveEventSummary(args),
    action: resolveActionSummary(args),
    missingItems: normalizeList(args.missingItems || args.missing),
    latestUserMessage,
  });
};

const ensureCreateSuccess = (response: any) => {
  const status = Number(response?.status);
  const code = Number(response?.code);
  if (
    response?.success === false
    || (Number.isFinite(status) && (status < 200 || status >= 300))
    || (Number.isFinite(code) && code !== 0 && code !== 200)
  ) {
    throw new Error(response?.message || 'rule draft create failed');
  }
};

const resolveResponsePayload = (response: any) => {
  const candidates = [
    response?.result,
    response?.data?.result,
    response?.data,
    response,
  ];
  return candidates.find(isPlainRecord) || {};
};

const resolveCreatedRule = (response: any, draft: Record<string, any>) => {
  ensureCreateSuccess(response);

  const payload = resolveResponsePayload(response);
  const rule = compactDefined({
    ...draft,
    ...payload,
    id: firstRecordText(payload, 'id', 'ruleId') || normalizeText(draft.id),
    name: firstRecordText(payload, 'name') || normalizeText(draft.name),
    description: firstRecordText(payload, 'description', 'describe') || normalizeText(draft.description),
  });

  if (!rule.id) {
    throw new Error(i18n.global.t('Instance.homeAgent.tool.create.missingRuleId'));
  }

  return rule;
};

const buildRuleEditorLink = (ruleId: string) => {
  const params = new URLSearchParams({
    route: RULE_INSTANCE_MENU_CODE,
    menu: RULE_INSTANCE_MENU_CODE,
    query: JSON.stringify({ editorId: ruleId }),
  });
  return `#${params.toString()}`;
};

const createDraftAndHandoff = async (
  args: Record<string, any> = {},
  context: HomeAgentCapabilityContext,
) => {
  if (!isRuleInstanceAvailable(context)) {
    return {
      ok: false,
      error: i18n.global.t('Instance.homeAgent.tool.create.noPermission'),
    };
  }

  const userGoal = resolveUserGoal(args, context);
  const name = resolveRuleName(args);
  const description = resolveRuleDescription(args, userGoal);
  const draft = { name, description };

  const rule = resolveCreatedRule(await saveRule(draft), draft);
  const ruleId = String(rule.id);
  const ruleName = normalizeText(rule.name) || name;
  const ruleDescription = normalizeText(rule.description);
  const query = { editorId: ruleId };

  // The home agent only creates an empty draft. Canvas edits remain owned by ruleEditorChat.
  const handoffPrepared = saveAiAgentHandoff({
    clientId: RULE_EDITOR_CLIENT_ID,
    subjectType: RULE_EDITOR_SUBJECT_TYPE,
    subjectId: ruleId,
    subjectName: ruleName,
    routeName: RULE_INSTANCE_MENU_CODE,
    menuCode: RULE_INSTANCE_MENU_CODE,
    prompt: userGoal || i18n.global.t('Instance.homeAgent.ruleDraft.continuePrompt', [ruleName]),
    label: i18n.global.t('Instance.homeAgent.ruleDraft.handoffLabel', [ruleName]),
    source: 'rule-instance-home',
    context: createHandoffContext(args, context, rule, userGoal),
  });
  context.navigateToMenu(RULE_INSTANCE_MENU_CODE, { query })
    || context.navigateToMenu(RULE_INSTANCE_PATH, { query });

  const navigation = {
    menuCode: RULE_INSTANCE_MENU_CODE,
    routeName: RULE_INSTANCE_MENU_CODE,
    path: RULE_INSTANCE_PATH,
    query,
    link: buildRuleEditorLink(ruleId),
    markdownLink: `[${ruleName}](${buildRuleEditorLink(ruleId)})`,
  };

  return {
    ok: true,
    created: {
      type: RULE_EDITOR_SUBJECT_TYPE,
      id: ruleId,
      name: ruleName,
      description: ruleDescription,
    },
    rule: {
      id: ruleId,
      name: ruleName,
      description: ruleDescription,
    },
    subject: {
      type: RULE_EDITOR_SUBJECT_TYPE,
      id: ruleId,
      name: ruleName,
      subjectType: RULE_EDITOR_SUBJECT_TYPE,
      subjectId: ruleId,
      subjectName: ruleName,
    },
    continuation: createHomeAgentContinuationReceipt({
      targetName: i18n.global.t('Instance.homeAgent.continuation.targetName'),
      targetClientId: RULE_EDITOR_CLIENT_ID,
      targetMenuCode: RULE_INSTANCE_MENU_CODE,
      routeName: RULE_INSTANCE_MENU_CODE,
      path: RULE_INSTANCE_PATH,
      subjectType: RULE_EDITOR_SUBJECT_TYPE,
      subjectId: ruleId,
      subjectName: ruleName,
      businessObject: {
        type: RULE_EDITOR_SUBJECT_TYPE,
        id: ruleId,
        name: ruleName,
        description: ruleDescription,
      },
      navigation,
      contextPrepared: !!handoffPrepared,
    }),
    navigation,
    ruleName,
    summary: i18n.global.t('Instance.homeAgent.tool.create.summary', [ruleName]),
    nextAction: i18n.global.t('Instance.homeAgent.tool.create.nextAction'),
    replyPolicy: i18n.global.t('Instance.homeAgent.tool.create.replyPolicy'),
  };
};

const getPromptExamples = () => [
  i18n.global.t('Instance.homeAgent.prompt.createKafkaRule'),
  i18n.global.t('Instance.homeAgent.prompt.createEventRule'),
  i18n.global.t('Instance.homeAgent.prompt.openRuleEditor'),
];

const getWorkflowGuides = (): HomeAgentWorkflowGuide[] => [
  {
    id: 'rule-engine-instance:create-draft-continue',
    name: i18n.global.t('Instance.homeAgent.workflow.createDraft.name'),
    description: i18n.global.t('Instance.homeAgent.workflow.createDraft.description'),
    when: i18n.global.t('Instance.homeAgent.workflow.createDraft.when'),
    keywords: ['rule', 'rule engine', 'orchestration', 'kafka', '规则', '规则编排', '转发', '创建规则'],
    priority: 100,
    steps: [
      {
        title: i18n.global.t('Instance.homeAgent.workflow.createDraft.step.resolve.title'),
        description: i18n.global.t('Instance.homeAgent.workflow.createDraft.step.resolve.description'),
        required: true,
      },
      {
        title: i18n.global.t('Instance.homeAgent.workflow.createDraft.step.create.title'),
        description: i18n.global.t('Instance.homeAgent.workflow.createDraft.step.create.description'),
        tools: [CREATE_RULE_DRAFT_TOOL],
        required: true,
      },
    ],
    output: i18n.global.t('Instance.homeAgent.workflow.createDraft.output'),
  },
];

const createRuleInstanceTools = (): AiClientToolDefinition<HomeAgentCapabilityContext>[] => ([
  {
    id: CREATE_RULE_DRAFT_TOOL,
    name: CREATE_RULE_DRAFT_TOOL,
    displayName: i18n.global.t('Instance.homeAgent.tool.create.displayName'),
    progressText: i18n.global.t('Instance.homeAgent.tool.create.progressText'),
    description: i18n.global.t('Instance.homeAgent.tool.create.description'),
    help: i18n.global.t('Instance.homeAgent.tool.create.help'),
    inputs: TOOL_INPUTS.map((id) => ({
      id,
      name: id,
      description: i18n.global.t(`Instance.homeAgent.tool.create.input.${id}`),
      required: id === 'name' ? false : undefined,
      valueType: ['product', 'event', 'action', 'kafka'].includes(id)
        ? { type: 'object' }
        : id === 'missingItems'
          ? { type: 'array' }
          : 'string',
    })),
    output: { type: 'object' },
    annotations: { readOnlyHint: false, destructiveHint: false },
    confirm: {
      localConfirmation: true,
      title: i18n.global.t('Instance.homeAgent.tool.create.confirmTitle'),
      content: (toolArgs) => i18n.global.t('Instance.homeAgent.tool.create.confirmContent', [
        resolveRuleName(toolArgs),
      ]),
      okText: i18n.global.t('Instance.homeAgent.tool.create.confirmOk'),
      cancelText: i18n.global.t('verify.cancel'),
      risk: { readOnly: false, parallelSafe: false },
    },
    execute: createDraftAndHandoff,
  },
]);

const createRuleInstanceCapabilities = (context: HomeAgentCapabilityContext) => [{
  id: 'rule-engine-instance:create-draft',
  name: i18n.global.t('Instance.homeAgent.capability.createDraft.name'),
  description: i18n.global.t('Instance.homeAgent.capability.createDraft.description'),
  kind: 'tool' as const,
  category: 'rule-engine-instance',
  menuCode: RULE_INSTANCE_MENU_CODE,
  routeName: RULE_INSTANCE_MENU_CODE,
  path: RULE_INSTANCE_PATH,
  order: 20,
  keywords: ['rule', 'rule engine', 'orchestration', 'kafka', 'scene', '规则', '规则引擎', '规则编排', '转发'],
  metadata: {
    currentRoute: isRuleInstanceRoute(context),
    promptExamples: getPromptExamples(),
    continuation: {
      targetName: i18n.global.t('Instance.homeAgent.continuation.targetName'),
      targetClientId: RULE_EDITOR_CLIENT_ID,
      targetMenuCode: RULE_INSTANCE_MENU_CODE,
      toolId: CREATE_RULE_DRAFT_TOOL,
      promptPolicy: i18n.global.t('Instance.homeAgent.continuation.promptPolicy'),
      blockingFacts: [
        i18n.global.t('Instance.homeAgent.continuation.blockingFact.name'),
      ],
    },
  },
}];

export const ruleInstanceHomeAgentProvider: HomeAgentCapabilityProvider = {
  id: 'rule-engine-instance',
  order: 100,
  getCapabilities: (context) => (isRuleInstanceAvailable(context) ? createRuleInstanceCapabilities(context) : []),
  getClientTools: (context) => (isRuleInstanceAvailable(context) ? createRuleInstanceTools() : []),
  getPromptExamples: (context) => (isRuleInstanceRoute(context) ? getPromptExamples() : []),
  getWorkflowGuides: (context) => (isRuleInstanceAvailable(context) ? getWorkflowGuides() : []),
  getSystemPromptLines: (context) => (isRuleInstanceAvailable(context)
    ? i18n.global.t('Instance.homeAgent.prompt.system')
    : []),
};

export const registerRuleInstanceHomeAgentProvider = () => (
  registerHomeAgentCapabilityProvider(ruleInstanceHomeAgentProvider)
);

export default ruleInstanceHomeAgentProvider;
