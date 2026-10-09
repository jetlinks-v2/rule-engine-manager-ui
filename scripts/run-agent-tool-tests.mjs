import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const coreSourceRoot = path.resolve(packageRoot, '../../jetlinks-web-core/src')
const coreAiChatRoot = path.join(coreSourceRoot, 'layout/components/AiChat')
const outputDirectory = await mkdtemp(path.join(tmpdir(), 'rule-editor-agent-tool-tests-'))
const outputFile = path.join(outputDirectory, 'toolRuntime.test.mjs')
const catalogOutputFile = path.join(outputDirectory, 'toolRuntimeCatalog.test.mjs')
const agentCatalogOutputFile = path.join(outputDirectory, 'agentToolCatalog.test.mjs')
const orchestrationOutputFile = path.join(outputDirectory, 'ruleEditorOrchestration.test.mjs')
const bridgeOutputFile = path.join(outputDirectory, 'ruleEditorAgentBridge.test.mjs')
const wireOutputFile = path.join(outputDirectory, 'ruleEditorClientToolWire.test.mjs')
const lifecycleTestFile = path.join(packageRoot, 'tests/ruleEditorAgentLifecycle.test.mjs')
const bridgeOnly = process.argv.includes('--bridge-only')
const exportClientToolFixture = process.argv.includes('--export-client-tool-fixture')
const wireOnly = exportClientToolFixture || process.argv.includes('--client-tool-fixture-only')
const harnessOptions = new Set(['--bridge-only', '--export-client-tool-fixture', '--client-tool-fixture-only'])
const testOptions = process.argv.slice(2).filter(option => !harnessOptions.has(option))

