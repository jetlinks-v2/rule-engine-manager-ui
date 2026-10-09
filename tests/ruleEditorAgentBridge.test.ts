import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { computed, createRenderer, defineComponent, markRaw, nextTick } from 'vue';
import {
  createAiClientToolRuntime,
  type AiClientToolCall,
  type AiClientToolDefinition,
} from '@jetlinks-web-core/layout/components/AiChat/clientTools';
import {
  normalizeRuleEditorExecutionContext,
  useRuleEditorAgentBridge,
} from '../views/Instance/RuleEditor/useRuleEditorAgentBridge';
import { RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS } from '../views/Instance/RuleEditor/ruleEditorAgentProfile';
import {
  APPLY_CANVAS_TOOL_ID,
  RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  RULE_EDITOR_RESOURCE_VERSION,
} from '../views/Instance/RuleEditor/toolRuntimeContracts';
import { RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID } from '../views/Instance/RuleEditor/ruleEditorOrchestrationContracts';
import { useRuleEditorActions } from '../views/Instance/RuleEditor/useRuleEditorActions';

const origin = 'https://rule-editor.test';
const testGlobals = globalThis as typeof globalThis & {
  __ruleEditorSharedToolsTest?: {
    load?: () => Promise<void>;
    createRuntime: () => ReturnType<typeof createAiClientToolRuntime>;
  };
  __ruleEditorActionsTest?: {
    messages: Array<{ message: string; type: string }>;
    request: (method: string, ...args: unknown[]) => Promise<unknown>;
  };
};

// A headless Vue renderer exercises real watch scheduling and mount/unmount ownership.
const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  insert: () => undefined, remove: () => undefined, patchProp: () => undefined,
  setText: () => undefined, setElementText: () => undefined,
  parentNode: () => null, nextSibling: () => null,
});

const flushSharedProviders = async () => {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
};

const orchestrationCapabilities = (description = 'Find one entity by a stable reference.') => [
  {
    capabilityId: 'platform.entity.lookup',
    localizedName: 'Entity lookup',
    localizedDescription: description,
    discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
    effect: 'READ',
    inputContract: {
      kind: 'invocation-parameters', open: true, uncertain: false,
      fields: [{ name: 'id', type: 'string', required: true }],
    },
    bindingPolicy: {
      completeObjectTargets: ['request'],
      acceptedSourceTypes: ['object', 'invocation-parameters'],
      fieldOverrides: true,
    },
  },
  {
    capabilityId: 'platform.event.forward',
    localizedName: 'Event forwarding',
    localizedDescription: 'Forward an upstream event to a declared target.',
    discoveryHintPolicy: { required: false, maxItems: 4, maxLength: 48 },
    effect: 'WRITE',
  },
];

const nativeRemoteTools = RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS.map(id => ({
  id,
  name: id,
  description: `Registered ${id}`,
  inputs: [],
  output: { type: 'object' },
  write: id === APPLY_CANVAS_TOOL_ID,
  agentVisible: true,
}));

interface BridgeRequest {
  type: string;
  requestId: string;
  transportRequestId?: string;
  payload: {
    action?: 'save' | 'deploy';
    resourceVersion?: string;
    contractVersion?: string;
    toolName?: string;
    transportRequestId?: string;
    arguments: Record<string, unknown>;
    executionContext: {
      logicalToolCallId?: string;
      phase?: 'prepare' | 'execute' | 'verify' | 'cancel';
      expectedRevision?: number;
    };
  };
}

