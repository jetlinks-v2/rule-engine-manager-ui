import type { AiClientToolProgress } from '@jetlinks-web-core/layout/components/AiChat/clientTools';

export const RULE_EDITOR_ORCHESTRATION_PROFILE_ID = 'rule-editor-orchestration/v3' as const;
export const RULE_EDITOR_RESOLVE_CAPABILITIES_TOOL_ID = 'rule_editor_resolve_capabilities' as const;
export const RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID = 'rule_editor_orchestrate_goal' as const;
export const RULE_EDITOR_INSPECT_CANVAS_TOOL_ID = 'rule_editor_inspect_canvas' as const;

export type RuleGoalFlow = 'request-response' | 'event' | 'stream';

export type RuleEditorLocalizedCapabilityText = string | Record<string, string>;

export interface RuleEditorDiscoveryHintPolicy {
  required: boolean;
  locale?: string;
  maxItems: number;
  maxLength: number;
}

export type RuleEditorCapabilityEffect = 'READ' | 'WRITE';

export interface RuleEditorCapabilityContractField {
  name: string;
  type: string;
  required: boolean;
}

export interface RuleEditorCapabilityContract {
  kind: string;
  open: boolean;
  uncertain: boolean;
  fields: RuleEditorCapabilityContractField[];
}

export interface RuleEditorCapabilityBindingPolicy {
  completeObjectTargets: string[];
  acceptedSourceTypes: string[];
  fieldOverrides: boolean;
}

export interface RuleEditorCapabilityCatalogItem {
  capabilityId: string;
  localizedName: RuleEditorLocalizedCapabilityText;
  localizedDescription: RuleEditorLocalizedCapabilityText;
  discoveryHintPolicy: RuleEditorDiscoveryHintPolicy;
  selectionRequired?: boolean;
  effect: RuleEditorCapabilityEffect;
  inputContract?: RuleEditorCapabilityContract;
  outputContract?: RuleEditorCapabilityContract;
  bindingPolicy?: RuleEditorCapabilityBindingPolicy;
}

export interface RuleEditorCapabilityCatalogDiagnostic {
  code: 'invalid-entry' | 'duplicate-capability-id' | 'catalog-truncated';
  capabilityId?: string;
  index?: number;
}

export interface RuleEditorCapabilityCatalogReport {
  items: RuleEditorCapabilityCatalogItem[];
  diagnostics: RuleEditorCapabilityCatalogDiagnostic[];
  sourceCount: number;
  truncated: boolean;
}

export interface RuleGoal {
  goal: {
    flow: RuleGoalFlow;
    inputs?: Array<{ name: string; type: string; description?: string }>;
    operations: Array<{
      intent: string;
      capabilityRef: string;
      candidateRef?: string;
      discoveryHints?: string[];
      bindings?: Record<string, string>;
      output?: string;
    }>;
    output?: Record<string, string>;
  };
}

export type RuleEditorOrchestrationState =
  | 'idle'
  | 'resolving'
  | 'compiling'
  | 'previewing'
  | 'awaiting_confirmation'
  | 'awaiting_input'
  | 'applying'
  | 'verifying'
  | 'completed'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'unknown'
  | 'rolled_back'
  | 'not_applied';

export type CanvasApplyEffect = 'not-applied' | 'applied' | 'rolled-back' | 'unknown';
export type CanvasApplyCompletion = 'completed' | 'partial' | 'blocked' | 'awaiting-input' | 'failed';
export type CanvasApplyVerificationCheck = 'topology' | 'configuration' | 'bindings' | 'execution';

export interface CanvasApplyTaskProgress {
  satisfied?: boolean;
  requiredChecks?: CanvasApplyVerificationCheck[];
  unresolved?: Array<{ code: string; message?: string }>;
}

export interface CanvasApplyReceipt {
  effect: CanvasApplyEffect;
  completion: CanvasApplyCompletion;
  requestId?: string;
  planDigest?: string;
  baseRevision?: number;
  newRevision?: number;
  effectState?: 'not-started' | 'rolled-back' | 'unknown';
  externalExecutionStarted?: false;
  changes?: Array<{ kind: string }>;
  unmet?: Array<{ code: string; message?: string }>;
  verification?: Record<string, { status: 'pass' | 'fail' | 'unknown' | 'not-required' }>;
  taskProgress?: CanvasApplyTaskProgress;
  instruction?: string;
}

