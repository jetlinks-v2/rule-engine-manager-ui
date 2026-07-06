import { onlyMessage } from '@jetlinks-web/utils';

const PROPOSAL_PROTOCOL_PATTERN = /^(?:rule-editor|jetlinks-rule-editor):\/\/proposal\/([^?#]+)/i;
const CANVAS_APPLY_PROTOCOL_PATTERN = /^(?:jetlinks|rule-editor|jetlinks-rule-editor|action):\/\//i;
const RULE_EDITOR_MANAGED_LINK_PATTERN = /^(?:jetlinks:\/\/rule-editor(?:[/?#]|$)|rule-editor:\/\/|jetlinks-rule-editor:\/\/|action:\/\/(?:propose|apply)(?:[/?#]|$))/i;
const APPLY_ACTION_ALIASES: Record<string, string> = {
  focusNode: 'rule_editor_focus_node',
  focus_node: 'rule_editor_focus_node',
  insertNode: 'rule_editor_insert_node',
  insert_node: 'rule_editor_insert_node',
  insertNodeTemplate: 'rule_editor_insert_node_template',
  insert_node_template: 'rule_editor_insert_node_template',
  connectNodes: 'rule_editor_connect_nodes',
  connect_nodes: 'rule_editor_connect_nodes',
  connectNodesBatch: 'rule_editor_connect_nodes_batch',
  connect_nodes_batch: 'rule_editor_connect_nodes_batch',
};

interface RuleEditorMarkdownLinkPayload {
  href: string;
  text?: string;
  event: MouseEvent;
}

interface RuleEditorProposalLinkHandlerOptions {
  execute: (proposalId: string) => Promise<any>;
  registerActions: (payload: { actions: Array<Record<string, any>>; allowMultiple?: boolean }) => Promise<any>;
  t: (key: string, args?: unknown[]) => string;
}

const normalizeHref = (href: string) => {
  let raw = String(href || '').trim();
  while (/^(?:url|unsafe):/i.test(raw)) {
    raw = raw.replace(/^(?:url|unsafe):/i, '').trim();
  }
  return raw;
};

const resolveProposalId = (href: string) => {
  const raw = normalizeHref(href);
  const protocolMatch = raw.match(PROPOSAL_PROTOCOL_PATTERN);
  if (protocolMatch?.[1]) {
    try {
      return decodeURIComponent(protocolMatch[1]);
    } catch {
      return protocolMatch[1];
    }
  }

  if (!raw.startsWith('#')) {
    return '';
  }
  const params = new URLSearchParams(raw.slice(1));
  const proposalId = params.get('ruleEditorProposal') || params.get('proposalId') || '';
  try {
    return decodeURIComponent(proposalId);
  } catch {
    return proposalId;
  }
};

const parseJsonParam = (value: string | null) => {
  if (!value || value.length > 24 * 1024) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const parseJsonParamObject = (value: string | null) => {
  const parsed = parseJsonParam(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : undefined;
};

const parseSearchParamValue = (value: string) => {
  const text = String(value || '').trim();
  if (!text) {
    return value;
  }
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  if (text === 'true' || text === 'false') {
    return text === 'true';
  }
  return value;
};

const resolveSingleApplyAction = (params: URLSearchParams) => {
  const actionName = params.get('toolName') || params.get('toolId') || params.get('action') || '';
  const toolName = APPLY_ACTION_ALIASES[actionName] || actionName;
  if (!toolName) {
    return undefined;
  }

  const args: Record<string, any> = {
    ...(parseJsonParamObject(params.get('args') || params.get('arguments')) || {}),
  };
  params.forEach((value, key) => {
    if (['action', 'actions', 'allowMultiple', 'args', 'arguments', 'label', 'title', 'toolId', 'toolName'].includes(key)) {
      return;
    }
    args[key] = parseSearchParamValue(value);
  });

  return {
    label: params.get('label') || params.get('title') || undefined,
    toolName,
    arguments: args,
  };
};

const resolveApplyActions = (href: string) => {
  const raw = normalizeHref(href);
  if (!CANVAS_APPLY_PROTOCOL_PATTERN.test(raw)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }

  const isCanvasApply = (
    (url.protocol === 'jetlinks:' && url.hostname === 'rule-editor' && url.pathname === '/canvas/apply')
    || (url.protocol === 'jetlinks:' && url.hostname === 'rule-editor' && url.pathname === '/apply')
    || (url.protocol === 'jetlinks:' && url.hostname === 'rule-editor' && url.pathname === '/propose-canvas-actions')
    || ((url.protocol === 'rule-editor:' || url.protocol === 'jetlinks-rule-editor:')
      && url.hostname === 'canvas'
      && url.pathname === '/apply')
    || ((url.protocol === 'rule-editor:' || url.protocol === 'jetlinks-rule-editor:')
      && url.hostname === 'propose-canvas-actions'
      && (!url.pathname || url.pathname === '/'))
    || (url.protocol === 'action:' && ['propose', 'apply'].includes(url.hostname))
  );
  if (!isCanvasApply) {
    return undefined;
  }

  const parsed = parseJsonParam(url.searchParams.get('actions'));
  const singleAction = parsed ? undefined : resolveSingleApplyAction(url.searchParams);
  const actions = Array.isArray(parsed) ? parsed : parsed ? [parsed] : singleAction ? [singleAction] : [];
  if (!actions.length || actions.length > 10 || actions.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    return undefined;
  }

  return {
    actions: actions as Array<Record<string, any>>,
    allowMultiple: url.searchParams.get('allowMultiple') === 'true',
  };
};

const isRuleEditorManagedLink = (href: string) => RULE_EDITOR_MANAGED_LINK_PATTERN.test(normalizeHref(href));

const resolveProposalIdFromRegisterResult = (result: any) => {
  const markdown = result?.actions?.[0]?.markdown || result?.markdown || '';
  const match = String(markdown).match(/\(([^)]+)\)/);
  return resolveProposalId(match?.[1] || markdown);
};

const resolveProposalError = (
  error: unknown,
  t: RuleEditorProposalLinkHandlerOptions['t'],
) => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/not found or expired/i.test(message)) {
    return t('RuleEditor.bridge.proposal.expired');
  }
  if (/requires confirmation/i.test(message)) {
    return t('RuleEditor.bridge.proposal.requiresConfirmation');
  }
  if (/applying/i.test(message)) {
    return t('RuleEditor.bridge.proposal.applying');
  }
  return t('RuleEditor.bridge.proposal.failed');
};

export const createRuleEditorProposalLinkHandler = (
  options: RuleEditorProposalLinkHandlerOptions,
) => {
  const applyingProposals = new Set<string>();

  return (payload: RuleEditorMarkdownLinkPayload) => {
    const proposalId = resolveProposalId(payload.href);
    const applyActions = proposalId ? undefined : resolveApplyActions(payload.href);
    if (!proposalId && !applyActions) {
      if (isRuleEditorManagedLink(payload.href)) {
        payload.event.preventDefault();
        onlyMessage(options.t('RuleEditor.bridge.proposal.invalidLink'), 'error');
        return true;
      }
      return false;
    }
    payload.event.preventDefault();

    const actionKey = proposalId || payload.href;
    if (applyingProposals.has(actionKey)) {
      onlyMessage(options.t('RuleEditor.bridge.proposal.applying'));
      return true;
    }

    applyingProposals.add(actionKey);
    const executePromise = proposalId
      ? options.execute(proposalId)
      : options.registerActions(applyActions!)
        .then((result: any) => {
          if (result?.ok === false) {
            throw new Error(result.error || options.t('RuleEditor.bridge.proposal.failed'));
          }
          const registeredProposalId = resolveProposalIdFromRegisterResult(result);
          if (!registeredProposalId) {
            throw new Error(options.t('RuleEditor.bridge.proposal.failed'));
          }
          return options.execute(registeredProposalId);
        });

    void executePromise
      .then((result: any) => {
        if (result?.ok === false) {
          throw new Error(result.error || options.t('RuleEditor.bridge.proposal.failed'));
        }
        const label = result?.action?.label || payload.text || '';
        onlyMessage(result?.alreadyApplied
          ? options.t('RuleEditor.bridge.proposal.alreadyApplied', [label])
          : options.t('RuleEditor.bridge.proposal.applied', [label]));
      })
      .catch((error) => {
        onlyMessage(resolveProposalError(error, options.t), 'error');
      })
      .finally(() => {
        applyingProposals.delete(actionKey);
      });
    return true;
  };
};
