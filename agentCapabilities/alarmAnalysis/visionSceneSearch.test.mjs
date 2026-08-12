import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const tempDir = await mkdtemp(join(tmpdir(), 'alarm-vision-scene-search-'))
const outputFile = join(tempDir, 'visionSceneSearch.mjs')

try {
  await build({
    entryPoints: [fileURLToPath(new URL('./visionSceneSearch.ts', import.meta.url))],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    plugins: [{
      name: 'domain-agent-search-mock',
      setup(buildApi) {
        buildApi.onResolve({
          filter: /^@jetlinks-web-core\/layout\/components\/AiChat\/domainAgentTools$/,
        }, () => ({ path: 'domainAgentTools', namespace: 'alarm-agent-test' }))
        buildApi.onLoad({ filter: /.*/, namespace: 'alarm-agent-test' }, () => ({
          loader: 'js',
          contents: `
            export const searchDomainAgentItems = (items, query, keywords, limit) => ({
              data: items.filter(item => keywords(item).some(value => String(value || '').includes(query))).slice(0, limit),
            });
          `,
        }))
      },
    }],
  })

  const { normalizeVisionAlarmScenes, searchVisionAlarmScenes } = await import(`file://${outputFile}`)
  const scenes = normalizeVisionAlarmScenes([
    {
      id: 'helmet-scene',
      name: '未戴安全帽',
      description: '识别作业区域内未正确佩戴安全帽的人员',
      taskTargetDetails: [
        { value: 'helmet-missing', text: '安全帽缺失', description: '人员未佩戴安全帽' },
      ],
    },
    {
      id: 'smoking-scene',
      name: '吸烟检测',
      children: [
        { value: 'smoking', text: '人员吸烟' },
      ],
    },
    {
      id: 'vehicle-scene',
      name: '车辆违停',
      taskTargetDetails: [
        { value: 'vehicle-parking', text: '车辆违停' },
      ],
    },
    { name: '缺少真实 ID 的场景' },
  ])

  assert.equal(scenes.length, 3)
  assert.deepEqual(scenes[0].targets[0], {
    algorithmId: 'helmet-missing',
    name: '安全帽缺失',
    description: '人员未佩戴安全帽',
  })
  assert.equal(searchVisionAlarmScenes(scenes, '安全冒')[0].sceneId, 'helmet-scene')
  assert.equal(searchVisionAlarmScenes(scenes, '抽烟')[0].sceneId, 'smoking-scene')
  assert.deepEqual(searchVisionAlarmScenes(scenes, '穿黑色衣服'), [])
  assert.deepEqual(searchVisionAlarmScenes(scenes, ''), scenes)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