export interface RuleEditorOrchestrationProgress extends AiClientToolProgress {
  version: 'client-tool-progress/v1';
  stepId: RuleEditorOrchestrationState;
}

const record = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const boundedText = (value: unknown, max = 128): string | undefined => (
  typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined
);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => (
  Object.keys(value).every(key => keys.includes(key))
);

const nonNegativeInteger = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
);

const verificationChecks: readonly CanvasApplyVerificationCheck[] = [
  'topology', 'configuration', 'bindings', 'execution',
];

const canvasEffect = (value: unknown): CanvasApplyEffect | undefined => (
  value === 'applied' || value === 'rolled-back' || value === 'unknown' || value === 'not-applied'
    ? value
    : undefined
);

const projectTaskProgress = (value: unknown): CanvasApplyTaskProgress | undefined => {
  if (!record(value)) return undefined;
  const result: CanvasApplyTaskProgress = {};
  if (typeof value.satisfied === 'boolean') result.satisfied = value.satisfied;
  if (Array.isArray(value.requiredChecks)
    && value.requiredChecks.length <= verificationChecks.length
    && value.requiredChecks.every((check, index, checks) => (
      verificationChecks.includes(check as CanvasApplyVerificationCheck)
      && checks.indexOf(check) === index
    ))) {
    result.requiredChecks = value.requiredChecks as CanvasApplyVerificationCheck[];
  }
  if (Array.isArray(value.unresolved)
    && value.unresolved.length <= 8
    && value.unresolved.every(item => record(item) && Boolean(boundedText(item.code)))) {
    result.unresolved = value.unresolved.map(item => {
      const issue = item as Record<string, unknown>;
      const message = boundedText(issue.message, 256);
      return {
        code: boundedText(issue.code)!,
        ...(message ? { message } : {}),
      };
    });
  }
  return Object.keys(result).length ? result : undefined;
};

export const RULE_EDITOR_CAPABILITY_CATALOG_LIMIT = 64;
const RULE_EDITOR_CAPABILITY_DIAGNOSTIC_LIMIT = 16;
const RULE_GOAL_STRING_MAP_LIMIT = 32;
const RULE_GOAL_STRING_MAP_KEY_LIMIT = 128;
const RULE_GOAL_SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const RULE_GOAL_SYMBOL_SCHEMA_PATTERN = '^[A-Za-z][A-Za-z0-9_-]*$';
const RULE_GOAL_OUTPUT_REFERENCE_PATTERN = /^\$([A-Za-z][A-Za-z0-9_-]*)(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)?$/;
const RULE_GOAL_OUTPUT_REFERENCE_SCHEMA_PATTERN = '^\\$[A-Za-z][A-Za-z0-9_-]*(?:\\.[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)?$';
const RESERVED_MAP_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const validStringMapKey = (key: string): boolean => (
  Boolean(key)
  && key.length <= RULE_GOAL_STRING_MAP_KEY_LIMIT
  && key === key.trim()
  && !CONTROL_CHARACTER_PATTERN.test(key)
  && !RESERVED_MAP_KEYS.has(key)
);

const normalizeStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!record(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > RULE_GOAL_STRING_MAP_LIMIT) return undefined;
  const normalized: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (!validStringMapKey(key)) return undefined;
    const text = boundedText(entry, 512);
    if (!text) return undefined;
    normalized[key] = text;
  }
  return normalized;
};

const normalizeDiscoveryHints = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length > 4) return undefined;
  const hints: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const hint = boundedText(entry, 48);
    if (!hint) return undefined;
    if (!seen.has(hint)) {
      seen.add(hint);
      hints.push(hint);
    }
  }
  return hints;
};

const normalizeCapabilityContract = (value: unknown): RuleEditorCapabilityContract | undefined => {
  if (!record(value)) return undefined;
  const kind = boundedText(value.kind, 96);
  if (!kind || !Array.isArray(value.fields) || value.fields.length > 16) return undefined;
  const fields: RuleEditorCapabilityContractField[] = [];
  for (const field of value.fields) {
    if (!record(field)) return undefined;
    const name = boundedText(field.name, 96);
    const type = boundedText(field.type, 64);
    if (!name || !type || typeof field.required !== 'boolean') return undefined;
    fields.push({ name, type, required: field.required });
  }
  return {
    kind,
    open: value.open === true,
    uncertain: value.uncertain === true,
    fields,
  };
};

