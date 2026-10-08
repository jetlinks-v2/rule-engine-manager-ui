/** Homepage discovery/navigation shells. Device/product readonly tools stay mounted. */
export const EXCLUDED_SHARED_TOOL_IDS = new Set([
  'client_tool_help',
  'home_agent_get_context',
  'home_agent_search_capabilities',
  'home_agent_open_menu',
])

/** Page-owned, read-only domain evidence available to native rule authoring. */
export const RULE_EDITOR_SHARED_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  'device_product_search',
  'device_instance_search',
  'device_model_get',
  'device_metadata_search',
])

const RULE_EDITOR_SUBJECT_SEARCH_TOOL_IDS = new Set([
  'device_product_search',
  'device_instance_search',
])

const SUBJECT_SEARCH_INPUT_IDS = new Set(['keyword', 'limit'])

const toolKeys = (tool: Record<string, any>) => [tool.id, tool.name]
  .map(value => String(value || '').trim())
  .filter(Boolean)

export const isRuleEditorSharedToolAllowed = (tool: Record<string, any>) => (
  toolKeys(tool).some(key => RULE_EDITOR_SHARED_TOOL_ALLOWLIST.has(key))
  && !toolKeys(tool).some(key => EXCLUDED_SHARED_TOOL_IDS.has(key))
  && tool.annotations?.readOnlyHint === true
  && tool.requiresConfirmation !== true
)

export const projectRuleEditorSharedTool = (tool: Record<string, any>) => {
  if (!toolKeys(tool).some(key => RULE_EDITOR_SUBJECT_SEARCH_TOOL_IDS.has(key))) {
    return tool
  }
  return {
    ...tool,
    inputs: (Array.isArray(tool.inputs) ? tool.inputs : [])
      .filter(input => SUBJECT_SEARCH_INPUT_IDS.has(String(input?.id || '').trim()))
      .map(input => String(input?.id || '').trim() === 'keyword'
        ? { ...input, required: true }
        : input),
  }
}
