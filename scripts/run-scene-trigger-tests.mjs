import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(path.join(tmpdir(), 'scene-trigger-tests-'))
try {
  const tests = ['sceneFrontendRoundtrip', 'sceneEditorMode', 'deviceVariables', 'sceneMultiTrigger', 'sceneNodeSummary', 'deviceScopeTree', 'triggerNodeSummary', 'collectorPoint', 'sceneNodePresentation', 'sceneRuntimeStatistics', 'sceneRulePreview', 'sceneListSummary', 'sceneTemplate', 'sceneAlarmTerms']
  await build({ entryPoints: tests.map(name => path.join(root, `tests/${name}.test.ts`)), outdir: directory, outExtension: { '.js': '.mjs' },
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    alias: { '@jetlinks-web/core': path.join(root, 'tests/sceneTestHttp.ts'), '@jetlinks-web-core/locales': path.join(root, 'tests/sceneTestLocale.ts'), '@jetlinks-web-core/locales/index': path.join(root, 'tests/sceneTestLocale.ts') },
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: true }) },
    banner: { js: 'globalThis.window = globalThis; globalThis.document = { createElement() { return {} }, querySelector() { return null }, addEventListener() {} }; globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} };' } })
  const result = spawnSync(process.execPath, ['--test', ...tests.map(name => path.join(directory, `${name}.test.mjs`))], { stdio: 'inherit', encoding: 'utf8' })
  process.exitCode = result.status ?? 1
} finally {
  await rm(directory, { recursive: true, force: true })
}
