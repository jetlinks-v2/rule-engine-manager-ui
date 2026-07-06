import i18n from '@jetlinks-web-core/locales';

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

const normalizeLabel = (value: unknown, fallback = '') => {
  const text = String(value || '').trim();
  return text || fallback;
};

export const resolveRuleEditorToolDisplayName = (tool: RuleEditorRemoteToolDefinition) => {
  const key = toolDisplayNameKey(tool.id);
  const translated = t(key);
  return translated !== key
    ? translated
    : normalizeLabel(tool.displayName || tool.title || tool.name, tool.id);
};

export const resolveRuleEditorConfirmOptions = (tool: RuleEditorRemoteToolDefinition) => {
  if (tool.confirm === false) {
    return false;
  }
  if (!tool.write && !tool.confirm) {
    return false;
  }

  const type = tool.confirmType || tool.category || tool.id;
  if (type === 'insert' || tool.id === 'rule_editor_insert_node') {
    return {
      title: t('RuleEditor.bridge.confirm.insert.title'),
      content: (args: Record<string, any>) => t('RuleEditor.bridge.confirm.insert.content', [
        normalizeLabel(args.name || args.type, t('RuleEditor.index.title')),
      ]),
      okText: t('RuleEditor.bridge.confirm.okText'),
    };
  }
  if (type === 'update' || tool.id === 'rule_editor_edit_node') {
    return {
      title: t('RuleEditor.bridge.confirm.update.title'),
      content: (args: Record<string, any>) => t('RuleEditor.bridge.confirm.update.content', [
        normalizeLabel(args.nodeName || args.nodeId, t('RuleEditor.index.title')),
      ]),
      okText: t('RuleEditor.bridge.confirm.okText'),
    };
  }
  if (type === 'connect' || tool.id === 'rule_editor_connect_nodes') {
    return {
      title: t('RuleEditor.bridge.confirm.connect.title'),
      content: (args: Record<string, any>) => t('RuleEditor.bridge.confirm.connect.content', [
        normalizeLabel(args.sourceName || args.sourceId, t('RuleEditor.index.title')),
        normalizeLabel(args.targetName || args.targetId, t('RuleEditor.index.title')),
      ]),
      okText: t('RuleEditor.bridge.confirm.okText'),
    };
  }
  if (type === 'deleteNode' || tool.id === 'rule_editor_delete_node') {
    return {
      title: t('RuleEditor.bridge.confirm.deleteNode.title'),
      content: (args: Record<string, any>) => t('RuleEditor.bridge.confirm.deleteNode.content', [
        normalizeLabel(args.nodeName || args.nodeId, t('RuleEditor.index.title')),
      ]),
      okText: t('RuleEditor.bridge.confirm.deleteText'),
    };
  }
  if (type === 'deleteLink' || tool.id === 'rule_editor_delete_link') {
    return {
      title: t('RuleEditor.bridge.confirm.deleteLink.title'),
      content: (args: Record<string, any>) => t('RuleEditor.bridge.confirm.deleteLink.content', [
        normalizeLabel(args.sourceName || args.sourceId, t('RuleEditor.index.title')),
        normalizeLabel(args.targetName || args.targetId, t('RuleEditor.index.title')),
      ]),
      okText: t('RuleEditor.bridge.confirm.deleteText'),
    };
  }

  return {
    title: t('RuleEditor.bridge.confirm.default.title'),
    content: t('RuleEditor.bridge.confirm.default.content'),
    okText: t('RuleEditor.bridge.confirm.okText'),
  };
};
