interface ReferenceNodeBridgeOptions {
  isReady: () => boolean;
  executeRemoteTool: (toolId: string, args: Record<string, any>) => Promise<any>;
}

const normalizeReferenceNodesResult = (result: any) => (
  result?.ok === false || !Array.isArray(result?.nodes) ? undefined : result.nodes
);

export const createRuleEditorReferenceNodeBridge = (options: ReferenceNodeBridgeOptions) => {
  const previewNode = (nodeId: string, active: boolean) => (
    !nodeId || !options.isReady()
      ? Promise.resolve(undefined)
      : options.executeRemoteTool('rule_editor_preview_node', { nodeId, active }).catch(() => undefined)
  );

  const listNodesForReference = async () => {
    if (!options.isReady()) {
      return [];
    }

    const referenceResult = await options.executeRemoteTool('rule_editor_list_reference_nodes', { limit: 30 })
      .then(normalizeReferenceNodesResult)
      .catch(() => undefined);
    if (referenceResult) {
      return referenceResult;
    }

    return options.executeRemoteTool('rule_editor_list_nodes', { limit: 30 })
      .then((result: any) => normalizeReferenceNodesResult(result) || [])
      .catch(() => []);
  };

  return {
    previewNode,
    listNodesForReference,
  };
};