const createBridgeHarness = (testContext: TestContext, options: {
  autoRespondExecute?: boolean;
  captureRequestTimeouts?: boolean;
  frameSrc?: string;
  throwHandshakePost?: boolean;
  sharedTools?: AiClientToolDefinition[];
  loadSharedProviders?: () => Promise<void>;
} = {}) => {
  const previousWindow = globalThis.window;
  const previousSharedProviders = testGlobals.__ruleEditorSharedToolsTest;
  testGlobals.__ruleEditorSharedToolsTest = {
    load: options.loadSharedProviders,
    createRuntime: () => createAiClientToolRuntime(() => options.sharedTools || [], { includeHelpTool: false }),
  };
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  const requestTimeouts: number[] = [];
  const capturedTimers = new Map<number, () => void>();
  let timerId = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: { origin, href: `${origin}/editor` },
      setTimeout: (callback: () => void, timeout?: number) => {
        if (options.captureRequestTimeouts && timeout === 60000) {
          const id = ++timerId;
          capturedTimers.set(id, callback);
          requestTimeouts.push(id);
          return id;
        }
        return globalThis.setTimeout(callback, timeout);
      },
      clearTimeout: (id: number) => {
        if (!capturedTimers.delete(id)) globalThis.clearTimeout(id);
      },
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        const entries = listeners.get(type) || new Set();
        entries.add(listener);
        listeners.set(type, entries);
      },
      removeEventListener: (type: string, listener: (event: MessageEvent) => void) => listeners.get(type)?.delete(listener),
    },
  });
  const ruleId = { value: 'rule-1' };
  let bridge!: ReturnType<typeof useRuleEditorAgentBridge>;
  const app = renderer.createApp(defineComponent({
    setup: () => {
      bridge = useRuleEditorAgentBridge({ ruleId });
      return () => null;
    },
  }));
  app.mount({});
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    app.unmount();
  };
  bridge.reset();
  const requests: BridgeRequest[] = [];
  const cancellations: BridgeRequest[] = [];
  const handshakes: BridgeRequest[] = [];
  const requestWaiters: Array<{ count: number; resolve: () => void }> = [];
  const resolveRequestWaiters = () => {
    for (let index = requestWaiters.length - 1; index >= 0; index -= 1) {
      if (requests.length >= requestWaiters[index]!.count) {
        requestWaiters.splice(index, 1)[0]!.resolve();
      }
    }
  };
  let previewCleared = false;
  const emit = (
    type: string,
    payload: Record<string, unknown>,
    requestId?: string,
    overrides: { source?: unknown; eventOrigin?: string; declaredOrigin?: string; ruleId?: string } = {},
  ) => {
    const event = {
      source: overrides.source ?? frame,
      origin: overrides.eventOrigin ?? origin,
      data: {
        channel: 'jetlinks-rule-editor-agent',
        type: `rule-editor-agent:${type}`,
        origin: overrides.declaredOrigin ?? origin,
        ruleId: overrides.ruleId ?? ruleId.value,
        requestId,
        payload,
      },
    } as unknown as MessageEvent;
    listeners.get('message')?.forEach((listener) => listener(event));
  };
  const frame = {
    postMessage: (request: BridgeRequest, targetOrigin: string) => {
      assert.equal(targetOrigin, origin);
      if (request.type === 'rule-editor-agent:handshake') {
        handshakes.push(request);
        if (options.throwHandshakePost) {
          throw new Error('frame detached');
        }
        return;
      }
      if (request.type === 'rule-editor-agent:cancel') {
        cancellations.push(request);
        return;
      }
      requests.push(request);
      resolveRequestWaiters();
      if (request.payload.toolName !== RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID && options.autoRespondExecute === false) return;
      assert.equal(request.payload.toolName, RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID);
      if (request.payload.executionContext.phase === 'prepare') {
        emit('tool-progress', {
          progress: {
            version: 'client-tool-progress/v1', stepId: 'resolve-capability', status: 'running',
            label: 'Resolving declared capabilities', completed: 1, total: 4,
          },
        }, request.requestId);
        emit('tool-result', {
          ok: true,
          result: {
            ok: true, success: true, effect: 'not-applied', completion: 'awaiting-confirmation',
            requestId: request.requestId, preparedPlanId: 'prepared-1', planDigest: 'digest-1', baseRevision: 5,
          },
        }, request.requestId);
        return;
      }
      if (request.payload.executionContext.phase === 'cancel') {
        previewCleared = true;
        emit('tool-result', {
          ok: true,
          result: { ok: true, effect: 'not-applied', completion: 'blocked', previewCleared: true },
        }, request.requestId);
        return;
      }
      if (options.autoRespondExecute === false) return;
      emit('tool-result', {
        ok: true,
        result: {
          ok: true, success: true, effect: 'applied', completion: 'completed',
          requestId: request.requestId, planDigest: 'digest-1', baseRevision: 5, newRevision: 6,
          verification: { topology: { status: 'pass' }, configuration: { status: 'pass' }, bindings: { status: 'pass' } },
          taskProgress: {
            satisfied: true,
            requiredChecks: ['topology', 'configuration', 'bindings'],
            unresolved: [],
          },
        },
      }, request.requestId);
    },
  };
  bridge.iframeRef.value = markRaw({ src: options.frameSrc ?? `${origin}/iframe`, contentWindow: frame }) as unknown as HTMLIFrameElement;
  emit('register-tools', {
    tools: [],
    context: {
      ruleId: ruleId.value,
      canvasRevision: 5,
      orchestrationCapabilities: orchestrationCapabilities(),
    },
    resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
    contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  });
  testContext.after(() => {
    unmount();
    testGlobals.__ruleEditorSharedToolsTest = previousSharedProviders;
    globalThis.window = previousWindow;
  });
  return {
    bridge,
    requests,
    cancellations,
    handshakes,
    emit,
    unmount,
    capabilityChange: () => listeners.get('jetlinks-home-agent-capability-change')?.forEach(listener => listener({} as MessageEvent)),
    waitForRequests: (count: number) => (
      requests.length >= count
        ? Promise.resolve()
        : new Promise<void>((resolve) => requestWaiters.push({ count, resolve }))
    ),
    fireNextRequestTimeout: () => {
      while (requestTimeouts.length) {
        const id = requestTimeouts.shift()!;
        const callback = capturedTimers.get(id);
        capturedTimers.delete(id);
        if (callback) {
          callback();
          return;
        }
      }
    },
    get previewCleared() { return previewCleared; },
  };
};

