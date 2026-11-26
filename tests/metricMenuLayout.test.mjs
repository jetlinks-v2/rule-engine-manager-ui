import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'
import { resolve } from 'node:path'
import { sourceRoot } from './helpers/metricRuntime.mjs'
const load = createMetricLoader()
const { mergeModuleMenuCatalog, reconcileAuthorizedMenuLayout } = load('utils/module-menu-layout.ts')
const parent = { code: 'rule-engine', id: 'stable-rule-parent', name: 'Rules and calculations', owner: 'iot', url: '/rule-engine', buttons: [{ id: 'grant' }], permissions: ['must-not-copy'] }
const leaf = { code: 'device/MetricTemplate', id: 'template', name: 'Templates', url: '/old/template', owner: 'iot', options: { routeTarget: 'rule-engine' } }
const catalog = [{ code: 'device', id: 'devices', name: 'Devices', url: '/devices', children: [leaf] }, { ...parent, children: [{ code: 'device/Metrics', id: 'metrics', name: 'Metrics', url: '/metrics' }] }]

test('仅重定位已有授权叶子，保留权限/ID，不引入catalog叶子或父权限', () => {
  const owned = { ...leaf, id: 'existing-id', name: 'Custom template title', options: {}, buttons: [{ id: 'view', permissions: ['query'] }], permissions: ['owned'] }
  const input = [{ code: 'device', name: 'Devices', url: '/devices', owner: 'iot', children: [owned] }]
  const result = reconcileAuthorizedMenuLayout(input, catalog)
  const group = result.menus.find(item => item.code === parent.code)
  assert.equal(group.id, parent.id)
  assert.deepEqual(group.buttons, [])
  assert.equal(group.permissions, undefined)
  const moved = group.children[0]
  assert.equal(moved.id, owned.id)
  assert.equal(moved.name, owned.name)
  assert.deepEqual(moved.buttons, owned.buttons)
  assert.deepEqual(moved.permissions, owned.permissions)
  assert.equal(JSON.stringify(result.menus).includes('device/Metrics'), false)
  assert.deepEqual(input[0].children, [owned])
  assert.equal(reconcileAuthorizedMenuLayout([], catalog).menus.length, 0)
})

test('同owner+code父组仅合并一次，未安装/空声明/ID碰撞不制造空壳', () => {
  const merged = mergeModuleMenuCatalog([{ ...parent, buttons: [], children: [leaf] }, { ...parent, buttons: [], children: [{ ...leaf, code: 'device/Metrics' }] }])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].children.length, 2)
  const owned = [{ ...leaf, options: {} }]
  assert.deepEqual(JSON.parse(JSON.stringify(reconcileAuthorizedMenuLayout(owned, []).menus)), owned)
  const collision = reconcileAuthorizedMenuLayout([...owned, { code: 'other', id: parent.id, name: 'Other', url: '/other' }], catalog)
  assert.equal(collision.issues[0].type, 'id-collision')
  assert.equal(collision.menus.some(item => item.code === parent.code), false)
  const wrongOwner = reconcileAuthorizedMenuLayout([{ ...leaf, owner: 'app', options: {} }], catalog)
  assert.equal(wrongOwner.menus.some(item => item.code === parent.code), false)
  const inheritedCollision = reconcileAuthorizedMenuLayout([...owned, { code: 'app', name: 'App', owner: 'app', url: '/app', children: [{ ...parent, owner: undefined, children: [] }] }], catalog)
  assert.ok(inheritedCollision.issues.some(issue => issue.type === 'id-collision'))
  assert.equal(inheritedCollision.menus.some(item => item.owner === 'iot' && item.code === parent.code), false)
})

test('循环重定位声明保持原位，不从未授权catalog构造祖先链', () => {
  const cyclic = [{ ...parent, options: { routeTarget: leaf.code }, children: [leaf] }]
  const result = reconcileAuthorizedMenuLayout(cyclic, cyclic)
  assert.ok(result.issues.some(issue => issue.type === 'circular-target'))
  assert.equal(result.menus[0].code, parent.code)
  assert.equal(result.menus[0].children[0].code, leaf.code)
})

test('继承owner与显式owner合并；本轮合成父壳也参与ID碰撞检测', () => {
  const merged = mergeModuleMenuCatalog([{ ...parent, children: [{ ...leaf, owner: undefined }] }, { ...parent, children: [leaf] }])
  assert.equal(merged[0].children.length, 1)
  const other = { ...parent, code: 'other-parent', children: [{ ...leaf, code: 'other-leaf', options: { routeTarget: 'other-parent' } }] }
  const result = reconcileAuthorizedMenuLayout([{ ...leaf, options: {} }, { ...other.children[0], options: {} }], [...catalog, other])
  assert.equal(result.menus.filter(item => item.id === parent.id).length, 1)
  assert.ok(result.issues.some(issue => issue.type === 'id-collision' && issue.sourceCode === 'other-leaf'))
})

test('只替换旧默认分组名，保留租户自定义分组名及跨owner同code节点', () => {
  const declaration = { ...parent, options: { previousNames: ['规则引擎', 'Rule Engine'] }, children: [leaf] }
  const defaults = reconcileAuthorizedMenuLayout([{ ...declaration, name: '规则引擎' }], [declaration])
  assert.equal(defaults.menus[0].name, parent.name)
  const custom = reconcileAuthorizedMenuLayout([{ ...declaration, name: 'Tenant title' }], [declaration])
  assert.equal(custom.menus[0].name, 'Tenant title')
  const result = reconcileAuthorizedMenuLayout([{ ...leaf, options: {} }, { ...parent, id: 'app-parent', owner: 'app', children: [] }], catalog)
  assert.equal((result.menus.find(item => item.owner === 'app').children || []).length, 0)
  assert.equal(result.menus.find(item => item.owner === 'iot').children[0].id, leaf.id)
})

test('现有初始化入口读取已安装模块合并菜单，既有更新API才显式写入新授权叶子', async () => {
  const patches = []
  const pipeline = createMetricLoader({
    __metricGlob: pattern => pattern.endsWith('/index.ts') ? {
      '../../../modules/metrics/index.ts': { default: { priority: 1, filter: false } },
      '../../../modules/rules/index.ts': { default: { priority: 2, filter: false } },
    } : {
      '../../../modules/metrics/baseMenu.ts': { default: [{ ...parent, children: [{ ...leaf, owner: undefined }] }] },
      '../../../modules/rules/baseMenu.ts': { default: () => ({ ...parent, children: [{ ...leaf, owner: 'iot' }, { ...leaf, code: 'device/Metrics' }] }) },
    },
    [resolve(sourceRoot, 'views/init-home/data/baseMenu.ts')]: { __esModule: true, default: [] },
    '@jetlinks-web/core': { request: { patch: async (...args) => patches.push(args) } },
  })
  const { getModulesMenu } = pipeline('utils/modules.ts')
  assert.equal(getModulesMenu().length, 1)
  assert.equal(getModulesMenu()[0].children.length, 2)
  const baseMenu = pipeline('views/init-home/data/index.ts').default()
  assert.equal(baseMenu.length, 1)
  assert.equal(baseMenu[0].children.length, 2)
  const { updateMenus } = pipeline('api/initHome.ts')
  await updateMenus(baseMenu, 'iot')
  assert.equal(patches[0][0], '/menu/iot/_all')
  assert.equal(patches[0][1][0].children.length, 2)
  assert.equal(reconcileAuthorizedMenuLayout([], getModulesMenu()).menus.length, 0)
})
