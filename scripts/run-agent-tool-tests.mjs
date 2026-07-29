import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = await mkdtemp(path.join(tmpdir(), 'rule-editor-agent-tool-tests-'))
const outputFile = path.join(outputDirectory, 'toolRuntime.test.mjs')

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
        export const createAiClientToolFailureResult = (options) => ({ success: false, ...options });
      `,
    }))
    buildApi.onLoad({ filter: /^confirmOptions$/, namespace: 'rule-editor-test' }, () => ({
      loader: 'ts',
      contents: `
        export const resolveRuleEditorConfirmOptions = () => false;
        export const resolveRuleEditorToolDisplayName = tool => tool.name || tool.id;
      `,
    }))
  },
}

try {
  await build({
    entryPoints: [path.join(packageRoot, 'tests/toolRuntime.test.ts')],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
    logLevel: 'warning',
    plugins: [runtimeMocks],
  })
  const result = spawnSync(process.execPath, [
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
  process.exitCode = result.status ?? 1
} finally {
  await rm(outputDirectory, { recursive: true, force: true })
}