const resolveCore = (specifier) => {
  const target = path.join(coreSourceRoot, specifier.slice('@jetlinks-web-core/'.length))
  return [`${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')].find((candidate) => existsSync(candidate))
}

const runtimeMocks = {
  name: 'rule-editor-agent-tool-runtime-mocks',
  setup(buildApi) {
    buildApi.onResolve({
      filter: /^@jetlinks-web-core\/layout\/components\/AiChat\/clientTools$/,
    }, () => ({ path: 'clientTools', namespace: 'rule-editor-test' }))
    buildApi.onResolve({ filter: /^\.\/confirmOptions$/ }, () => ({
      path: 'confirmOptions',
      namespace: 'rule-editor-test',
    }))
    buildApi.onLoad({ filter: /^clientTools$/, namespace: 'rule-editor-test' }, () => ({
      loader: 'ts',
      contents: `
        export const defineAiClientToolContract = (definition) => {
          const outputs = definition.outputs || [];
          return {
            routing: {
              stages: ['execution'],
              resultDeliveries: ['inline'],
              ...definition.routing,
              produces: outputs.map(output => output.name),
              outputShapes: outputs.map(output => output.shape),
            },
            _meta: {
              resultBindings: outputs.map(output => ({
                name: output.name,
                path: output.path,
                shape: output.shape,
              })),
              clientToolContract: { version: 'ai-client-tool-contract/v1', outputs },
            },
          };
        };
        export const withAiClientToolContractEvidence = (result, contract, options) => {
          const outputBindings = options.outputs.map(output => {
            const declared = contract._meta.clientToolContract.outputs.find(item => item.name === output.name);
            return { ...output, shape: declared.shape, path: output.path || declared.path };
          });
          return {
            ...result,
            success: true,
            complete: options.complete,
            truncated: options.truncated,
            outputBindings,
            evidence: {
              contract: 'ai-client-tool-evidence/v1',
              ...options,
              outputBindings,
            },
          };
        };
        export const withAiClientToolEvidence = (result, options) => ({
          ...result,
          success: true,
          complete: options.requestSatisfied ?? options.complete,
          requestSatisfied: options.requestSatisfied ?? options.complete,
          truncated: options.truncated,
          evidence: { contract: 'ai-client-tool-evidence/v1', ...options },
        });
        export const createAiClientToolFailureResult = (options) => ({ success: false, ...options });
      `,
    }))
    buildApi.onLoad({ filter: /^confirmOptions$/, namespace: 'rule-editor-test' }, () => ({
      loader: 'ts',
      contents: `
        export const resolveRuleEditorConfirmOptions = () => false;
        export const resolveRuleEditorToolDisplayName = tool => tool.name || tool.id;
        export const resolveRuleEditorApplyConfirmationText = (args, preview) => ({
          title: args.targetState === 'configured' ? 'Confirm Partial Configuration' : 'Confirm Canvas Change',
          content: (preview ? '预检通过：' + preview.nodeCount + ' 个节点，' + preview.linkCount + ' 条连线。 ' : '')
            + (args.targetState === 'configured' ? 'Partial draft only.' : 'Apply draft.'),
        });
      `,
    }))
  },
}

const realCoreRuntime = {
  name: 'rule-editor-agent-tool-real-core-runtime',
  setup(buildApi) {
    buildApi.onResolve({
      filter: /^@jetlinks-web-core\/layout\/components\/AiChat\/clientTools$/,
    }, () => ({ path: 'clientTools', namespace: 'rule-editor-real-core' }))
    buildApi.onResolve({ filter: /^\.\/confirmOptions$/ }, () => ({
      path: 'confirmOptions',
      namespace: 'rule-editor-real-core',
    }))
    buildApi.onLoad({ filter: /^clientTools$/, namespace: 'rule-editor-real-core' }, () => ({
      loader: 'ts',
      resolveDir: coreAiChatRoot,
      contents: `
        export {
          defineAiClientToolContract,
          withAiClientToolContractEvidence,
        } from ${JSON.stringify(path.join(coreAiChatRoot, 'clientToolContract.ts'))};
        export {
          createAiClientToolFailureResult,
          withAiClientToolEvidence,
        } from ${JSON.stringify(path.join(coreAiChatRoot, 'clientToolResult.ts'))};
        export {
          createAiClientToolCatalogReport,
          createAiClientToolCatalogSnapshot,
        } from ${JSON.stringify(path.join(coreAiChatRoot, 'clientToolCatalog.ts'))};
        export {
          AI_CLIENT_TOOL_ROUTING_EXPAND_KEY,
          normalizeAiClientToolRoutingMetadata,
        } from ${JSON.stringify(path.join(coreAiChatRoot, 'clientToolRouting.ts'))};
      `,
    }))
    buildApi.onLoad({ filter: /^confirmOptions$/, namespace: 'rule-editor-real-core' }, () => ({
      loader: 'ts',
      contents: `
        export const resolveRuleEditorConfirmOptions = () => false;
        export const resolveRuleEditorToolDisplayName = tool => tool.name || tool.id;
        export const resolveRuleEditorApplyConfirmationText = (args, preview) => ({
          title: args.targetState === 'configured' ? 'Confirm Partial Configuration' : 'Confirm Canvas Change',
          content: (preview ? '预检通过：' + preview.nodeCount + ' 个节点，' + preview.linkCount + ' 条连线。 ' : '')
            + (args.targetState === 'configured' ? 'Partial draft only.' : 'Apply draft.'),
        });
      `,
    }))
  },
}

const agentCatalogRuntime = (mountLifecycle = false) => ({
  name: 'rule-editor-agent-tool-catalog-runtime',
  setup(buildApi) {
    if (mountLifecycle) {
      buildApi.onResolve({ filter: /^@jetlinks-web\/utils$/ }, (args) => (
        args.importer === path.join(packageRoot, 'views/Instance/RuleEditor/proposalLinks.ts')
          ? { path: 'proposal-notification', namespace: 'rule-editor-bridge-test' }
          : args.importer === path.join(packageRoot, 'views/Instance/RuleEditor/useRuleEditorActions.ts')
            ? { path: 'action-notification', namespace: 'rule-editor-bridge-test' }
          : undefined
      ))
      buildApi.onLoad({ filter: /^proposal-notification$/, namespace: 'rule-editor-bridge-test' }, () => ({
        loader: 'js',
        contents: `export const onlyMessage = () => {
          throw new Error('Unexpected proposal notification in bridge transport test')
        }`,
      }))
      buildApi.onLoad({ filter: /^action-notification$/, namespace: 'rule-editor-bridge-test' }, () => ({
        loader: 'js',
        contents: `export const onlyMessage = (message, type) => {
          const fixture = globalThis.__ruleEditorActionsTest
          if (!fixture) throw new Error('Unexpected editor action notification')
          fixture.messages.push({ message, type })
        }`,
      }))
      buildApi.onResolve({ filter: /^@jetlinks-web-core\/layout\/components\/AiChat\/routeCapabilityLoader$/ }, () => ({
        path: 'shared-provider-loader',
        namespace: 'rule-editor-bridge-test',
      }))
      buildApi.onLoad({ filter: /^shared-provider-loader$/, namespace: 'rule-editor-bridge-test' }, () => ({
        loader: 'js',
        contents: `export const loadHomeAgentCapabilityProviders = async () => {
          await globalThis.__ruleEditorSharedToolsTest?.load?.()
        }`,
      }))
    }
    buildApi.onResolve({ filter: /^@jetlinks-web-core\/locales$/ }, () => ({
      path: 'locales',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^@jetlinks-web\/core$/ }, () => ({
      path: 'jetlinks-web-core-request',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^vue$/ }, () => mountLifecycle
      ? { path: realpathSync(path.resolve(packageRoot, '../../node_modules/vue/dist/vue.runtime.esm-bundler.js')) }
      : { path: 'vue', namespace: 'rule-editor-agent-catalog' })
    buildApi.onResolve({ filter: /^vue-demi$/ }, () => ({
      path: 'vue',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^vue-router$/ }, () => ({
      path: 'router',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^@vueuse\/(core|shared)$/ }, () => ({
      path: 'vueuse',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^@jetlinks-web\/hooks$/ }, () => ({
      path: 'hooks',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({
      filter: /^@jetlinks-web-core\/layout\/components\/AiChat\/homeAgentCapabilities$/,
    }, () => ({
      path: 'home-agent-capabilities',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({
      filter: /^@jetlinks-web-core\/utils\/project-runtime$/,
    }, () => ({
      path: 'project-runtime',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^@jetlinks-web-core\/router$/ }, () => ({
      path: 'router',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^@theme-config$/ }, () => ({
      path: 'theme-config',
      namespace: 'rule-editor-agent-catalog',
    }))
    buildApi.onResolve({ filter: /^@rule-engine-manager-ui\// }, (args) => {
      const target = path.join(packageRoot, args.path.slice('@rule-engine-manager-ui/'.length))
      const resolved = [`${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]
        .find((candidate) => existsSync(candidate))
      return resolved ? { path: resolved } : undefined
    })
    buildApi.onResolve({ filter: /^@jetlinks-web-core\// }, (args) => {
      const resolved = resolveCore(args.path)
      return resolved ? { path: resolved } : undefined
    })
    buildApi.onLoad({
      filter: /[/\\]jetlinks-web-core[/\\]src[/\\]router[/\\]index\.ts$/,
    }, () => ({
      loader: 'js',
      contents: 'export default { push: async () => undefined, replace: async () => undefined }',
    }))
    buildApi.onLoad({ filter: /\.vue$/ }, () => ({
      loader: 'js',
      contents: 'export default {}',
    }))
    buildApi.onLoad({ filter: /^locales$/, namespace: 'rule-editor-agent-catalog' }, () => ({
      loader: 'js',
      contents: "export default { global: { locale: { value: 'zh-CN' }, t: (key) => key } }",
    }))
    buildApi.onLoad({
      filter: /^jetlinks-web-core-request$/,
      namespace: 'rule-editor-agent-catalog',
    }, () => ({
      loader: 'js',
      contents: `
        const unavailable = () => { throw new Error('Node catalog test transport is unavailable') }
        export const request = new Proxy({}, {
          get: (_target, method) => (...args) => {
            const handler = globalThis.__ruleEditorActionsTest?.request
            return handler ? handler(method, ...args) : unavailable()
          },
        })
      `,
    }))
    buildApi.onLoad({ filter: /^vue$/, namespace: 'rule-editor-agent-catalog' }, () => ({
      loader: 'js',
      contents: `
        const noop = () => undefined
        const box = (value) => ({ value })
        export const reactive = (value) => value
        export const shallowReactive = (value) => value
        export const ref = box
        export const shallowRef = box
        export const computed = (fn) => ({ get value() { return typeof fn === 'function' ? fn() : fn } })
        export const watch = noop
        export const watchEffect = noop
        export const readonly = (value) => value
        export const customRef = box
        export const getCurrentScope = noop
        export const onScopeDispose = noop
        export const effectScope = () => ({ run: (fn) => fn && fn(), stop: noop })
        export const getCurrentInstance = noop
        export const provide = noop
        export const inject = noop
        export const isVue3 = true
        export const isVue2 = false
        export const version = '3.5.25'
        export const isRef = () => false
        export const unref = (value) => value && typeof value === 'object' && 'value' in value ? value.value : value
        export const toRefs = (value) => value
        export const toRef = box
        export const onBeforeMount = noop
        export const nextTick = async (fn) => fn && fn()
        export const onBeforeUnmount = noop
        export const onMounted = ${mountLifecycle ? '(callback) => callback()' : 'noop'}
        export const onUnmounted = noop
        export const isReactive = () => false
        export const defineComponent = (value) => value
        export const h = noop
        export const set = noop
        export default {}
      `,
    }))
    buildApi.onLoad({ filter: /^vueuse$/, namespace: 'rule-editor-agent-catalog' }, () => ({
      loader: 'js',
      contents: 'export const useLocalStorage = () => ({ value: undefined })',
    }))
    buildApi.onLoad({ filter: /^hooks$/, namespace: 'rule-editor-agent-catalog' }, () => ({
      loader: 'js',
      contents: 'export const usePermission = () => ({})',
    }))
    buildApi.onLoad({ filter: /^router$/, namespace: 'rule-editor-agent-catalog' }, () => ({
      loader: 'js',
      contents: 'export default { push: async () => undefined, replace: async () => undefined }',
    }))
    buildApi.onLoad({ filter: /^theme-config$/, namespace: 'rule-editor-agent-catalog' }, () => ({
      loader: 'js',
      contents: 'export default {}',
    }))
    buildApi.onLoad({
      filter: /^home-agent-capabilities$/,
      namespace: 'rule-editor-agent-catalog',
    }, () => ({
      loader: 'js',
      contents: `
        export const registerHomeAgentCapabilityProvider = () => undefined
        export const createHomeAgentContinuationReceipt = (value) => value
        export const HOME_AGENT_CAPABILITY_CHANGE_EVENT = 'jetlinks-home-agent-capability-change'
        export const createHomeAgentRuntime = (options) => globalThis.__ruleEditorSharedToolsTest?.createRuntime(options) || {
          clientTools: [], dispose() {}, handleClientToolCall() { throw new Error('No shared provider') }
        }
      `,
    }))
    buildApi.onLoad({
      filter: /^project-runtime$/,
      namespace: 'rule-editor-agent-catalog',
    }, () => ({
      loader: 'js',
      contents: "export const getProjectIdFromLocation = () => ''",
    }))
  },
})

