import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// 使用真实的标识生成与公共迁移逻辑，只以内存 Storage 隔离浏览器持久化。
const { outputFiles } = await build({
  stdin: {
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    contents: `
      export * from './views/DashBoard/alarmDashboardStorage';
      export { readDashboardLayout } from '../../jetlinks-web-core/src/components/DashBoardCanvas/utils/layoutStorage';
      export { dashboardKinds, typeOf } from './visDashboard/AlarmCenter/dashboard.types';
    `,
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const { alarmDashboardStorageKeys, readDashboardLayout, dashboardKinds, typeOf } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
)
const scope = JSON.stringify(['user-1', '', '', 'project-1', '/api'])
const keys = alarmDashboardStorageKeys(scope, false, 'wide')
const layout = dashboardKinds.map((kind, index) => ({ i: typeOf(kind), x: index % 2 * 12, y: index * 10, w: 12, h: 8 }))
const serialized = JSON.stringify(layout)

function storageFixture(initial = {}, failures = {}) {
  const values = new Map(Object.entries(initial))
  const operations = []
  return {
    values, operations,
    getItem(key) {
      if (failures.read?.(key)) throw new Error('Storage unavailable')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      operations.push(['set', key])
      if (failures.write) throw new Error('Storage full')
      values.set(key, value)
    },
    removeItem(key) {
      operations.push(['remove', key])
      if (failures.remove) throw new Error('Storage read-only')
      values.delete(key)
    },
  }
}

test('new key has fixed-length scope digest and reconstructs the exact original key', () => {
  const digest = createHash('md5').update(JSON.stringify([scope, 'private'])).digest('hex')
  assert.equal(keys.key, `alarm-dashboard:v1:${digest}:wide`)
  assert.equal(keys.key.length, 56)
  const original = `alarm-center-dashboard-v1:${encodeURIComponent(scope)}:private:wide:${[...dashboardKinds].sort().join(',')}`
  assert.deepEqual(keys.legacyKeys, [original])
  assert(keys.key.length < original.length / 3)
  const large = alarmDashboardStorageKeys(JSON.stringify(['租户'.repeat(1000), '/api/' + 'x'.repeat(1000)]), false, 'wide')
  assert.equal(large.key.length, keys.key.length)
  assert.equal(alarmDashboardStorageKeys(scope, false, 'wide').key, keys.key)
})

test('account, all project identities, API, deployment and width remain isolated', () => {
  const identity = JSON.parse(scope)
  const variants = identity.map((_, index) => {
    const changed = [...identity]
    changed[index] = `different-${index}`
    return alarmDashboardStorageKeys(JSON.stringify(changed), false, 'wide').key
  })
  variants.push(keys.key, alarmDashboardStorageKeys(scope, true, 'wide').key)
  variants.push(...['medium', 'compact'].map(mode => alarmDashboardStorageKeys(scope, false, mode).key))
  assert.equal(new Set(variants).size, variants.length)
})

test('legacy layout coordinates and dimensions migrate before the original key is removed', () => {
  const storage = storageFixture({ [keys.legacyKeys[0]]: serialized, unrelated: 'keep' })
  assert.deepEqual(readDashboardLayout(storage, keys.key, keys.legacyKeys), layout)
  assert.equal(storage.getItem(keys.key), serialized)
  assert.equal(storage.getItem(keys.legacyKeys[0]), null)
  assert.equal(storage.getItem('unrelated'), 'keep')
  assert.deepEqual(storage.operations, [['set', keys.key], ['remove', keys.legacyKeys[0]]])
})

test('existing new layout takes precedence over an older layout', () => {
  const newer = layout.map(item => ({ ...item, y: item.y + 20, h: 12 }))
  const storage = storageFixture({ [keys.key]: JSON.stringify(newer), [keys.legacyKeys[0]]: serialized })
  assert.deepEqual(readDashboardLayout(storage, keys.key, keys.legacyKeys), newer)
  assert.equal(storage.getItem(keys.key), JSON.stringify(newer))
  assert(!storage.operations.some(([action]) => action === 'set'))
})

test('failed writes preserve the legacy key and still return the saved layout', () => {
  const storage = storageFixture({ [keys.legacyKeys[0]]: serialized }, { write: true })
  assert.deepEqual(readDashboardLayout(storage, keys.key, keys.legacyKeys), layout)
  assert.equal(storage.getItem(keys.legacyKeys[0]), serialized)
  assert.equal(storage.getItem(keys.key), null)
  assert(!storage.operations.some(([action]) => action === 'remove'))
})

test('malformed layouts and unavailable storage do not delete old entries', () => {
  for (const value of ['invalid json', '{}', '[]', '[{"i":"bad","x":"invalid","y":0,"w":12,"h":8}]']) {
    const storage = storageFixture({ [keys.legacyKeys[0]]: value })
    assert.equal(readDashboardLayout(storage, keys.key, keys.legacyKeys), undefined)
    assert.equal(storage.getItem(keys.legacyKeys[0]), value)
    assert.deepEqual(storage.operations, [])
  }
  const unavailable = storageFixture({}, { read: () => true })
  assert.equal(readDashboardLayout(unavailable, keys.key, keys.legacyKeys), undefined)
  assert.deepEqual(unavailable.operations, [])
})

test('failed old-key cleanup keeps the successfully migrated layout usable', () => {
  const storage = storageFixture({ [keys.legacyKeys[0]]: serialized }, { remove: true })
  assert.deepEqual(readDashboardLayout(storage, keys.key, keys.legacyKeys), layout)
  assert.equal(storage.getItem(keys.key), serialized)
  assert.equal(storage.getItem(keys.legacyKeys[0]), serialized)
})
