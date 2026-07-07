import i18n from '@jetlinks-web-core/locales';
import {
  createAiClientToolConfirmResolver,
  type AiClientToolConfirmRule,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';

export interface RuleEditorRemoteToolDefinition {
  id: string;
  name?: string;
  title?: string;
  displayName?: string;
  category?: string;
  write?: boolean;
  confirm?: boolean;
  confirmType?: 'insert' | 'update' | 'connect' | 'deleteNode' | 'deleteLink' | string;
}

const t = (key: string, args?: unknown[]) => i18n.global.t(key, args as any);
const toolDisplayNameKey = (id: string) => `RuleEditor.agent.tool.${id}.name`;

const toRecord = (value: unknown): Record<string, any> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined
);

const resolveReadableLabel = (value: unknown, depth = 0): string => {
  if (value === undefined || value === null || depth > 4) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveReadableLabel(item, depth + 1)).find(Boolean) || '';
  }
  const record = toRecord(value);
  if (!record) {
    return '';
  }
  for (const key of ['text', 'content', 'message', 'title', 'description', 'summary', 'name', 'label', 'value', 'id']) {
    const text = resolveReadableLabel(record[key], depth + 1);
    if (text) {
      return text;
    }
  }
  return '';
};

const normalizeLabel = (value: unknown, fallback = '') => {
  const text = resolveReadableLabel(value);
  return text || fallback;
};

const agentConfirmationCard = {
  // 规则编辑器写工具在浏览器侧通过 iframe bridge 执行，必须先由 AiChat 本地确认卡拦截，
  // 再把确认后的调用转发给编辑器，避免直接写入未保存草稿。
  localConfirmation: true,
  risk: {
    readOnly: false,
    parallelSafe: false,
  },
};

const ruleEditorConfirmRules: AiClientToolConfirmRule<RuleEditorRemoteToolDefinition>[] = [
  {
    match: ['insert', 'rule_editor_insert_node'],
    ...agentConfirmationCard,
    title: t('RuleEditor.bridge.confirm.insert.title'),
    content: (args) => t('RuleEditor.bridge.confirm.insert.content', [
      normalizeLabel(args.name || args.type, t('RuleEditor.index.title')),
    ]),
    okText: t('RuleEditor.bridge.confirm.okText'),
  },
  {
    match: ['update', 'rule_editor_edit_node'],
    ...agentConfirmationCard,
    title: t('RuleEditor.bridge.confirm.update.title'),
    content: (args) => t('RuleEditor.bridge.confirm.update.content', [
      normalizeLabel(args.nodeName || args.nodeId, t('RuleEditor.index.title')),
    ]),
    okText: t('RuleEditor.bridge.confirm.okText'),
  },
  {
    match: ['connect', 'rule_editor_connect_nodes'],
    ...agentConfirmationCard,
    title: t('RuleEditor.bridge.confirm.connect.title'),
    content: (args) => t('RuleEditor.bridge.confirm.connect.content', [
      normalizeLabel(args.sourceName || args.sourceId, t('RuleEditor.index.title')),
      normalizeLabel(args.targetName || args.targetId, t('RuleEditor.index.title')),
    ]),
    okText: t('RuleEditor.bridge.confirm.okText'),
  },
  {
    match: ['deleteNode', 'rule_editor_delete_node'],
    ...agentConfirmationCard,
    title: t('RuleEditor.bridge.confirm.deleteNode.title'),
    content: (args) => t('RuleEditor.bridge.confirm.deleteNode.content', [
      normalizeLabel(args.nodeName || args.nodeId, t('RuleEditor.index.title')),
    ]),
    okText: t('RuleEditor.bridge.confirm.deleteText'),
  },
  {
    match: ['deleteLink', 'rule_editor_delete_link'],
    ...agentConfirmationCard,
    title: t('RuleEditor.bridge.confirm.deleteLink.title'),
    content: (args) => t('RuleEditor.bridge.confirm.deleteLink.content', [
      normalizeLabel(args.sourceName || args.sourceId, t('RuleEditor.index.title')),
      normalizeLabel(args.targetName || args.targetId, t('RuleEditor.index.title')),
    ]),
    okText: t('RuleEditor.bridge.confirm.deleteText'),
  },
];

export const resolveRuleEditorToolDisplayName = (tool: RuleEditorRemoteToolDefinition) => {
  const key = toolDisplayNameKey(tool.id);
  const translated = t(key);
  return translated !== key
    ? translated
    : normalizeLabel(tool.displayName || tool.title || tool.name, tool.id);
};

export const resolveRuleEditorConfirmOptions = createAiClientToolConfirmResolver<RuleEditorRemoteToolDefinition>({
  shouldConfirm: (tool) => tool.confirm !== false && (tool.write === true || tool.confirm === true),
  getType: (tool) => tool.confirmType || tool.category || tool.id,
  rules: ruleEditorConfirmRules,
  defaultRule: {
    ...agentConfirmationCard,
    title: t('RuleEditor.bridge.confirm.default.title'),
    content: t('RuleEditor.bridge.confirm.default.content'),
    okText: t('RuleEditor.bridge.confirm.okText'),
  },
});