const createActionHarness = (
  testContext: TestContext,
  bridge: ReturnType<typeof useRuleEditorAgentBridge>,
  request: (method: string, ...args: unknown[]) => Promise<unknown> = async () => ({ status: 200 }),
) => {
  const previousFixture = testGlobals.__ruleEditorActionsTest;
  const messages: Array<{ message: string; type: string }> = [];
  const updates: Record<string, unknown>[] = [];
  testGlobals.__ruleEditorActionsTest = { messages, request };
  let actions!: ReturnType<typeof useRuleEditorActions>;
  const app = renderer.createApp(defineComponent({
    setup: () => {
      actions = useRuleEditorActions({
        bridge,
        bridgeStatus: computed(() => bridge.status.value),
        bridgeActions: computed(() => ({ save: true, deploy: true, import: true, export: true })),
        ruleId: computed(() => 'rule-1'),
        ruleName: computed(() => 'Rule'),
        ruleDescription: computed(() => ''),
        getRule: () => ({ id: 'rule-1' }),
        onRuleUpdated: (rule) => updates.push(rule),
        t: (key) => key,
      });
      return () => null;
    },
  }));
  app.mount({});
  testContext.after(() => {
    app.unmount();
    testGlobals.__ruleEditorActionsTest = previousFixture;
  });
  return { actions, messages, updates };
};

for (const action of ['save', 'deploy'] as const) {
  for (const [shape, payload] of [
    ['legacy error object', { ok: false, error: { name: 'Error', message: 'Native validation failed' } }],
    ['legacy error string', { ok: false, error: 'Native validation failed' }],
    ['business result', { ok: true, result: { ok: false, error: 'Native validation failed' } }],
  ] as const) {
    test(`${action} keeps ${shape} failed without a second notification`, async (testContext) => {
      const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
      const { actions, messages, updates } = createActionHarness(testContext, harness.bridge);
      const pending = actions.handleEditorAction(action);
      await harness.waitForRequests(1);
      assert.equal(harness.requests[0]!.payload.action, action);
      assert.equal(actions.editorActioning.value, action);
      harness.emit('action-result', payload, harness.requests[0]!.requestId);
      await pending;
      assert.deepEqual(messages, []);
      assert.deepEqual(updates, []);
      assert.equal(actions.editorActionDone.value, '');
      assert.equal(actions.editorActioning.value, '');
    });
  }
}

for (const failure of ['frame-missing', 'origin-unavailable', 'post-message-failed'] as const) {
  test(`save still notifies a local ${failure} transport failure`, async (testContext) => {
    const harness = createBridgeHarness(testContext);
    const { actions, messages } = createActionHarness(testContext, harness.bridge);
    if (failure === 'frame-missing') {
      harness.bridge.iframeRef.value = undefined;
    } else if (failure === 'origin-unavailable') {
      harness.bridge.iframeRef.value!.src = '';
    } else {
      harness.bridge.iframeRef.value!.contentWindow!.postMessage = () => { throw new Error('frame detached'); };
    }
    await actions.handleEditorAction('save');
    assert.deepEqual(messages, [{ message: 'RuleEditor.bridge.error.notReady', type: 'error' }]);
    assert.equal(actions.editorActionDone.value, '');
    assert.equal(actions.editorActioning.value, '');
    assert.equal(harness.requests.length, 0);
  });
}

test('save still notifies a bridge timeout and releases the button', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false, captureRequestTimeouts: true });
  const { actions, messages } = createActionHarness(testContext, harness.bridge);
  const pending = actions.handleEditorAction('save');
  await harness.waitForRequests(1);
  harness.fireNextRequestTimeout();
  await pending;
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.type, 'error');
  assert.equal(actions.editorActionDone.value, '');
  assert.equal(actions.editorActioning.value, '');
});

test('deploy still notifies a detached bridge rather than hiding transport failure', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  const { actions, messages } = createActionHarness(testContext, harness.bridge);
  const pending = actions.handleEditorAction('deploy');
  await harness.waitForRequests(1);
  harness.emit('dispose', {});
  await pending;
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.type, 'error');
  assert.equal(actions.editorActionDone.value, '');
  assert.equal(actions.editorActioning.value, '');
});

test('successful save updates its button without an extra success notification', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  const { actions, messages } = createActionHarness(testContext, harness.bridge);
  const pending = actions.handleEditorAction('save');
  await harness.waitForRequests(1);
  harness.emit('action-result', { ok: true, result: { ok: true, action: 'save' } }, harness.requests[0]!.requestId);
  await pending;
  assert.deepEqual(messages, []);
  assert.equal(actions.editorActionDone.value, 'save');
  assert.equal(actions.editorActioning.value, '');
});

test('thumbnail synchronization keeps its own warning without turning a successful save into failure', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  let thumbnailRequests = 0;
  const { actions, messages } = createActionHarness(testContext, harness.bridge, async (method, url) => {
    assert.equal(method, 'put');
    assert.equal(url, '/rule-engine/instance/rule-1/metadata');
    thumbnailRequests += 1;
    throw new Error('Thumbnail synchronization failed');
  });
  const pending = actions.handleEditorAction('save');
  await harness.waitForRequests(1);
  harness.emit('action-result', {
    ok: true,
    result: { ok: true, action: 'save', thumbnailSvg: '<svg />' },
  }, harness.requests[0]!.requestId);
  await pending;
  assert.equal(thumbnailRequests, 1);
  assert.deepEqual(messages, [{ message: 'Thumbnail synchronization failed', type: 'warning' }]);
  assert.equal(actions.editorActionDone.value, 'save');
  assert.equal(actions.editorActioning.value, '');
});

