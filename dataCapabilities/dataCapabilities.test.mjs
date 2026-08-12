import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const DEVICE_IDS = [
  'alarm.device.summary',
  'alarm.device.active.ids',
  'alarm.device.rank',
  'alarm.device.list',
]

const VISION_IDS = [
  'alarm.vision.summary',
  'alarm.vision.trend',
  'alarm.vision.type.distribution',
  'alarm.vision.level.distribution',
  'alarm.vision.scene.distribution',
  'alarm.vision.scene.rank',
  'alarm.vision.list',
  'alarm.vision.level.trend',
  'alarm.vision.handling.trend',
  'alarm.vision.channel.rank',
  'alarm.vision.ai-review.summary',
  'alarm.event.summary',
  'alarm.event.list',
]

const tempDir = await mkdtemp(join(tmpdir(), 'alarm-data-capabilities-'))

try {
  const deviceProvider = await loadProvider('deviceAlarmProvider.ts')
  const visionProvider = await loadProvider('visionAlarmProvider.ts')

  assertProvider(deviceProvider, 'alarm:device-monitoring', DEVICE_IDS)
  assertProvider(visionProvider, 'alarm:vision-monitoring', VISION_IDS)
  const deviceSources = new Map(deviceProvider.load().sources.map(source => [source.id, source]))
  const visionSources = new Map(visionProvider.load().sources.map(source => [source.id, source]))
  const outputTitleKeys = new Set()
  for (const source of [...deviceSources.values(), ...visionSources.values()]) {
    assertOutputSchema(source.outputSchema, source.id, outputTitleKeys)
  }
  await assertOutputLocales(outputTitleKeys)
  assert.deepEqual(
    deviceSources.get('alarm.device.list')?.filterSchema?.properties?.deviceId?.filter?.operators,
    ['in', 'notIn'],
  )
  assert.deepEqual(
    visionSources.get('alarm.vision.level.trend')?.filterSchema?.properties?.timeRange?.filter?.operators,
    ['between'],
  )
  assert.equal(
    deviceSources.get('alarm.device.list')?.outputSchema?.items?.properties?.deviceName?.title,
    'AlarmDataCapability.output.deviceName',
  )
  assert.equal(
    visionSources.get('alarm.vision.level.trend')?.outputSchema?.items?.properties?.count?.title,
    'VisionAlarmDataCapability.output.count',
  )

  const registerText = await readFile(
    fileURLToPath(new URL('../register.ts', import.meta.url)),
    'utf8',
  )
  for (const capabilityId of [...DEVICE_IDS, ...VISION_IDS]) {
    assert.match(registerText, new RegExp(`['"]${escapeRegExp(capabilityId)}['"]`))
  }
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function loadProvider(fileName) {
  const outputFile = join(tempDir, `${fileName}.mjs`)
  await build({
    entryPoints: [fileURLToPath(new URL(fileName, import.meta.url))],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    plugins: [{
      name: 'alarm-data-capability-runtime-mocks',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^@jetlinks-web\/core$/ }, () => ({
          path: 'jetlinks-web-core',
          namespace: 'alarm-data-capability-test',
        }))
        buildApi.onResolve({ filter: /^@jetlinks-web-core\/locales$/ }, () => ({
          path: 'jetlinks-web-core-locales',
          namespace: 'alarm-data-capability-test',
        }))
        buildApi.onResolve({ filter: /^@jetlinks-web-core\/utils\/consts$/ }, () => ({
          path: 'jetlinks-web-core-consts',
          namespace: 'alarm-data-capability-test',
        }))
        buildApi.onLoad({ filter: /^jetlinks-web-core$/, namespace: 'alarm-data-capability-test' }, () => ({
          loader: 'js',
          contents: 'export const request = { get() {}, post() {} };',
        }))
        buildApi.onLoad({ filter: /^jetlinks-web-core-locales$/, namespace: 'alarm-data-capability-test' }, () => ({
          loader: 'js',
          contents: 'export default { global: { t: (key) => key } };',
        }))
        buildApi.onLoad({ filter: /^jetlinks-web-core-consts$/, namespace: 'alarm-data-capability-test' }, () => ({
          loader: 'js',
          contents: 'export const langKey = "language";',
        }))
      },
    }],
  })
  return (await import(pathToFileURL(outputFile).href)).default
}

function assertProvider(provider, providerId, capabilityIds) {
  assert.equal(provider.id, providerId)
  assert.deepEqual(provider.owner, {
    moduleId: 'rule-engine-manager-ui',
    providerId,
  })
  assert.deepEqual(provider.capabilityIds, capabilityIds)
  assert.deepEqual(provider.load().sources.map(source => source.id), capabilityIds)
}

function assertOutputSchema(schema, sourceId, titleKeys) {
  assert.ok(schema, `${sourceId} must declare an output schema`)
  if (schema.type === 'array') {
    assertOutputTitle(schema, `${sourceId} output`, titleKeys)
    assert.ok(schema.items, `${sourceId} array output must declare item schema`)
    if (schema.items.type === 'object') {
      assertObjectProperties(schema.items, `${sourceId}[]`, titleKeys)
    }
    return
  }
  if (schema.type === 'object') {
    assertObjectProperties(schema, sourceId, titleKeys)
  }
}

function assertObjectProperties(schema, path, titleKeys) {
  const entries = Object.entries(schema.properties || {})
  assert.ok(entries.length, `${path} object output must declare properties`)
  for (const [field, property] of entries) {
    const fieldPath = `${path}.${field}`
    assertOutputTitle(property, fieldPath, titleKeys)
    if (property.type === 'object') {
      assertObjectProperties(property, fieldPath, titleKeys)
    } else if (property.type === 'array' && property.items?.type === 'object') {
      assertObjectProperties(property.items, `${fieldPath}[]`, titleKeys)
    }
  }
}

function assertOutputTitle(schema, path, titleKeys) {
  assert.equal(typeof schema.title, 'string', `${path} must declare an i18n title`)
  assert.match(
    schema.title,
    /^(AlarmDataCapability|VisionAlarmDataCapability)\.output\./,
    `${path} title must use the owning module i18n key`,
  )
  titleKeys.add(schema.title)
}

async function assertOutputLocales(titleKeys) {
  const [zh, en] = await Promise.all([
    readJson(new URL('../locales/lang/zh.json', import.meta.url)),
    readJson(new URL('../locales/lang/en.json', import.meta.url)),
  ])
  for (const key of titleKeys) {
    assert.equal(typeof zh[key], 'string', `${key} is missing from zh.json`)
    assert.match(zh[key], /[\u3400-\u9fff]/, `${key} must provide a Chinese field name`)
    assert.equal(typeof en[key], 'string', `${key} is missing from en.json`)
    assert.ok(en[key].trim(), `${key} must provide an English field name`)
  }
}

async function readJson(url) {
  return JSON.parse(await readFile(fileURLToPath(url), 'utf8'))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
