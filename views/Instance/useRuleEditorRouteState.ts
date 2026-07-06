import { computed, ref, watch } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import { onlyMessage } from '@jetlinks-web/utils';
import { getRuleDetail } from '../../api/instance';

const RULE_EDITOR_QUERY_KEY = 'editorId';

interface RuleEditorState {
  visible: boolean;
  current?: Record<string, any>;
}

interface RuleEditorRouteStateOptions {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  ruleEditor: RuleEditorState;
  t: (key: string) => string;
}

const getRouteQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;
const normalizeRuleDetail = (response: any) => response?.result || response;

export const useRuleEditorRouteState = (options: RuleEditorRouteStateOptions) => {
  const restoringRuleEditorId = ref('');
  const routeRuleEditorId = computed(() => String(getRouteQueryValue(options.route.query[RULE_EDITOR_QUERY_KEY]) || ''));

  const syncRuleEditorRoute = (id: string) => {
    if (!id || routeRuleEditorId.value === id) {
      return;
    }
    void options.router.replace({
      query: {
        ...options.route.query,
        [RULE_EDITOR_QUERY_KEY]: id,
      },
    });
  };

  const clearRuleEditorRoute = (id?: string) => {
    if (!routeRuleEditorId.value || (id && routeRuleEditorId.value !== id)) {
      return;
    }
    const nextQuery = { ...options.route.query };
    delete nextQuery[RULE_EDITOR_QUERY_KEY];
    void options.router.replace({ query: nextQuery });
  };

  const openRuleEditor = (item: Record<string, any>, syncRoute = true) => {
    if (!item?.id) {
      return;
    }
    options.ruleEditor.current = item;
    options.ruleEditor.visible = true;
    if (syncRoute) {
      syncRuleEditorRoute(String(item.id));
    }
  };

  const closeRuleEditor = () => {
    const currentId = String(options.ruleEditor.current?.id || '');
    options.ruleEditor.visible = false;
    options.ruleEditor.current = undefined;
    clearRuleEditorRoute(currentId);
  };

  const restoreRuleEditorFromRoute = async (id: string) => {
    if (!id || restoringRuleEditorId.value === id) {
      return;
    }
    if (options.ruleEditor.visible && String(options.ruleEditor.current?.id || '') === id) {
      return;
    }

    restoringRuleEditorId.value = id;
    try {
      const response = await getRuleDetail(id, true);
      const rule = normalizeRuleDetail(response);
      if (rule?.id) {
        openRuleEditor(rule, false);
      } else {
        onlyMessage(options.t('RuleEditor.index.restoreFailed'), 'error');
      }
    } catch {
      onlyMessage(options.t('RuleEditor.index.restoreFailed'), 'error');
    } finally {
      if (restoringRuleEditorId.value === id) {
        restoringRuleEditorId.value = '';
      }
    }
  };

  // editorId 是抽屉编辑态的路由锚点，刷新或复制链接时用它恢复当前规则编辑器。
  watch(
    routeRuleEditorId,
    (id) => {
      if (id) {
        void restoreRuleEditorFromRoute(id);
        return;
      }
      if (options.ruleEditor.visible) {
        options.ruleEditor.visible = false;
        options.ruleEditor.current = undefined;
      }
    },
    { immediate: true },
  );

  return {
    openRuleEditor,
    closeRuleEditor,
  };
};