const normalizeBoundedTextArray = (
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | undefined => {
  if (!Array.isArray(value) || !value.length || value.length > maxItems) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    const text = boundedText(entry, maxLength);
    if (!text) return undefined;
    if (!result.includes(text)) result.push(text);
  }
  return result.length ? result : undefined;
};

const normalizeCapabilityBindingPolicy = (value: unknown): RuleEditorCapabilityBindingPolicy | undefined => {
  if (!record(value) || !hasOnlyKeys(value, [
    'completeObjectTargets', 'acceptedSourceTypes', 'fieldOverrides',
  ])) return undefined;
  const completeObjectTargets = normalizeBoundedTextArray(value.completeObjectTargets, 8, 96);
  const acceptedSourceTypes = normalizeBoundedTextArray(value.acceptedSourceTypes, 4, 96);
  if (!completeObjectTargets || !acceptedSourceTypes || value.fieldOverrides !== true) return undefined;
  return { completeObjectTargets, acceptedSourceTypes, fieldOverrides: true };
};

const normalizeLocalizedCapabilityText = (
  value: unknown,
  maxLength: number,
): RuleEditorLocalizedCapabilityText | undefined => {
  const text = boundedText(value, maxLength);
  if (text) return text;
  if (!record(value)) return undefined;
  const localized: Record<string, string> = {};
  for (const [rawLocale, rawText] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).slice(0, 8)) {
    const locale = boundedText(rawLocale, 32);
    const localizedText = boundedText(rawText, maxLength);
    if (locale && localizedText) localized[locale] = localizedText;
  }
  return Object.keys(localized).length ? localized : undefined;
};

const normalizeDiscoveryHintPolicy = (value: unknown): RuleEditorDiscoveryHintPolicy => {
  const policy = record(value) ? value : {};
  const locale = boundedText(policy.locale, 32);
  const maxItems = typeof policy.maxItems === 'number' && Number.isSafeInteger(policy.maxItems)
    ? Math.min(4, Math.max(1, policy.maxItems))
    : 4;
  const maxLength = typeof policy.maxLength === 'number' && Number.isSafeInteger(policy.maxLength)
    ? Math.min(48, Math.max(1, policy.maxLength))
    : 48;
  return {
    required: policy.required === true,
    ...(locale ? { locale } : {}),
    maxItems,
    maxLength,
  };
};

