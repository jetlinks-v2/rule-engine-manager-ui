import assert from 'node:assert/strict'
import test from 'node:test'
import { readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { platformSources, platformRoot, createMetricLoader } from './helpers/metricRuntime.mjs'

const { setupNamePlugin } = createMetricLoader()(resolve(platformRoot,'configs/plugin/setup-name.ts'))
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const metricRoot = resolve(root, 'components/Metric')
const collect = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(item => item.isDirectory() ? collect(resolve(directory, item.name)) : resolve(directory, item.name)))).flat()

test('指标SFC通过生产相同setup-name-support预编译及Vue插件链', async t => {
  const server = await createServer({
    configFile: false, root, logLevel: 'silent',
    plugins: [setupNamePlugin(), vue()],
    resolve: { alias: { '@jetlinks-web-core': platformSources, '@rule-engine-manager-ui':root } },
    server: { middlewareMode: true, preTransformRequests: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  try {
    for (const filename of (await collect(metricRoot)).filter(file => file.endsWith('.vue')).sort()) {
      await t.test(filename.slice(root.length + 1), async () => {
        const result = await server.transformRequest(`/${relative(root, filename)}`)
        assert.ok(result?.code.includes('export default'), 'Vue transform produced a component module')
        assert.equal(result.code.includes('defineProps<'), false, 'props macro was compiled')
      })
    }
  } finally { await server.close() }
})
