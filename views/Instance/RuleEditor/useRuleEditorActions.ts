import { computed, onBeforeUnmount, ref, type ComputedRef } from 'vue';
import { onlyMessage } from '@jetlinks-web/utils';
import { modify, updateRuleMetadata } from '../../../api/instance';

type EditorAction = 'deploy' | 'save';
type EditorTransferAction = 'import' | 'export';
interface EditorActionResult {
  ok?: boolean;
  code?: string;
  error?: string;
  thumbnailSvg?: string;
}

interface RuleEditorActionsOptions {
  bridge: {
    executeEditorAction: (action: EditorAction) => Promise<unknown>;
    executeEditorUtilityAction: (action: EditorTransferAction) => Promise<unknown>;
  };
  bridgeStatus: ComputedRef<string>;
  bridgeActions: ComputedRef<Record<EditorAction | EditorTransferAction, boolean | undefined>>;
  ruleId: ComputedRef<string>;
  ruleName: ComputedRef<string>;
  ruleDescription: ComputedRef<string>;
  hasPermission: (action: 'update' | 'action' | EditorTransferAction) => boolean;
  getRule: () => Record<string, any> | undefined;
  onRuleUpdated: (rule: Record<string, any>) => void;
  t: (key: string) => string;
}

export const useRuleEditorActions = (options: RuleEditorActionsOptions) => {
  const editorActioning = ref<EditorAction | ''>('');
  const editorActionDone = ref<EditorAction | ''>('');
  const editorTransferActioning = ref<EditorTransferAction | ''>('');
  const ruleNameSaving = ref(false);
  const ruleDescriptionSaving = ref(false);
  const canEdit = computed(() => options.hasPermission('update'));
  let editorActionDoneTimer: ReturnType<typeof window.setTimeout> | undefined;

  // 入口状态与执行前检查共用当前菜单授权，避免抽屉打开后授权撤回仍可操作。
  const isEditorActionDisabled = (action: EditorAction | EditorTransferAction) => (
    !options.hasPermission(action === 'deploy' ? 'action' : action === 'save' ? 'update' : action)
    || options.bridgeStatus.value !== 'ready'
    || !!editorActioning.value
    || !!editorTransferActioning.value
    || options.bridgeActions.value[action] === false
  );

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
    if (isEditorActionDisabled(action)) {
      return;
    }
    clearEditorActionDone();
    editorActioning.value = action;
    try {
      const result = await options.bridge.executeEditorAction(action) as EditorActionResult;
      if (result?.ok === false) {
        // Locally rejected transport requests never reach the native editor.
        if (result.code === 'rule_editor.bridge.unavailable') {
          throw new Error(options.t('RuleEditor.bridge.error.notReady'));
        }
        // The native editor owns action feedback, including errors from older iframe resources.
        return;
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

  const handleEditorTransfer = async (action: EditorTransferAction) => {
    if (isEditorActionDisabled(action)) {
      return;
    }
    editorTransferActioning.value = action;
    try {
      const result = await options.bridge.executeEditorUtilityAction(action) as EditorActionResult;
      if (result?.ok === false) {
        throw new Error(options.t('RuleEditor.index.transferFailed'));
      }
    } catch (error) {
      onlyMessage(error instanceof Error ? error.message : options.t('RuleEditor.index.transferFailed'), 'error');
    } finally {
      editorTransferActioning.value = '';
    }
  };

  const handleRuleRename = async (value: string) => {
    const nextName = value.trim();
    if (!canEdit.value || !options.ruleId.value || !nextName || nextName === options.ruleName.value || ruleNameSaving.value) {
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

  const handleRuleDescriptionChange = async (value: string) => {
    const nextDescription = value.trim();
    if (!canEdit.value || !options.ruleId.value || nextDescription === options.ruleDescription.value || ruleDescriptionSaving.value) {
      return;
    }

    ruleDescriptionSaving.value = true;
    try {
      const response = await modify(options.ruleId.value, {
        ...options.getRule(),
        description: nextDescription,
      });
      if (response?.status !== 200) {
        throw new Error(options.t('RuleEditor.index.descriptionSaveFailed'));
      }
      options.onRuleUpdated({
        ...options.getRule(),
        ...(response?.result || {}),
        description: nextDescription,
      });
    } catch (error) {
      onlyMessage(error instanceof Error ? error.message : options.t('RuleEditor.index.descriptionSaveFailed'), 'error');
    } finally {
      ruleDescriptionSaving.value = false;
    }
  };

  onBeforeUnmount(clearEditorActionDone);

  return {
    canEdit,
    isEditorActionDisabled,
    editorActioning,
    editorActionDone,
    editorTransferActioning,
    ruleNameSaving,
    ruleDescriptionSaving,
    clearEditorActionDone,
    handleEditorAction,
    handleEditorTransfer,
    handleRuleRename,
    handleRuleDescriptionChange,
  };
};