export const projectRuleEditorCapabilityCatalogReport = (
  catalog: readonly unknown[] | undefined,
): RuleEditorCapabilityCatalogReport => {
  const diagnostics: RuleEditorCapabilityCatalogDiagnostic[] = [];
  const addDiagnostic = (diagnostic: RuleEditorCapabilityCatalogDiagnostic) => {
    if (diagnostics.length < RULE_EDITOR_CAPABILITY_DIAGNOSTIC_LIMIT) diagnostics.push(diagnostic);
  };
  if (!Array.isArray(catalog)) {
    return { items: [], diagnostics, sourceCount: 0, truncated: false };
  }
  const projected: Array<{ item: RuleEditorCapabilityCatalogItem; index: number }> = [];
  const capabilityIdOccurrences = new Map<string, { count: number; firstIndex: number }>();
  catalog.forEach((entry, index) => {
    if (!record(entry)) {
      addDiagnostic({ code: 'invalid-entry', index });
      return;
    }
    const capabilityId = boundedText(entry.capabilityId);
    if (capabilityId) {
      const occurrence = capabilityIdOccurrences.get(capabilityId);
      capabilityIdOccurrences.set(capabilityId, occurrence
        ? { ...occurrence, count: occurrence.count + 1 }
        : { count: 1, firstIndex: index });
    }
    const localizedName = normalizeLocalizedCapabilityText(entry.localizedName, 256);
    const localizedDescription = normalizeLocalizedCapabilityText(entry.localizedDescription, 512);
    const effect = entry.effect === 'READ' || entry.effect === 'WRITE' ? entry.effect : undefined;
    const inputContract = normalizeCapabilityContract(entry.inputContract);
    const outputContract = normalizeCapabilityContract(entry.outputContract);
    const bindingPolicy = normalizeCapabilityBindingPolicy(entry.bindingPolicy);
    if (!capabilityId || !localizedName || !localizedDescription || !effect
      || (entry.inputContract !== undefined && !inputContract)
      || (entry.outputContract !== undefined && !outputContract)
      || (entry.bindingPolicy !== undefined && !bindingPolicy)) {
      addDiagnostic({ code: 'invalid-entry', ...(capabilityId ? { capabilityId } : {}), index });
      return;
    }
    projected.push({ item: {
      capabilityId,
      localizedName,
      localizedDescription,
      discoveryHintPolicy: normalizeDiscoveryHintPolicy(entry.discoveryHintPolicy),
      selectionRequired: entry.selectionRequired === true,
      effect,
      ...(inputContract ? { inputContract } : {}),
      ...(outputContract ? { outputContract } : {}),
      ...(bindingPolicy ? { bindingPolicy } : {}),
    }, index });
  });
  const duplicateCapabilityIds = new Set<string>();
  for (const [capabilityId, occurrence] of capabilityIdOccurrences) {
    if (occurrence.count <= 1) continue;
    duplicateCapabilityIds.add(capabilityId);
    addDiagnostic({ code: 'duplicate-capability-id', capabilityId, index: occurrence.firstIndex });
  }
  const unique: RuleEditorCapabilityCatalogItem[] = [];
  for (const candidate of projected) {
    if (!duplicateCapabilityIds.has(candidate.item.capabilityId)) unique.push(candidate.item);
  }
  unique.sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  const truncated = unique.length > RULE_EDITOR_CAPABILITY_CATALOG_LIMIT;
  if (truncated) addDiagnostic({ code: 'catalog-truncated' });
  return {
    items: unique.slice(0, RULE_EDITOR_CAPABILITY_CATALOG_LIMIT),
    diagnostics,
    sourceCount: catalog.length,
    truncated,
  };
};

export const projectRuleEditorCapabilityCatalog = (
  catalog: readonly unknown[] | undefined,
): RuleEditorCapabilityCatalogItem[] => projectRuleEditorCapabilityCatalogReport(catalog).items;

const ruleGoalStringMapSchema = {
  type: 'object',
  maxProperties: RULE_GOAL_STRING_MAP_LIMIT,
  propertyNames: {
    type: 'string',
    minLength: 1,
    maxLength: RULE_GOAL_STRING_MAP_KEY_LIMIT,
    pattern: '^(?!__proto__$|constructor$|prototype$)(?!\\s)(?!.*\\s$)[^\\u0000-\\u001f\\u007f]+$',
  },
  additionalProperties: { type: 'string', minLength: 1, maxLength: 512 },
};

const ruleGoalOutputMapSchema = {
  ...ruleGoalStringMapSchema,
  additionalProperties: {
    type: 'string',
    minLength: 2,
    maxLength: 512,
    pattern: RULE_GOAL_OUTPUT_REFERENCE_SCHEMA_PATTERN,
  },
};

const localizedCapabilityText = (
  value: RuleEditorLocalizedCapabilityText,
  locale?: string,
): string => {
  if (typeof value === 'string') return value;
  const normalizedLocale = boundedText(locale, 32)?.replace('_', '-').toLowerCase();
  const language = normalizedLocale?.split('-')[0];
  const entries = Object.entries(value);
  const exact = normalizedLocale
    ? entries.find(([key]) => key.replace('_', '-').toLowerCase() === normalizedLocale)?.[1]
    : undefined;
  if (exact) return exact;
  const sameLanguage = language
    ? entries.find(([key]) => key.replace('_', '-').toLowerCase().split('-')[0] === language)?.[1]
    : undefined;
  return sameLanguage || entries[0]?.[1] || '';
};

const capabilityChoiceDescription = (
  capability: RuleEditorCapabilityCatalogItem,
  locale?: string,
): string => {
  const description = localizedCapabilityText(capability.localizedDescription, locale);
  const requiredInputs = (capability.inputContract?.fields || [])
    .filter(field => field.required)
    .map(field => `${field.name}:${field.type}`);
  const completeObject = capability.bindingPolicy;
  return [
    description,
    `effect=${capability.effect}`,
    `selectionRequired=${capability.selectionRequired === true}`,
    `requiredInputs=${requiredInputs.length ? requiredInputs.join(',') : 'none'}`,
    ...(completeObject ? [
      `completeObjectTargets=${completeObject.completeObjectTargets.join('|')}`,
      `completeObjectSourceTypes=${completeObject.acceptedSourceTypes.join('|')}`,
      'completeObjectFieldsMayOverride=true',
    ] : []),
  ].filter(Boolean).join('；');
};