test('normalization preserves the v3 orchestration phase only', () => {
  assert.deepEqual(
    normalizeRuleEditorExecutionContext({ logicalToolCallId: ' call-1 ', phase: 'prepare' }),
    { logicalToolCallId: 'call-1', phase: 'prepare', responseId: undefined, turnSeq: undefined, userMessage: undefined, userInputResolution: undefined },
  );
  assert.equal(normalizeRuleEditorExecutionContext({ phase: 'invalid' } as any), undefined);
  assert.equal(normalizeRuleEditorExecutionContext({ phase: 'verify' })?.phase, 'verify');
  assert.equal(normalizeRuleEditorExecutionContext({ phase: 'cancel' })?.phase, 'cancel');
});

test('iframe disposal keeps page-owned shared readonly evidence mounted', async (testContext) => {
  let reads = 0;
  const harness = createBridgeHarness(testContext, {
    sharedTools: [{
      id: 'device_metadata_search', name: 'device_metadata_search',
      annotations: { readOnlyHint: true },
      execute: async () => ({ success: true, fact: ++reads }),
    }],
  });
  await flushSharedProviders();
  assert.equal(harness.bridge.ready.value, true);
  const savedHandler = harness.bridge.handleClientToolCall;
  const call = (id: string) => savedHandler({ id, toolName: 'device_metadata_search', arguments: {} });
  assert.equal((await call('before-dispose')).success, true);
  harness.emit('dispose', {});
  await flushSharedProviders();
  assert.equal(harness.bridge.ready.value, false);
  assert.equal(harness.bridge.diagnostic.value.reason, 'iframe-disposed');
  assert.equal((await call('after-iframe-dispose')).success, true);
  assert.equal(reads, 2);
  assert.equal(harness.requests.length, 0);
});

test('closed pages reject retained handlers immediately and ignore late trusted registration', async (testContext) => {
  let reads = 0;
  const harness = createBridgeHarness(testContext, {
    sharedTools: [{
      id: 'device_product_search', name: 'device_product_search',
      annotations: { readOnlyHint: true }, execute: async () => ({ success: true, count: ++reads }),
    }],
  });
  await flushSharedProviders();
  const retainedHandler = harness.bridge.handleClientToolCall;
  harness.bridge.disposeBridge();
  const shared = await retainedHandler({ id: 'closed-shared', toolName: 'device_product_search', arguments: {} });
  assert.equal(shared.code, 'rule_editor.shared_tool.unavailable');
  assert.equal(shared.details.bridge.reason, 'page-inactive');
  const native = await retainedHandler({ id: 'closed-native', toolName: 'rule_editor_search_node_types', arguments: {} });
  assert.equal(native.code, 'rule_editor.bridge.unavailable');
  assert.equal(native.details.bridge.reason, 'page-disposed');
  assert.equal(native.receipt.effect, 'not-applied');
  harness.emit('register-tools', { tools: nativeRemoteTools, context: {} });
  assert.equal(harness.bridge.status.value, 'idle');
  assert.equal(reads, 0);
  assert.equal(harness.requests.length, 0);
});

test('unmounted page handlers retain a bounded lifecycle cause and execute no effects', async (testContext) => {
  const harness = createBridgeHarness(testContext);
  const retainedHandler = harness.bridge.handleClientToolCall;
  harness.unmount();
  const result = await retainedHandler({ id: 'unmounted-native', toolName: APPLY_CANVAS_TOOL_ID, arguments: {} });
  assert.equal(result.details.bridge.reason, 'component-unmounted');
  assert.equal(result.externalExecutionStarted, false);
  assert.equal(result.receipt.effect, 'not-applied');
  assert.equal(harness.requests.length, 0);
});

test('shared ownership during provider loading and failure never falls through to the iframe', async (testContext) => {
  let rejectLoad!: (error: Error) => void;
  const pendingLoad = new Promise<void>((_resolve, reject) => { rejectLoad = reject; });
  const harness = createBridgeHarness(testContext, { loadSharedProviders: () => pendingLoad });
  await nextTick();
  const call = () => harness.bridge.handleClientToolCall({ id: 'shared-loading', toolName: 'device_metadata_search', arguments: {} });
  const loading = await call();
  assert.equal(loading.code, 'rule_editor.shared_tool.unavailable');
  assert.equal(loading.details.bridge.reason, 'providers-loading');
  rejectLoad(new Error('provider transport unavailable'));
  await flushSharedProviders();
  const failed = await call();
  assert.equal(failed.details.bridge.reason, 'provider-load-failed');
  assert.equal(failed.receipt.effect, 'not-applied');
  assert.equal(harness.requests.length, 0);
});

test('shared admission still requires live readonly permission and never aliases unknown tools', async (testContext) => {
  let reads = 0;
  const harness = createBridgeHarness(testContext, {
    sharedTools: [{
      id: 'device_model_get', name: 'device_model_get',
      annotations: { readOnlyHint: false }, execute: async () => ({ count: ++reads }),
    }],
  });
  await flushSharedProviders();
  const denied = await harness.bridge.handleClientToolCall({ id: 'denied', toolName: 'device_model_get', arguments: {} });
  assert.equal(denied.details.bridge.reason, 'tool-not-available');
  assert.equal(reads, 0);
  await assert.rejects(harness.bridge.handleClientToolCall({ id: 'unknown', toolName: 'unregistered_lookup', arguments: {} }), /Unsupported client tool/);
  assert.equal(harness.requests.length, 0);
});

