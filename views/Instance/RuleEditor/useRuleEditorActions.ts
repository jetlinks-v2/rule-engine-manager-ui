import { onBeforeUnmount, ref, type ComputedRef } from 'vue';
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
  const ruleIconSaving = ref(false);
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

  let metadataUpdate: Promise<void> = Promise.resolve();
  const persistMetadata = (patch: Record<string, unknown>) => {
    const id = options.ruleId.value;
    const update = metadataUpdate.then(async () => {
      if (!id || id !== options.ruleId.value) throw new Error(options.t('RuleEditor.index.actionFailed'));
      const currentRule = options.getRule() || {};
      const metadata = { ...toPlainRecord(currentRule.metadata), ...patch };
      const response = await updateRuleMetadata(id, metadata);
      if (response?.status !== 200) throw new Error(options.t('RuleEditor.index.actionFailed'));
      if (id === options.ruleId.value) options.onRuleUpdated({ ...options.getRule(), metadata });
    });
    metadataUpdate = update.catch(() => {});
    return update;
  };

  const syncRuleThumbnail = async (thumbnailSvg?: string) => {
    const svg = typeof thumbnailSvg === 'string' ? thumbnailSvg.trim() : '';
    if (options.ruleId.value && svg) await persistMetadata({ thumbnailSvg: svg });
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
    if (
      options.bridgeStatus.value !== 'ready'
      || !!editorActioning.value
      || !!editorTransferActioning.value
      || options.bridgeActions.value[action] === false
    ) {
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

  const handleRuleRename = async (value: string): Promise<boolean> => {
    const nextName = value.trim();
    if (!options.ruleId.value || !nextName || ruleNameSaving.value) return false;
    if (nextName === options.ruleName.value) return true;
    ruleNameSaving.value = true;
    try {
      const response = await modify(options.ruleId.value, { name: nextName });
      if (response?.status !== 200) return false;
      options.onRuleUpdated({ ...options.getRule(), ...(response?.result || {}), name: nextName });
      return true;
    } catch { return false; }
    finally { ruleNameSaving.value = false; }
  };

  const handleRuleDescriptionChange = async (value: string): Promise<boolean> => {
    const nextDescription = value.trim();
    if (!options.ruleId.value || ruleDescriptionSaving.value) return false;
    if (nextDescription === options.ruleDescription.value) return true;
    ruleDescriptionSaving.value = true;
    try {
      const response = await modify(options.ruleId.value, { description: nextDescription });
      if (response?.status !== 200) return false;
      options.onRuleUpdated({ ...options.getRule(), ...(response?.result || {}), description: nextDescription });
      return true;
    } catch { return false; }
    finally { ruleDescriptionSaving.value = false; }
  };

  const handleRuleIconChange = async (value: string): Promise<boolean> => {
    const icon = value.trim();
    if (!options.ruleId.value || !icon || ruleIconSaving.value) return false;
    if (icon === options.getRule()?.metadata?.icon) return true;
    ruleIconSaving.value = true;
    try { await persistMetadata({ icon }); return true; }
    catch { return false; }
    finally { ruleIconSaving.value = false; }
  };

  onBeforeUnmount(clearEditorActionDone);

  return {
    editorActioning,
    editorActionDone,
    editorTransferActioning,
    ruleNameSaving,
    ruleDescriptionSaving,
    ruleIconSaving,
    clearEditorActionDone,
    handleEditorAction,
    handleEditorTransfer,
    handleRuleRename,
    handleRuleDescriptionChange,
    handleRuleIconChange,
  };
};
