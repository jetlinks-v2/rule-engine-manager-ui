import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createRequire } from 'node:module'
import { effectScope, nextTick } from 'vue'
import ts from 'typescript'

const require = createRequire(import.meta.url), exports = {}
const code = ts.transpileModule(readFileSync(new URL('../views/Scene/Save/components/ShakeLimit/useShakeLimit.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'exports', code)(require, exports)

test('debounce keeps existing defaults and emits complete unchanged backend fields', async () => {
  const scope = effectScope(), emitted = []
  try {
    const initial = { enabled: true, time: 30, threshold: 3, alarmFirst: true, outputFirst: true, continuous: false, rolling: true }
    const { shakeLimit } = scope.run(() => exports.useShakeLimit(initial, value => emitted.push(value), key => key))
    assert.deepEqual({ ...shakeLimit }, initial)
    await nextTick(); assert.equal(emitted.length, 0)
    shakeLimit.time = 60; await nextTick()
    assert.deepEqual(emitted[0], { ...initial, time: 60 })
    assert.equal(initial.time, 30)
    shakeLimit.enabled = false; await nextTick()
    assert.equal(shakeLimit.threshold, 3)
    assert.equal(shakeLimit.outputFirst, true)
  } finally { scope.stop() }
})

test('delayed debounce ends on the window boundary and disabled empty settings remain valid', async () => {
  const scope = effectScope()
  try {
    const { shakeLimit, setAlarmFirst, validator } = scope.run(() => exports.useShakeLimit({}, () => {}, key => key))
    setAlarmFirst(false)
    assert.equal(shakeLimit.alarmFirst, false)
    assert.equal(shakeLimit.rolling, false)
    setAlarmFirst(true)
    assert.equal(shakeLimit.rolling, false)
    shakeLimit.time = null
    await validator()
    shakeLimit.enabled = true
    await assert.rejects(validator())
    shakeLimit.time = 10
    await validator()
    shakeLimit.threshold = null
    await assert.rejects(validator())
  } finally { scope.stop() }
})