export const createRuleGoalJsonSchema = (
  catalog: readonly RuleEditorCapabilityCatalogItem[] | undefined,
  locale?: string,
) => {
  const capabilities = projectRuleEditorCapabilityCatalog(catalog);
  const capabilityRef = {
    type: 'string',
    minLength: 1,
    maxLength: 128,
    ...(capabilities.length
      ? {
      oneOf: capabilities.map((capability) => ({
        const: capability.capabilityId,
        title: `${localizedCapabilityText(capability.localizedName, locale)} [${capability.effect}]`,
        description: capabilityChoiceDescription(capability, locale),
      })),
      }
      : {
        description: 'The orchestration tool must remain unpublished until a capability catalog is available.',
      }),
  };
  return {
  type: 'object',
  additionalProperties: false,
  required: ['goal'],
  properties: {
    goal: {
      type: 'object',
      additionalProperties: false,
      required: ['flow', 'operations'],
      properties: {
        flow: { type: 'string', enum: ['request-response', 'event', 'stream'] },
        inputs: {
          type: 'array', maxItems: 16,
          items: {
            type: 'object', additionalProperties: false, required: ['name', 'type'],
            properties: {
              name: {
                type: 'string', minLength: 1, maxLength: 128,
                pattern: RULE_GOAL_SYMBOL_SCHEMA_PATTERN,
                description: '供 bindings 引用的稳定内部符号，例如 productId；用户可见名称写入 description。',
              },
              type: {
                type: 'string', minLength: 1, maxLength: 128,
                description: '输入的数据类型。完整请求、消息或业务对象使用 object，不得为了匹配某个必填子字段而降级为 string。',
              },
              description: { type: 'string', minLength: 1, maxLength: 512 },
            },
          },
        },
        operations: {
          type: 'array', minItems: 1, maxItems: 16,
          items: {
            type: 'object', additionalProperties: false, required: ['intent', 'capabilityRef'],
            properties: {
              intent: { type: 'string', minLength: 1, maxLength: 128 },
              capabilityRef,
              candidateRef: {
                type: 'string', minLength: 1, maxLength: 128,
                description: '仅兼容高层编排为同一目标明确返回的不透明候选引用；不得构造平台内部标识。',
              },
              discoveryHints: {
                type: 'array', maxItems: 4,
                description: '最多四个用户语言的业务字面提示，由高层编排内部传给 owner metadata resolver；不是平台 ID 或完成证据。',
                items: { type: 'string', minLength: 1, maxLength: 48 },
              },
              bindings: {
                ...ruleGoalStringMapSchema,
                description: '业务输入角色到 $input.<name> 或 $<operationOutput> 的引用；与已声明符号同名的简写由客户端规范化。capability 声明 completeObjectTargets 时，完整结构优先绑定到其中一个目标，其它字段绑定仅作为显式覆盖。',
              },
              output: {
                type: 'string', minLength: 1, maxLength: 128,
                pattern: RULE_GOAL_SYMBOL_SCHEMA_PATTERN,
                description: '供后续 bindings 和 goal.output 引用的稳定内部符号，例如 devices；不是用户可见字段名。',
              },
            },
          },
        },
        output: {
          ...ruleGoalOutputMapSchema,
          description: '用户可见返回字段名到 operation 输出的引用；用户明确给出的返回字段名必须原样保留。只有 capability outputContract 明确声明字段时才使用 $<operationOutput>.<field>；open/uncertain 且没有字段声明时引用整个 $<operationOutput>。',
        },
      },
    },
  },
  };
};