test('failed shared runtime construction preserves the existing readonly runtime', async (testContext) => {
  const harness = createBridgeHarness(testContext, {
    sharedTools: [{
      id: 'device_metadata_search', name: 'device_metadata_search',
      annotations: { readOnlyHint: true }, execute: async () => ({ success: true }),
    }],
  });
  await flushSharedProviders();
  testGlobals.__ruleEditorSharedToolsTest!.createRuntime = () => { throw new Error('provider construction failed'); };
  harness.capabilityChange();
  await flushSharedProviders();
  const result = await harness.bridge.handleClientToolCall({ id: 'retained-shared', toolName: 'device_metadata_search', arguments: {} });
  assert.equal(result.success, true);
  assert.equal(harness.requests.length, 0);
});

test('invalid iframe handshake blocks native calls without withdrawing shared facts', async (testContext) => {
  const harness = createBridgeHarness(testContext, {
    sharedTools: [{
      id: 'device_metadata_search', name: 'device_metadata_search',
      annotations: { readOnlyHint: true }, execute: async () => ({ success: true }),
    }],
  });
  await flushSharedProviders();
  harness.emit('register-tools', { tools: {} });
  const native = await harness.bridge.handleClientToolCall({ id: 'rejected-native', toolName: 'rule_editor_search_node_types', arguments: {} });
  assert.equal(native.details.bridge.reason, 'invalid-handshake');
  assert.equal(native.externalExecutionStarted, false);
  const shared = await harness.bridge.handleClientToolCall({ id: 'valid-shared', toolName: 'device_metadata_search', arguments: {} });
  assert.equal(shared.success, true);
  assert.equal(harness.requests.length, 0);
});

test('unavailable frame and origin return structured zero-effect transport diagnostics', async (testContext) => {
  const harness = createBridgeHarness(testContext);
  const frame = harness.bridge.iframeRef.value!;
  frame.src = '';
  const originFailure = await harness.bridge.executeEditorAction('deploy') as Record<string, any>;
  assert.equal(originFailure.details.bridge.reason, 'origin-unavailable');
  assert.equal(originFailure.receipt.effect, 'not-applied');
  harness.bridge.iframeRef.value = undefined;
  const frameFailure = await harness.bridge.executeEditorAction('deploy') as Record<string, any>;
  assert.equal(frameFailure.details.bridge.reason, 'frame-missing');
  assert.equal(frameFailure.externalExecutionStarted, false);
  assert.equal(harness.requests.length, 0);
});

test('iframe disposal after dispatch preserves unknown effects and never replays a request', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  harness.emit('register-tools', { tools: nativeRemoteTools, context: {} });
  const pending = harness.bridge.handleClientToolCall({ id: 'interrupted-native', toolName: 'rule_editor_search_node_types', arguments: {} });
  await harness.waitForRequests(1);
  harness.emit('dispose', {});
  const result = await pending;
  assert.equal(result.code, 'rule_editor.bridge.unavailable');
  assert.equal(result.details.bridge.reason, 'iframe-disposed');
  assert.equal(result.effectState, 'unknown');
  assert.equal(result.externalExecutionStarted, true);
  assert.equal(harness.requests.length, 1);
});

test('a load event following valid registration does not detach its executable runtime', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  harness.emit('register-tools', { tools: nativeRemoteTools, context: {} });
  harness.bridge.markFrameLoaded();
  const pending = harness.bridge.handleClientToolCall({ id: 'registered-before-load', toolName: 'rule_editor_search_node_types', arguments: {} });
  await harness.waitForRequests(1);
  harness.emit('tool-result', { ok: true, result: { ok: true, success: true, nodeTypes: [] } }, harness.requests[0]!.requestId);
  assert.equal((await pending).success, true);
  assert.equal(harness.requests.length, 1);
});

test('native bridge progress reflects actual transport lifecycle and preserves owner stages', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  harness.emit('register-tools', {
    tools: nativeRemoteTools,
    context: { ruleId: 'rule-1', canvasRevision: 5 },
    resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
    contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  });
  const progress: Array<{ stepId: string; status: string; label: string }> = [];
  const call = (id: string) => harness.bridge.handleClientToolCall({
    id,
    toolName: 'rule_editor_get_node_type_detail',
    arguments: { type: 'third-party-node' },
    executionContext: { responseId: id },
    reportProgress: (event) => progress.push(event),
  });

  const first = call('native-success');
  await harness.waitForRequests(1);
  assert.deepEqual(progress.map(item => item.status), ['running']);
  harness.emit('tool-result', { ok: true, result: { ok: true, type: 'third-party-node' } }, harness.requests[0]!.requestId);
  await first;
  assert.deepEqual(progress.map(item => item.status), ['running', 'completed']);

  progress.length = 0;
  const failed = call('native-failure');
  await harness.waitForRequests(2);
  harness.emit('tool-result', { ok: true, result: { ok: false, success: false } }, harness.requests[1]!.requestId);
  await failed;
  assert.deepEqual(progress.map(item => item.status), ['running', 'failed']);

  progress.length = 0;
  const withOwnerProgress = call('native-owner-progress');
  await harness.waitForRequests(3);
  const requestId = harness.requests[2]!.requestId;
  harness.emit('tool-progress', {
    progress: {
      version: 'client-tool-progress/v1', stepId: 'owner-read', status: 'completed',
      label: 'Owner facts read', completed: 2, total: 2,
    },
  }, requestId);
  harness.emit('tool-result', { ok: true, result: { ok: true, type: 'third-party-node' } }, requestId);
  await withOwnerProgress;
  assert.deepEqual(progress.map(item => item.stepId), ['rule_editor_get_node_type_detail', 'owner-read']);
  assert.equal(progress.at(-1)?.label, 'Owner facts read');
});

