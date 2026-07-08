import { computed, ref, type Ref } from 'vue';
import type {
  AgentConversationComposerAction,
  AgentConversationReferenceCandidate,
  AgentConversationReferenceProvider,
} from '@jetlinks-ai-agent-ui/components/AgentConversation/types';

interface Options {
  context: Ref<Record<string, any>>;
  previewNode?: (nodeId: string, active: boolean) => void | Promise<void>;
  listNodes?: () => Promise<Record<string, any>[]>;
  t: (key: string, args?: unknown[]) => string;
}

const toRecord = (value: unknown): Record<string, any> | undefined => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined
);

const toArray = (value: unknown) => (
  Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value]
);

const normalizeText = (value: unknown) => String(value || '').trim();

const uniqueCandidates = (items: AgentConversationReferenceCandidate[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const contextNodeRecords = (context: Record<string, any>) => {
  const selection = toRecord(context.selection) || toRecord(context.selected) || {};
  return [
    ...toArray(context.selectedNode),
    ...toArray(context.selectedNodes),
    ...toArray(selection.node),
    ...toArray(selection.nodes),
    ...toArray(context.nodes),
    ...toArray(context.nodeSummaries),
    ...toArray(toRecord(context.graph)?.nodes),
    ...toArray(toRecord(context.flow)?.nodes),
  ]
    .map(toRecord)
    .filter((item): item is Record<string, any> => !!item);
};

const getNodeLabel = (node: Record<string, any>) => (
  normalizeText(node.name)
  || normalizeText(node.label)
  || normalizeText(node.title)
  || normalizeText(node.type)
  || normalizeText(node.id)
);

const getNodeId = (node: Record<string, any>) => (
  normalizeText(node.id)
  || normalizeText(node.nodeId)
);

const getNodeValue = (node: Record<string, any>) => (
  getNodeId(node)
  || getNodeLabel(node)
);

export const useRuleEditorAgentComposerExtensions = (options: Options) => {
  const loadedNodeRecords = ref<Record<string, any>[]>([]);
  const loadingNodeRecords = ref(false);

  const refreshCanvasNodes = async () => {
    if (!options.listNodes) {
      return;
    }
    loadingNodeRecords.value = true;
    try {
      loadedNodeRecords.value = await options.listNodes();
    } finally {
      loadingNodeRecords.value = false;
    }
  };

  const canvasCandidates = computed<AgentConversationReferenceCandidate[]>(() => {
    const candidates: AgentConversationReferenceCandidate[] = [];

    [
      ...contextNodeRecords(options.context.value || {}),
      ...loadedNodeRecords.value,
    ].slice(0, 12).forEach((node) => {
      const value = getNodeValue(node);
      const label = getNodeLabel(node);
      if (!value || !label) {
        return;
      }
      const nodeId = getNodeId(node);
      const nodeType = normalizeText(node.type || node.nodeType);
      const insertIdentifier = nodeId || value;
      candidates.push({
        type: 'rule-editor-node',
        value,
        label,
        insertText: options.t('RuleEditor.agent.references.nodeInsert', [label, insertIdentifier]),
        description: nodeType
          ? options.t('RuleEditor.agent.references.nodeDescription', [nodeType])
          : options.t('RuleEditor.agent.references.nodeDescriptionFallback'),
        icon: 'NodeIndexOutlined',
        category: 'node',
        categoryLabel: options.t('RuleEditor.agent.references.category.nodes'),
        onHover: nodeId && options.previewNode
          ? (active: boolean) => options.previewNode!(nodeId, active)
          : undefined,
      });
    });

    return uniqueCandidates(candidates);
  });

  const referenceProviders = computed<AgentConversationReferenceProvider[]>(() => [
    {
      key: 'rule-editor-nodes',
      trigger: '@',
      marker: '@',
      type: 'rule-editor-node',
      label: options.t('RuleEditor.agent.references.category.nodes'),
      loading: loadingNodeRecords.value,
      emptyText: loadingNodeRecords.value
        ? options.t('RuleEditor.agent.references.loadingCanvas')
        : options.t('RuleEditor.agent.references.emptyCanvas'),
      candidates: canvasCandidates.value,
      onOpen: refreshCanvasNodes,
    },
  ]);

  const composerAddActions = computed<AgentConversationComposerAction[]>(() => [
    {
      key: 'rule-editor-reference-canvas',
      icon: 'BranchesOutlined',
      label: options.t('RuleEditor.agent.actions.referenceCanvas'),
      description: options.t('RuleEditor.agent.actions.referenceCanvasDesc'),
      category: 'canvas',
      categoryLabel: options.t('RuleEditor.agent.references.category.nodes'),
      referenceTrigger: '@',
      referenceProviderKey: 'rule-editor-nodes',
      disabled: !canvasCandidates.value.length && !options.listNodes,
    },
  ]);

  return {
    referenceProviders,
    composerAddActions,
  };
};