export const createRuleCapabilityResolverJsonSchema = (
  catalog: readonly RuleEditorCapabilityCatalogItem[] | undefined,
  locale?: string,
) => {
  const ruleGoalSchema = createRuleGoalJsonSchema(catalog, locale) as {
    properties: { goal: Record<string, unknown> };
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['goal', 'operationIndex'],
    properties: {
      goal: ruleGoalSchema.properties.goal,
      operationIndex: { type: 'integer', minimum: 0, maximum: 15 },
      cursor: {
        type: 'string', minLength: 1, maxLength: 32,
        description: '仅使用同一 operation 首次解析返回的 nextCursor；分页时省略 searchTerms。',
      },
      limit: { type: 'integer', minimum: 1, maximum: 12 },
      searchTerms: {
        type: 'array', maxItems: 4, uniqueItems: true,
        description: '仅首次解析可提交的 1-4 个多语言字面候选词；后续不得替换关键词重新发现。',
        items: { type: 'string', minLength: 1, maxLength: 48 },
      },
    },
  };
};

export const RULE_GOAL_JSON_SCHEMA = createRuleGoalJsonSchema([]);

export const parseRuleGoal = (value: unknown): RuleGoal | undefined => {
  if (!record(value) || Object.keys(value).some(key => key !== 'goal') || !record(value.goal)) return undefined;
  if (!hasOnlyKeys(value.goal, ['flow', 'inputs', 'operations', 'output'])) return undefined;
  const flow = value.goal.flow;
  if (flow !== 'request-response' && flow !== 'event' && flow !== 'stream'
    || !Array.isArray(value.goal.operations) || !value.goal.operations.length || value.goal.operations.length > 16) return undefined;
  let inputs: Array<{ name: string; type: string; description?: string }> | undefined;
  if (value.goal.inputs !== undefined) {
    if (!Array.isArray(value.goal.inputs) || value.goal.inputs.length > 16) return undefined;
    const normalizedInputs = value.goal.inputs.map((input) => {
      if (!record(input) || !hasOnlyKeys(input, ['name', 'type', 'description'])) return undefined;
      const name = boundedText(input.name);
      const type = boundedText(input.type);
      const description = input.description === undefined ? undefined : boundedText(input.description, 512);
      return name && RULE_GOAL_SYMBOL_PATTERN.test(name) && type
        && (input.description === undefined || description)
        ? { name, type, ...(description ? { description } : {}) }
        : undefined;
    });
    if (normalizedInputs.some((input) => !input?.name || !input.type)) return undefined;
    inputs = normalizedInputs as Array<{ name: string; type: string; description?: string }>;
  }
  const operations = value.goal.operations.map((operation) => {
    if (!record(operation) || !hasOnlyKeys(operation, ['intent', 'capabilityRef', 'candidateRef', 'discoveryHints', 'bindings', 'output'])) return undefined;
    const intent = boundedText(operation.intent);
    const capabilityRef = boundedText(operation.capabilityRef);
    const candidateRef = operation.candidateRef === undefined ? undefined : boundedText(operation.candidateRef);
    const discoveryHints = operation.discoveryHints === undefined ? undefined : normalizeDiscoveryHints(operation.discoveryHints);
    const bindings = operation.bindings === undefined ? undefined : normalizeStringRecord(operation.bindings);
    const output = operation.output === undefined ? undefined : boundedText(operation.output);
    return intent && capabilityRef && (operation.candidateRef === undefined || candidateRef)
      && (operation.discoveryHints === undefined || discoveryHints)
      && (operation.bindings === undefined || bindings)
      && (operation.output === undefined || (output && RULE_GOAL_SYMBOL_PATTERN.test(output)))
      ? {
        intent,
        capabilityRef,
        ...(candidateRef ? { candidateRef } : {}),
        ...(discoveryHints ? { discoveryHints } : {}),
        ...(bindings ? { bindings } : {}),
        ...(output ? { output } : {}),
      }
      : undefined;
  });
  if (operations.some((operation) => !operation)) return undefined;
  const output = value.goal.output === undefined ? undefined : normalizeStringRecord(value.goal.output);
  if (value.goal.output !== undefined && !output) return undefined;
  const operationOutputs = new Set(operations.flatMap(operation => operation?.output ? [operation.output] : []));
  if (output && Object.values(output).some((reference) => {
    const match = RULE_GOAL_OUTPUT_REFERENCE_PATTERN.exec(reference);
    return !match || !operationOutputs.has(match[1]!);
  })) return undefined;
  return { goal: { flow, ...(inputs ? { inputs } : {}), operations: operations as RuleGoal['goal']['operations'], ...(output ? { output } : {}) } };
};