test('bridge uses one v3 remote tool with unique phase transport ids and stable logical id', async (testContext) => {
  const { bridge, requests } = createBridgeHarness(testContext);
  const steps: string[] = [];
  const call: AiClientToolCall = {
    id: 'rpc-1',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: {
      goal: {
        flow: 'request-response',
        operations: [{ intent: 'device.lookup', capabilityRef: 'platform.entity.lookup', output: 'device' }],
      },
    },
    executionContext: { logicalToolCallId: 'logical-1' },
    requestConfirmation: async () => ({ approved: true }),
    reportProgress: (progress) => steps.push(progress.stepId),
  };

  const result = await bridge.handleClientToolCall(call) as Record<string, any>;
  assert.deepEqual(requests.map((request) => request.payload.toolName), [
    RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
  ]);
  assert.deepEqual(requests.map((request) => request.payload.executionContext.phase), ['prepare', 'execute']);
  assert.deepEqual(requests.map((request) => request.payload.executionContext.logicalToolCallId), ['logical-1', 'logical-1']);
  assert.equal(new Set(requests.map((request) => request.requestId)).size, 2);
  assert.deepEqual(requests.map((request) => request.transportRequestId), requests.map((request) => request.requestId));
  assert.deepEqual(requests.map((request) => request.payload.transportRequestId), requests.map((request) => request.requestId));
  assert.deepEqual(requests[0]?.payload.arguments, call.arguments);
  assert.deepEqual(requests[1]?.payload.arguments, {
    preparedPlanId: 'prepared-1', planDigest: 'digest-1', baseRevision: 5,
    requestId: requests[0]?.requestId,
  });
  assert.equal(result.receipt.effect, 'applied');
  assert.equal(result.receipt.completion, 'completed');
  assert.ok(steps.includes('resolve-capability'));
  assert.equal(steps.includes('resolving') || steps.includes('compiling') || steps.includes('previewing'), false);
});

test('rejected confirmation clears the prepared preview without execute/apply', async (testContext) => {
  const harness = createBridgeHarness(testContext);
  const call: AiClientToolCall = {
    id: 'rpc-rejected',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: {
      goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
    },
    executionContext: { logicalToolCallId: 'logical-rejected' },
    requestConfirmation: async () => ({ approved: false }),
  };

  await harness.bridge.handleClientToolCall(call);
  assert.deepEqual(
    harness.requests.map((request) => request.payload.executionContext.phase),
    ['prepare', 'cancel'],
  );
  assert.equal(harness.requests.some((request) => request.payload.executionContext.phase === 'execute'), false);
  assert.equal(harness.previewCleared, true);
  assert.equal(new Set(harness.requests.map((request) => request.requestId)).size, 2);
  assert.ok(harness.requests.every((request) => request.payload.executionContext.logicalToolCallId === 'logical-rejected'));
});

test('rejected confirmations release prepared entries and write baselines beyond the live capacity', async (testContext) => {
  const harness = createBridgeHarness(testContext);
  for (let index = 0; index < 130; index += 1) {
    const result = await harness.bridge.handleClientToolCall({
      id: `rpc-rejected-${index}`,
      toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      arguments: {
        goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
      },
      executionContext: { logicalToolCallId: `logical-rejected-${index}` },
      requestConfirmation: async () => ({ approved: false }),
    }) as Record<string, any>;
    assert.equal(result.status, 'rejected');
    assert.notEqual(result.code, 'rule_editor.write.capacity_exhausted');
  }
  assert.equal(harness.requests.filter(request => request.payload.executionContext.phase === 'prepare').length, 130);
  assert.equal(harness.requests.filter(request => request.payload.executionContext.phase === 'cancel').length, 130);
  assert.equal(harness.requests.some(request => request.payload.executionContext.phase === 'execute'), false);
});

test('parent bridge refuses unresolved frame origins instead of posting with a wildcard', async (testContext) => {
  const harness = createBridgeHarness(testContext, { frameSrc: '' });
  const result = await harness.bridge.executeEditorAction('deploy') as Record<string, any>;
  assert.equal(result.code, 'rule_editor.bridge.unavailable');
  assert.equal(result.effectState, 'not-started');
  assert.equal(result.externalExecutionStarted, false);
  assert.equal(result.details.bridge.reason, 'reset');
  assert.equal(result.details.bridge.originAvailable, false);
  assert.equal(harness.requests.length, 0);
});

