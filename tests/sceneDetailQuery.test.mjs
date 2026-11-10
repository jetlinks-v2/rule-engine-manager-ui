import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// 只替换 HTTP 边界，实际执行生产 API 函数，验证路径、筛选分页和原响应的透传。
const { outputFiles } = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    contents: `
      export { queryScenes, getSceneDetail } from './api/scene-linkage';
      export { query as queryOrdinaryScenes } from './api/scene';
    `,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'scene-query-http-boundary',
    setup(builder) {
      builder.onResolve({ filter: /^@jetlinks-web\/core$/ }, () => ({ path: 'http', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const request = {
          post: (...args) => globalThis.sceneQueryHttp.post(...args),
          get: (...args) => globalThis.sceneQueryHttp.get(...args),
        };
      ` }))
    },
  }],
})
const api = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))

test('scene list queries the detail endpoint and preserves filters, pagination and nested runtime metrics', async () => {
  const params = { pageIndex: 2, pageSize: 100, sorts: [{ name: 'createTime', order: 'desc' }],
    terms: [{ column: 'name', termType: 'like', value: '%场景%' }] }
  const response = { status: 200, result: { total: 205, pageIndex: 2, pageSize: 100,
    data: [{ id: 'scene-1', runtimeInfo: { sceneId: 'scene-1', executionCount: 12, errorCount: 2, lastExecutionTime: 1790000000000 } }] } }
  globalThis.sceneQueryHttp = { post: async (url, data) => {
    assert.equal(url, '/scene/detail/_query')
    assert.equal(data, params)
    return response
  } }
  assert.equal(await api.queryScenes(params), response)
})

test('ordinary scene queries and editor detail retain their existing endpoints', async () => {
  const calls = []
  globalThis.sceneQueryHttp = {
    post: async (...args) => { calls.push(['post', ...args]); return { result: [] } },
    get: async (...args) => { calls.push(['get', ...args]); return { result: { id: 'scene-1' } } },
  }
  const params = { paging: false }
  await api.queryOrdinaryScenes(params)
  await api.getSceneDetail('scene-1')
  assert.deepEqual(calls, [['post', '/scene/_query/', params], ['get', '/scene/scene-1']])
})

test('detail query errors reach the existing list error handler', async () => {
  const error = new Error('统计查询失败')
  globalThis.sceneQueryHttp = { post: async () => { throw error } }
  await assert.rejects(api.queryScenes({ pageIndex: 0 }), failure => failure === error)
})