try {
  for (const [entryPoint, outfile, runtime] of (wireOnly ? [] : [
    ['tests/toolRuntime.test.ts', outputFile, runtimeMocks],
    ['tests/toolRuntimeCatalog.test.ts', catalogOutputFile, realCoreRuntime],
  ])) {
    await build({
      entryPoints: [path.join(packageRoot, entryPoint)],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      sourcemap: 'inline',
      logLevel: 'warning',
      plugins: [runtime],
    })
  }
  for (const [entryPoint, outfile, mountLifecycle] of [
    ['tests/agentToolCatalog.test.ts', agentCatalogOutputFile, false],
    ['tests/ruleEditorOrchestration.test.ts', orchestrationOutputFile, false],
    ['tests/ruleEditorAgentBridge.test.ts', bridgeOutputFile, true],
    ['tests/ruleEditorClientToolWire.test.ts', wireOutputFile, false],
  ].filter(([, outfile]) => !wireOnly || outfile === wireOutputFile)) {
    await build({
      entryPoints: [path.join(packageRoot, entryPoint)],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      sourcemap: 'inline',
      logLevel: 'warning',
      banner: {
        js: 'globalThis.window = globalThis.window || globalThis; globalThis.document = globalThis.document || { createElement() { return {} }, querySelector() { return null }, addEventListener() {} };',
      },
      define: {
        'import.meta.env.BASE_URL': JSON.stringify('/'),
        'import.meta.env.VITE_APP_BASE_API': JSON.stringify('/api'),
        'import.meta.env.VITE_APP_ENVIRONMENT': JSON.stringify(''),
        'import.meta.env.VITE_APP_NAME': JSON.stringify('iot'),
        'import.meta.env.VITE_APP_PROJECT_CODE': JSON.stringify(''),
        'import.meta.env.VITE_APP_RUNTIME_SCOPE': JSON.stringify('auto'),
        'import.meta.env.VITE_MICRO_APP': JSON.stringify('false'),
        'import.meta.env.VITE_PERSONAL_TOKEN_AI_KEY': JSON.stringify('personal_token'),
        'import.meta.env.VITE_PERSONAL_TOKEN_KEY': JSON.stringify('X-Personal-Token'),
        'import.meta.env.VITE_PERSONAL_TOKEN_URL_KEY': JSON.stringify(':X_Personal_Token'),
        'import.meta.env.VITE_STORE_TOKEN_KEY': JSON.stringify('X-Access-Token'),
        'import.meta.env.VITE_TOKEN_KEY': JSON.stringify('X-Access-Token'),
        'import.meta.env.VITE_TOKEN_KEY_URL': JSON.stringify(':X_Access_Token'),
        'import.meta.env.MODE': JSON.stringify('test'),
        'import.meta.env.DEV': 'false',
        'import.meta.env.PROD': 'true',
      },
      plugins: [agentCatalogRuntime(mountLifecycle)],
    })
  }
  const result = bridgeOnly || wireOnly ? { status: 0 } : spawnSync(process.execPath, [
    '--test',
    '--experimental-test-coverage',
    '--test-coverage-lines=90',
    '--test-coverage-branches=85',
    '--test-coverage-functions=90',
    outputFile,
  ], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  const catalogResult = spawnSync(process.execPath, [
    '--test',
    ...testOptions,
    ...(wireOnly ? [wireOutputFile] : [
      ...(bridgeOnly ? [] : [catalogOutputFile, agentCatalogOutputFile, orchestrationOutputFile, wireOutputFile]),
      bridgeOutputFile,
      lifecycleTestFile,
    ]),
  ], {
    cwd: packageRoot,
    env: {
      ...process.env,
      RULE_EDITOR_EXPORT_CLIENT_TOOL_FIXTURE: exportClientToolFixture ? '1' : '0',
    },
    encoding: 'utf8',
    stdio: 'inherit',
  })
  process.exitCode = result.status || catalogResult.status || 0
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