test('frame load starts a replayable handshake and registration restores readiness', (testContext) => {
  const harness = createBridgeHarness(testContext);
  harness.bridge.reset();
  harness.bridge.markFrameLoaded();
  assert.equal(harness.handshakes.length, 1);
  assert.equal(harness.handshakes[0]?.payload?.resourceVersion, RULE_EDITOR_RESOURCE_VERSION);
  assert.equal(harness.handshakes[0]?.payload?.contractVersion, RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION);
  harness.emit('register-tools', {
    tools: [],
    context: {
      ruleId: 'rule-1', canvasRevision: 5,
      orchestrationCapabilities: orchestrationCapabilities(),
    },
    resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
    contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  });
  assert.equal(harness.bridge.ready.value, true);
});

test('parent bridge publishes only the bounded native fallback from the iframe catalog', (testContext) => {
  const harness = createBridgeHarness(testContext);
  harness.emit('register-tools', {
    tools: [
      ...nativeRemoteTools,
      { id: 'rule_editor_edit_node', name: 'rule_editor_edit_node', write: true, agentVisible: true },
      { id: 'rule_editor_delete_node', name: 'rule_editor_delete_node', write: true, agentVisible: true },
      { id: 'rule_editor_get_debug_logs', name: 'rule_editor_get_debug_logs', agentVisible: true },
    ],
    context: {
      ruleId: 'rule-1', canvasRevision: 5,
      orchestrationCapabilities: orchestrationCapabilities(),
    },
    resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
    contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  });
  const ids = harness.bridge.clientTools.value.map(tool => tool.id);
  RULE_EDITOR_NATIVE_FALLBACK_TOOL_IDS.forEach(id => assert.equal(ids.includes(id), true, id));
  assert.equal(ids.includes('rule_editor_edit_node'), false);
  assert.equal(ids.includes('rule_editor_delete_node'), false);
  assert.equal(ids.includes('rule_editor_get_debug_logs'), false);
  assert.equal(ids.includes(RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID), true);
});

test('parent bridge accepts rolling version skew and absent version metadata', (testContext) => {
  const harness = createBridgeHarness(testContext);
  const registration = {
    tools: [],
    context: {
      ruleId: 'rule-1', canvasRevision: 5,
      orchestrationCapabilities: orchestrationCapabilities(),
    },
  };

  harness.bridge.reset();
  harness.emit('register-tools', {
    ...registration,
    resourceVersion: 'older-resource-build',
    contractVersion: 'rule-editor-orchestration/v2',
  });
  assert.equal(harness.bridge.status.value, 'ready');

  harness.bridge.reset();
  harness.emit('register-tools', registration);
  assert.equal(harness.bridge.status.value, 'ready');
});

test('parent bridge rejects only structurally unusable handshake payloads', (testContext) => {
  const harness = createBridgeHarness(testContext);
  harness.bridge.reset();
  harness.emit('register-tools', {
    tools: {},
    context: 'not-an-object',
    resourceVersion: RULE_EDITOR_RESOURCE_VERSION,
    contractVersion: RULE_EDITOR_ORCHESTRATION_CONTRACT_VERSION,
  } as unknown as Record<string, unknown>);
  assert.equal(harness.bridge.status.value, 'error');
});

test('parent bridge keeps source, origin, and ruleId as fail-closed boundaries', (testContext) => {
  const harness = createBridgeHarness(testContext);
  const registration = {
    tools: [],
    context: {
      ruleId: 'rule-1', canvasRevision: 5,
      orchestrationCapabilities: orchestrationCapabilities(),
    },
  };

  harness.bridge.reset();
  harness.emit('register-tools', registration, undefined, { source: {} });
  harness.emit('register-tools', registration, undefined, { eventOrigin: 'https://attacker.test' });
  harness.emit('register-tools', registration, undefined, { ruleId: 'other-rule' });
  assert.equal(harness.bridge.status.value, 'loading');

  harness.emit('register-tools', registration);
  assert.equal(harness.bridge.status.value, 'ready');
});

test('frame teardown during a handshake does not abort the bounded readiness wait', (testContext) => {
  const harness = createBridgeHarness(testContext, { throwHandshakePost: true });
  harness.bridge.reset();
  assert.doesNotThrow(() => harness.bridge.markFrameLoaded());
  assert.equal(harness.handshakes.length, 1);
  assert.equal(harness.bridge.status.value, 'loading');
});

test('capability metadata changes defer during an active call then refresh the model contract once', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  const call: AiClientToolCall = {
    id: 'rpc-catalog-refresh',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: {
      goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
    },
    executionContext: { logicalToolCallId: 'logical-catalog-refresh' },
    requestConfirmation: async () => ({ approved: true }),
  };
  const pending = harness.bridge.handleClientToolCall(call) as Promise<Record<string, any>>;
  await harness.waitForRequests(2);
  const versionBeforeChange = harness.bridge.version.value;
  harness.emit('context-change', {
    context: {
      ruleId: 'rule-1', canvasRevision: 5,
      orchestrationCapabilities: orchestrationCapabilities('Find one entity by the refreshed contract.'),
    },
  });
  assert.equal(harness.bridge.version.value, versionBeforeChange);
  const executeRequest = harness.requests[1]!;
  harness.emit('tool-result', {
    ok: true,
    result: {
      effect: 'applied', completion: 'completed', newRevision: 6,
      verification: { topology: { status: 'pass' } },
      taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
    },
  }, executeRequest.requestId);
  await pending;
  assert.ok(harness.bridge.version.value > versionBeforeChange);
  const capabilityChoice = (harness.bridge.clientTools.value
    .find(tool => tool.id === RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID)?.expands?._schema as any)
    ?.properties?.goal?.properties?.operations?.items?.properties?.capabilityRef?.oneOf
    ?.find((item: any) => item.const === 'platform.entity.lookup');
  assert.match(capabilityChoice.description, /^Find one entity by the refreshed contract\./);
  assert.match(capabilityChoice.description, /selectionRequired=false/);
  assert.match(capabilityChoice.description, /completeObjectTargets=request/);
  const versionAfterCatalogRefresh = harness.bridge.version.value;
  harness.emit('context-change', {
    context: {
      ruleId: 'rule-1', canvasRevision: 6, nodeCount: 1,
      orchestrationCapabilities: orchestrationCapabilities('Find one entity by the refreshed contract.'),
    },
  });
  assert.equal(harness.bridge.version.value, versionAfterCatalogRefresh);
});

