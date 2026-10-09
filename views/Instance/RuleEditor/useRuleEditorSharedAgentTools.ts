import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  createHomeAgentRuntime,
  HOME_AGENT_CAPABILITY_CHANGE_EVENT,
  type HomeAgentRuntime,
} from '@jetlinks-web-core/layout/components/AiChat/homeAgentCapabilities';
import { loadHomeAgentCapabilityProviders } from '@jetlinks-web-core/layout/components/AiChat/routeCapabilityLoader';
import type { AiClientToolCall } from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import i18n from '@jetlinks-web-core/locales';
import { createRuleEditorToolUnavailableResult, type RuleEditorToolUnavailableReason } from './toolRuntime';
import {
  EXCLUDED_SHARED_TOOL_IDS,
  isRuleEditorSharedToolAllowed,
  projectRuleEditorSharedTool,
  RULE_EDITOR_SHARED_TOOL_ALLOWLIST,
} from './ruleEditorSharedToolIds';

export {
  EXCLUDED_SHARED_TOOL_IDS,
  RULE_EDITOR_SHARED_TOOL_ALLOWLIST,
} from './ruleEditorSharedToolIds';

const normalizeText = (value: unknown) => String(value || '').trim();

const toolKeys = (tool: Record<string, any>) => [
  normalizeText(tool.id),
  normalizeText(tool.name),
].filter(Boolean);

export const useRuleEditorSharedAgentTools = (enabled: Ref<boolean>) => {
  const runtime = ref<HomeAgentRuntime>();
  const version = ref(0);
  const unavailableReason = ref<RuleEditorToolUnavailableReason>('providers-loading');
  let disposed = false;
  let loadingVersion = 0;

  const disposeRuntime = () => {
    runtime.value?.dispose();
    runtime.value = undefined;
  };

  const rebuildRuntime = async () => {
    const currentVersion = ++loadingVersion;
    if (!enabled.value) {
      unavailableReason.value = 'page-inactive';
      disposeRuntime();
      version.value += 1;
      return;
    }

    unavailableReason.value = 'providers-loading';
    try {
      await loadHomeAgentCapabilityProviders({ loadAll: true });
      if (disposed || currentVersion !== loadingVersion || !enabled.value) return;

      // Build the replacement first: a failed provider refresh must not detach valid readonly facts.
      const nextRuntime = createHomeAgentRuntime({ currentView: () => 'ruleEditorChat' });
      disposeRuntime();
      runtime.value = nextRuntime;
      unavailableReason.value = 'tool-not-available';
      version.value += 1;
    } catch {
      if (disposed || currentVersion !== loadingVersion || !enabled.value) return;
      unavailableReason.value = 'provider-load-failed';
      version.value += 1;
    }
  };

  const sharedClientTools = computed<Record<string, any>[]>(() => (
    runtime.value?.clientTools || []
  ).filter(isRuleEditorSharedToolAllowed).map(projectRuleEditorSharedTool));

  const sharedToolKeys = computed(() => new Set(sharedClientTools.value.flatMap(toolKeys)));

  const workflowGuides = computed(() => {
    // 规则编排助手需要复用首页只读业务查询工具，但工作流指导来自页面能力，
    // 会在规则编辑器中引导模型先解释取证过程，和“静默配置画布”的交互目标冲突。
    return [];
  });

  const handleClientToolCall = (call: AiClientToolCall) => {
    const toolName = normalizeText(call.toolName);
    if (disposed || !enabled.value || !runtime.value || !sharedToolKeys.value.has(toolName)) {
      return Promise.resolve(createRuleEditorToolUnavailableResult(i18n.global.t, {
        transport: 'shared',
        reason: disposed || !enabled.value ? 'page-inactive' : unavailableReason.value,
      }));
    }
    return runtime.value.handleClientToolCall(call);
  };

  const handleCapabilityChange = () => {
    if (enabled.value) void rebuildRuntime();
  };

  watch(enabled, () => {
    void rebuildRuntime();
  }, { immediate: true });

  onMounted(() => {
    window.addEventListener(HOME_AGENT_CAPABILITY_CHANGE_EVENT, handleCapabilityChange);
  });

  onBeforeUnmount(() => {
    disposed = true;
    loadingVersion += 1;
    window.removeEventListener(HOME_AGENT_CAPABILITY_CHANGE_EVENT, handleCapabilityChange);
    disposeRuntime();
  });

  return {
    clientTools: sharedClientTools,
    workflowGuides,
    version,
    hasTool: (toolName: string) => sharedToolKeys.value.has(normalizeText(toolName)),
    // Ownership stays stable during loading/permission changes; live admission is checked above.
    ownsTool: (toolName: string) => RULE_EDITOR_SHARED_TOOL_ALLOWLIST.has(normalizeText(toolName))
      || sharedToolKeys.value.has(normalizeText(toolName)),
    handleClientToolCall,
  };
};