export const projectCanvasApplyReceipt = (value: unknown): CanvasApplyReceipt => {
  const result = record(value) ? value : {};
  const mutation = record(result.mutation) ? result.mutation : {};
  const reportedEffect = canvasEffect(result.effect);
  const mutationEffect = canvasEffect(mutation.status);
  const effect: CanvasApplyEffect = reportedEffect && mutationEffect && reportedEffect !== mutationEffect
    ? 'unknown'
    : reportedEffect || mutationEffect || 'not-applied';
  const taskProgress = projectTaskProgress(result.taskProgress);
  const reportedCompletion = result.completion;
  const verification = record(result.verification)
    ? Object.fromEntries(Object.entries(result.verification).flatMap(([key, item]) => (
      verificationChecks.includes(key as CanvasApplyVerificationCheck)
      && record(item) && ['pass', 'fail', 'unknown', 'not-required'].includes(String(item.status))
        ? [[key, { status: item.status as 'pass' | 'fail' | 'unknown' | 'not-required' }]] : []
    ))) : undefined;
  const requiredChecks = taskProgress?.requiredChecks;
  const unresolved = taskProgress?.unresolved;
  const hasTrustedTaskProgress = taskProgress?.satisfied === true
    && requiredChecks !== undefined
    && requiredChecks.length > 0
    && requiredChecks.every((check, index) => (
      requiredChecks.indexOf(check) === index
      && verification?.[check]?.status === 'pass'
    ))
    && unresolved !== undefined
    && unresolved.length === 0;
  const reportedAwaitingInput = effect === 'not-applied'
    && result.userInputRequired === true
    && (reportedCompletion === undefined || reportedCompletion === 'awaiting-input');
  // This parent projection is the final trust boundary; upstream completion labels are advisory only.
  const completion: CanvasApplyCompletion = effect === 'unknown' ? 'failed'
    : effect === 'rolled-back' ? 'failed'
      : effect === 'applied' ? (hasTrustedTaskProgress ? 'completed' : 'partial')
        : reportedAwaitingInput ? 'awaiting-input'
          : reportedCompletion === 'failed' ? 'failed' : 'blocked';
  const changes = Array.isArray(result.changes) ? result.changes
    .slice(0, 32).filter(record).map((change) => ({ kind: boundedText(change.kind) || 'change' })) : undefined;
  const unmet = [...(unresolved || [])];
  if (effect === 'applied' && completion === 'partial' && !unmet.length) {
    unmet.push({ code: 'task-progress-unverified' });
  }
  const instruction = boundedText(result.instruction, 512);
  const effectState = effect === 'not-applied' ? 'not-started' as const
    : effect === 'rolled-back' ? 'rolled-back' as const
      : effect === 'unknown' ? 'unknown' as const
        : undefined;
  return {
    effect,
    completion,
    ...(boundedText(result.requestId) || boundedText(mutation.requestId) ? { requestId: boundedText(result.requestId) || boundedText(mutation.requestId) } : {}),
    ...(boundedText(result.planDigest) || boundedText(mutation.normalizedPlanDigest) ? { planDigest: boundedText(result.planDigest) || boundedText(mutation.normalizedPlanDigest) } : {}),
    ...(nonNegativeInteger(result.baseRevision) !== undefined || nonNegativeInteger(mutation.baseRevision) !== undefined
      ? { baseRevision: nonNegativeInteger(result.baseRevision) ?? nonNegativeInteger(mutation.baseRevision) }
      : {}),
    ...(nonNegativeInteger(result.newRevision) !== undefined || nonNegativeInteger(result.canvasRevision) !== undefined
      ? { newRevision: nonNegativeInteger(result.newRevision) ?? nonNegativeInteger(result.canvasRevision) }
      : {}),
    ...(effectState ? { effectState } : {}),
    ...(result.externalExecutionStarted === false ? { externalExecutionStarted: false as const } : {}),
    ...(changes?.length ? { changes } : {}),
    ...(unmet.length ? { unmet } : {}),
    ...(verification && Object.keys(verification).length ? { verification } : {}),
    ...(taskProgress ? { taskProgress } : {}),
    ...(instruction ? { instruction } : {}),
  };
};