test('late execute result cannot settle a pending verify request', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false, captureRequestTimeouts: true });
  const call: AiClientToolCall = {
    id: 'rpc-late',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: {
      goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
    },
    executionContext: { logicalToolCallId: 'logical-late' },
    requestConfirmation: async () => ({ approved: true }),
  };
  const pending = harness.bridge.handleClientToolCall(call) as Promise<Record<string, any>>;
  await harness.waitForRequests(2);
  assert.deepEqual(harness.requests.map((request) => request.payload.executionContext.phase), ['prepare', 'execute']);
  const executeRequest = harness.requests[1]!;
  harness.fireNextRequestTimeout();
  assert.deepEqual(harness.cancellations.map((request) => request.transportRequestId), [executeRequest.requestId]);
  await harness.waitForRequests(3);
  assert.deepEqual(harness.requests.map((request) => request.payload.executionContext.phase), ['prepare', 'execute', 'verify']);
  const verifyRequest = harness.requests[2]!;
  harness.emit('tool-result', {
    ok: true,
    result: { effect: 'applied', completion: 'completed', requestId: executeRequest.requestId },
  }, executeRequest.requestId);
  harness.emit('tool-result', {
    ok: true,
    result: {
      effect: 'applied', completion: 'completed', requestId: verifyRequest.requestId,
      verification: { topology: { status: 'pass' } },
      taskProgress: { satisfied: true, requiredChecks: ['topology'], unresolved: [] },
    },
  }, verifyRequest.requestId);
  const result = await pending;
  assert.equal(result.success, true);
  assert.equal(result.receipt.effect, 'applied');
  assert.equal(result.receipt.completion, 'completed');
  assert.notEqual(executeRequest.requestId, verifyRequest.requestId);
});

test('aborting a client tool call cancels the matching iframe request and clears the pending call', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  const controller = new AbortController();
  const pending = harness.bridge.handleClientToolCall({
    id: 'rpc-abort',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: {
      goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
    },
    executionContext: { logicalToolCallId: 'logical-abort' },
    requestConfirmation: async () => ({ approved: true }),
    signal: controller.signal,
  }) as Promise<Record<string, any>>;

  await harness.waitForRequests(2);
  const executeRequest = harness.requests[1]!;
  controller.abort();
  await harness.waitForRequests(3);
  const verifyRequest = harness.requests[2]!;
  assert.equal(verifyRequest.payload.executionContext.phase, 'verify');
  harness.emit('tool-result', {
    ok: true,
    result: { effect: 'unknown', completion: 'failed' },
  }, verifyRequest.requestId);
  const result = await pending;

  assert.deepEqual(harness.cancellations.map((request) => request.transportRequestId), [executeRequest.requestId]);
  assert.equal(result.resultStatus, 'unknown');
  assert.equal(result.receipt.effect, 'unknown');
});

test('new write baselines are blocked when live writes reach capacity', async (testContext) => {
  const harness = createBridgeHarness(testContext, { autoRespondExecute: false });
  for (let index = 0; index < 128; index += 1) {
    void (harness.bridge.handleClientToolCall({
      id: `rpc-write-${index}`,
      toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
      arguments: {
        goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
      },
      executionContext: { logicalToolCallId: `logical-write-${index}` },
      requestConfirmation: async () => ({ approved: true }),
    }) as Promise<unknown>).catch(() => undefined);
  }
  const saturated = await harness.bridge.handleClientToolCall({
    id: 'rpc-write-over-capacity',
    toolName: RULE_EDITOR_ORCHESTRATE_GOAL_TOOL_ID,
    arguments: {
      goal: { flow: 'event', operations: [{ intent: 'event.forward', capabilityRef: 'platform.event.forward' }] },
    },
    executionContext: { logicalToolCallId: 'logical-write-over-capacity' },
    requestConfirmation: async () => ({ approved: true }),
  }) as Record<string, any>;
  assert.equal(saturated.code, 'rule_editor.write.capacity_exhausted');
  assert.equal(saturated.success, false);
  assert.equal(saturated.retryable, false);
  assert.equal(saturated.resultStatus, 'blocked');
  assert.equal(saturated.receipt.effect, 'not-applied');
  assert.equal(saturated.receipt.completion, 'blocked');
});
