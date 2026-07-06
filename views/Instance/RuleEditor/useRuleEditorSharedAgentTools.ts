import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  createHomeAgentRuntime,
  HOME_AGENT_CAPABILITY_CHANGE_EVENT,
  type HomeAgentRuntime,
} from '@jetlinks-web-core/layout/components/AiChat/homeAgentCapabilities';
import { loadHomeAgentCapabilityProviders } from '@jetlinks-web-core/layout/components/AiChat/routeCapabilityLoader';
import type { AiClientToolCall } from '@jetlinks-web-core/layout/components/AiChat/clientTools';

const EXCLUDED_SHARED_TOOL_IDS = new Set([
  'client_tool_help',
  'home_agent_get_context',
  'home_agent_search_capabilities',
  'home_agent_open_menu',
]);

const normalizeText = (value: unknown) => String(value || '').trim();

const toolKeys = (tool: Record<string, any>) => [
  normalizeText(tool.id),
  normalizeText(tool.name),
].filter(Boolean);

const isSharedToolAllowed = (tool: Record<string, any>) => (
  !toolKeys(tool).some((key) => EXCLUDED_SHARED_TOOL_IDS.has(key))
  && tool.annotations?.readOnlyHint === true
  && tool.requiresConfirmation !== true
);

export const useRuleEditorSharedAgentTools = (enabled: Ref<boolean>) => {
  const runtime = ref<HomeAgentRuntime>();
  const version = ref(0);
  let disposed = false;
  let loadingVersion = 0;

  const rebuildRuntime = async () => {
    const currentVersion = ++loadingVersion;
    if (!enabled.value) {
      runtime.value = undefined;
      version.value += 1;
      return;
    }

    await loadHomeAgentCapabilityProviders({ loadAll: true });
    if (disposed || currentVersion !== loadingVersion || !enabled.value) {
      return;
    }

    runtime.value = createHomeAgentRuntime({
      currentView: () => 'ruleEditorChat',
    });
    version.value += 1;
  };

  const sharedClientTools = computed(() => (
    runtime.value?.clientTools || []
  ).filter(isSharedToolAllowed));

  const sharedToolKeys = computed(() => new Set(sharedClientTools.value.flatMap(toolKeys)));

  const workflowGuides = computed(() => {
    // 规则编排助手需要复用首页只读业务查询工具，但工作流指导来自页面能力，
    // 会在规则编辑器中引导模型先解释取证过程，和“静默配置画布”的交互目标冲突。
    return [];
  });

  const handleClientToolCall = (call: AiClientToolCall) => {
    if (!runtime.value) {
      throw new Error('Shared rule editor tools are not ready');
    }
    return runtime.value.handleClientToolCall(call);
  };

  const handleCapabilityChange = () => {
    if (enabled.value) {
      void rebuildRuntime();
    }
  };

  watch(enabled, () => {
    void rebuildRuntime();
  }, { immediate: true });

  onMounted(() => {
    window.addEventListener(HOME_AGENT_CAPABILITY_CHANGE_EVENT, handleCapabilityChange);
  });

  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener(HOME_AGENT_CAPABILITY_CHANGE_EVENT, handleCapabilityChange);
  });

  return {
    clientTools: sharedClientTools,
    workflowGuides,
    version,
    hasTool: (toolName: string) => sharedToolKeys.value.has(normalizeText(toolName)),
    handleClientToolCall,
  };
};
