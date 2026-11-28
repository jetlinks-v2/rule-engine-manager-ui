import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { defineComponent, h, onScopeDispose, reactive, ref } from 'vue'
import { createMetricLoader, createMetricRenderer, flush, sourceRoot } from './helpers/metricRuntime.mjs'

test('the installed metric host owns source lifetime and restores only the matching object reference', async () => {
  let created = 0, closed = 0, panel, panelEmit
  const canOpen = ref(false), navigations = []
  const route = reactive({ query: { metricOwnerType: 'asset', metricOwnerId: 'a', metricConfigId: 'config', metricOutputId: 'output' } })
  const pickSource = async () => undefined
  const load = createMetricLoader({
    'vue-router': { useRoute: () => route },
    'vue-i18n': { useI18n: () => ({ t: key => key }) },
    '@jetlinks-web-core/store': { useAuthStore: () => ({ hasPermission: () => canOpen.value }), useMenuStore: () => ({ hasMenu: () => canOpen.value, jumpPage: (...args) => navigations.push(args) }) },
    [resolve(sourceRoot, 'components/Metric/service.ts')]: { errorText: cause => String(cause) },
    [resolve(sourceRoot, 'components/Metric/source-picker/useMetricSourceAdapter.ts')]: {
      useMetricSourceAdapter: () => { created++; onScopeDispose(() => closed++); return { pickSource, host: () => h('source-host') } }
    },
    [resolve(sourceRoot, 'components/Metric/collection/MetricScopePanel.vue')]: {
      __esModule: true,
      default: defineComponent({ props: ['context', 'pickSource', 'initialReference', 'detailLinkLabel'], emits: ['openDetailLink'], setup(props, { emit }) { panel = props; panelEmit = emit; return () => null } })
    }
  })
  const Host = load('components/Metric/collection/MetricScopeHost.vue').default
  const { renderer, root } = createMetricRenderer()
  const app = renderer.createApp(() => h(Host, { context: { ownerType: 'asset', ownerId: 'a' } }))
  app.mount(root)
  try {
    assert.equal(created, 1)
    assert.equal(panel.pickSource, pickSource)
    assert.deepEqual(panel.initialReference, { configId: 'config', outputId: 'output' })
    assert.equal(panel.detailLinkLabel, undefined)
    canOpen.value = true
    await flush()
    assert.equal(panel.detailLinkLabel, 'openWorkspace')
    panelEmit('openDetailLink', { ownerType: 'asset', ownerId: 'a', configId: 'config', outputId: 'output' })
    assert.deepEqual(navigations, [['rule-engine/Metric', { query: { projectId: undefined, metricOwnerType: 'asset', metricOwnerId: 'a', metricConfigId: 'config', metricOutputId: 'output' } }]])
    route.query.metricOwnerId = 'other'
    await flush()
    assert.equal(panel.initialReference, undefined)
  } finally { app.unmount() }
  assert.equal(closed, 1)
  const Scope = load('components/Metric/workspace/MetricWorkspaceScope.vue').default
  const workspace = renderer.createApp(() => h(Scope, {
    context: { ownerType: 'asset', ownerId: 'a' },
    provider: { ownerType: 'asset', label: 'Asset', navigator: {} }
  }))
  workspace.component('a-alert', () => null)
  workspace.mount(root)
  try {
    assert.equal(created, 2)
    assert.equal(panel.pickSource, pickSource)
  } finally { workspace.unmount() }
  assert.equal(closed, 2)
})
