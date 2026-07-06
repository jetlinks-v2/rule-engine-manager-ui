import { onBeforeUnmount, ref, type ComputedRef } from 'vue';
import { onlyMessage } from '@jetlinks-web/utils';
import { modify, updateRuleMetadata } from '../../../api/instance';

type EditorAction = 'deploy' | 'save';
interface EditorActionResult {
  ok?: boolean;
  error?: string;
  thumbnailSvg?: string;
}

interface RuleEditorActionsOptions {
  bridge: {
    executeEditorAction: (action: EditorAction) => Promise<unknown>;
  };
  bridgeStatus: ComputedRef<string>;
  bridgeActions: ComputedRef<Record<EditorAction, boolean | undefined>>;
  ruleId: ComputedRef<string>;
  ruleName: ComputedRef<string>;
  getRule: () => Record<string, any> | undefined;
  onRuleUpdated: (rule: Record<string, any>) => void;
  t: (key: string) => string;
}

export const useRuleEditorActions = (options: RuleEditorActionsOptions) => {
  const editorActioning = ref<EditorAction | ''>('');
  const editorActionDone = ref<EditorAction | ''>('');
  const ruleNameSaving = ref(false);
  let editorActionDoneTimer: ReturnType<typeof window.setTimeout> | undefined;

  const clearEditorActionDone = () => {
    if (editorActionDoneTimer) {
      window.clearTimeout(editorActionDoneTimer);
      editorActionDoneTimer = undefined;
    }
    editorActionDone.value = '';
  };

  const markEditorActionDone = (action: EditorAction) => {
    clearEditorActionDone();
    editorActionDone.value = action;
    editorActionDoneTimer = window.setTimeout(() => {
      editorActionDone.value = '';
      editorActionDoneTimer = undefined;
    }, 1800);
  };

  const toPlainRecord = (value: unknown) => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, any>
      : {}
  );

  const syncRuleThumbnail = async (thumbnailSvg?: string) => {
    const svg = typeof thumbnailSvg === 'string' ? thumbnailSvg.trim() : '';
    if (!options.ruleId.value || !svg) {
      return;
    }

    const currentRule = options.getRule() || {};
    const metadata = {
      ...toPlainRecord(currentRule.metadata),
      thumbnailSvg: svg,
    };
    const response = await updateRuleMetadata(options.ruleId.value, metadata);
    if (response?.status !== 200) {
      throw new Error(options.t('RuleEditor.index.thumbnailSaveFailed'));
    }
    options.onRuleUpdated({
      ...currentRule,
      metadata,
    });
  };

  const handleEditorAction = async (action: EditorAction) => {
    if (options.bridgeStatus.value !== 'ready' || !!editorActioning.value || options.bridgeActions.value[action] === false) {
      return;
    }
    clearEditorActionDone();
    editorActioning.value = action;
    try {
      const result = await options.bridge.executeEditorAction(action) as EditorActionResult;
      if (result?.ok === false) {
        throw new Error(result.error || options.t('RuleEditor.index.actionFailed'));
      }
      try {
        await syncRuleThumbnail(result?.thumbnailSvg);
      } catch (error) {
        onlyMessage(error instanceof Error ? error.message : options.t('RuleEditor.index.thumbnailSaveFailed'), 'warning');
      }
      markEditorActionDone(action);
    } catch (error) {
      onlyMessage(error instanceof Error ? error.message : options.t('RuleEditor.index.actionFailed'), 'error');
    } finally {
      editorActioning.value = '';
    }
  };

  const handleRuleRename = async (value: string) => {
    const nextName = value.trim();
    if (!options.ruleId.value || !nextName || nextName === options.ruleName.value || ruleNameSaving.value) {
      return;
    }

    ruleNameSaving.value = true;
    try {
      const response = await modify(options.ruleId.value, {
        ...options.getRule(),
        name: nextName,
      });
      if (response?.status !== 200) {
        throw new Error(options.t('RuleEditor.index.renameFailed'));
      }
      options.onRuleUpdated({
        ...options.getRule(),
        ...(response?.result || {}),
        name: nextName,
      });
    } catch (error) {
      onlyMessage(error instanceof Error ? error.message : options.t('RuleEditor.index.renameFailed'), 'error');
    } finally {
      ruleNameSaving.value = false;
    }
  };

  onBeforeUnmount(clearEditorActionDone);

  return {
    editorActioning,
    editorActionDone,
    ruleNameSaving,
    clearEditorActionDone,
    handleEditorAction,
    handleRuleRename,
  };
};
