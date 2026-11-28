import assert from 'node:assert/strict'
import test from 'node:test'
import { h, onMounted, ref, useSlots } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, walk } from './helpers/metricRuntime.mjs'

test('an optional registered component may be absent without mounting business code', async t => {
  // Match the host's Vue auto-import transform while executing the real RemoteComponent SFC.
  const autoImports = { h, onMounted, ref, useSlots }
  const previous = Object.fromEntries(Object.keys(autoImports).map(key => [key, globalThis[key]]))
  Object.assign(globalThis, autoImports)
  t.after(() => { for (const key of Object.keys(autoImports)) previous[key] === undefined ? delete globalThis[key] : globalThis[key] = previous[key] })
  let resource, mounts = 0
  const load = createMetricLoader({
    '@jetlinks-web-core/utils/module-registry': { moduleRegistry: { hasModule: () => !!resource, getResourceItem: () => resource } }
  })
  const Remote = load('components/RemoteComponent/index.vue').default
  for (const installed of [false, true]) {
    resource = installed ? { props: ['id'], setup(props) { mounts++; return () => h('business-panel', props) } } : undefined
    const { renderer, root } = createMetricRenderer()
    const app = renderer.createApp(() => h(Remote, { remoteName: 'optional', componentName: 'Panel', componentProps: { id: 'subject' } }))
    app.component('CloudEmpty', { props: ['description'], setup: props => () => h('missing-resource', props) })
    app.component('a-spin', () => null)
    app.mount(root)
    try {
      await flush()
      assert.equal(walk(root, node => node.type === 'missing-resource').length, installed ? 0 : 1)
      assert.equal(walk(root, node => node.type === 'business-panel').length, installed ? 1 : 0)
      assert.equal(mounts, installed ? 1 : 0)
    } finally { app.unmount() }
  }
})
