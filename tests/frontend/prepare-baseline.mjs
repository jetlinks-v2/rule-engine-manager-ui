import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const uiRoot = path.resolve(moduleRoot, '../..')
const output = process.env.SCENE_TEST_OUTPUT || path.join(moduleRoot, 'target/scene-frontend')
const sourceRoot = process.env.SCENE_BASELINE_ROOT || path.join(output, 'baseline-2.12')
const commit = '52399af70af89a337398a3cadc9258eff99c3568'
// git archive 固定源码快照，不切分支，也不读入当前未提交的业务改动。
execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: moduleRoot })
await mkdir(sourceRoot, { recursive: true })
const archive = path.join(output, 'baseline-2.12.tar')
execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, commit], { cwd: moduleRoot })
execFileSync(
  process.env.SCENE_PYTHON || 'python',
  [
    '-X',
    'utf8',
    '-c',
    'import sys, tarfile; archive = tarfile.open(sys.argv[1], encoding="utf-8"); archive.extractall(sys.argv[2], filter="data")',
    archive,
    sourceRoot,
  ],
  { stdio: 'inherit' },
)
const config = path.join(sourceRoot, 'tsconfig.json')
// 只接入宿主 TypeScript 配置；场景业务源码保持固定提交原样。
const source = await readFile(config, 'utf8')
await writeFile(
  config,
  source.replace(
    /"extends"\s*:\s*"[^"\n]+"/,
    '"extends": ' + JSON.stringify(path.join(uiRoot, 'tsconfig.base.json').replaceAll('\\', '/')),
  ),
  'utf8',
)
await writeFile(
  path.join(output, 'baseline-source.json'),
  JSON.stringify({ commit, sourceRoot, hostUiRoot: uiRoot, adapter: 'tsconfig.extends only' }, null, 2),
  'utf8',
)
console.log(`Prepared ${commit}: ${sourceRoot}`)
