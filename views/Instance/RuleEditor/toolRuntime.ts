import {
  type AiClientToolDefinition,
  type AiClientToolRuntime,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  resolveRuleEditorConfirmOptions,
  resolveRuleEditorToolDisplayName,
  type RuleEditorRemoteToolDefinition,
} from './confirmOptions';

export interface RemoteRuleEditorToolDefinition extends RuleEditorRemoteToolDefinition {
  id: string;
  name?: string;
  description?: string;
  inputs?: Array<Record<string, any>>;
  output?: Record<string, any>;
  annotations?: Record<string, any>;
}

const normalizeToolInputs = (tool: RemoteRuleEditorToolDefinition) => (
  Array.isArray(tool.inputs) ? tool.inputs : []
).map((input) => ({
  ...input,
  id: String(input.id || input.name || ''),
  name: input.name || input.id,
  valueType: input.valueType || { type: 'string' },
})).filter((input) => input.id);

export const createEmptyRuleEditorToolRuntime = (
  t: (key: string, args?: unknown[]) => string,
): AiClientToolRuntime => ({
  clientTools: [],
  clientToolsName: t('RuleEditor.agent.toolsName'),
  clientToolsDescription: t('RuleEditor.agent.toolsDescription'),
  handleClientToolCall: async () => {
    throw new Error(t('RuleEditor.bridge.error.notReady'));
  },
  getToolHelp: () => '',
  getAllToolHelp: () => '',
});

export const toRuleEditorClientToolDefinition = (
  tool: RemoteRuleEditorToolDefinition,
  execute: (toolId: string, args: Record<string, any>) => Promise<any>,
): AiClientToolDefinition<Record<string, any>> => ({
  id: tool.id,
  name: resolveRuleEditorToolDisplayName(tool),
  description: tool.description,
  inputs: normalizeToolInputs(tool),
  output: tool.output || { type: 'object' },
  annotations: {
    readOnlyHint: tool.write !== true,
    ...(tool.annotations || {}),
  },
  confirm: resolveRuleEditorConfirmOptions(tool),
  execute: (args) => execute(tool.id, args),
});
