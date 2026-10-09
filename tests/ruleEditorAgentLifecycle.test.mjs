import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(
  path.join(packageRoot, 'views/Instance/RuleEditor/index.vue'),
  'utf8',
)
const profileSource = readFileSync(
  path.join(packageRoot, 'views/Instance/RuleEditor/ruleEditorAgentProfile.ts'),
  'utf8',
)

test('rule editor reserves its page assistant before resetting the iframe bridge', () => {
  const openBranch = source.indexOf('if (visible && ruleId.value) {')
  const prepare = source.indexOf('prepareRuleEditorAgent();', openBranch)
  const reset = source.indexOf('bridge.reset();', openBranch)

  assert.ok(openBranch >= 0)
  assert.ok(prepare > openBranch)
  assert.ok(reset > prepare)
  assert.match(source, /prepareAgentConversation\(RULE_EDITOR_CLIENT_ID,\s*\{[\s\S]*?subjectId: ruleId\.value/)
})

test('rule editor queries after bridge readiness and releases pending or active ownership', () => {
  assert.match(source, /!bridge\.ready\.value/)
  assert.match(source, /queryAgent\(RULE_EDITOR_CLIENT_ID, parameters\)/)
  assert.equal(
    source.match(/releaseAgentConversation\(RULE_EDITOR_CLIENT_ID\)/g)?.length,
    2,
  )
  assert.doesNotMatch(source, /hideAiButton\(\)/)
})

test('rule editor appends a generic current-turn admission without copying user content', () => {
  assert.match(source, /beforeSendChat:\s*appendRuleEditorTurnAdmission/)
  assert.match(profileSource, /if \(!String\(payload\.content \|\| ''\)\.trim\(\)\) return/)
  assert.match(profileSource, /payload\.systemPromptAppend,[\s\S]*?RULE_EDITOR_TURN_ADMISSION_PROMPT/)
  assert.match(profileSource, /当前非空用户消息就是业务目标/)
  assert.match(profileSource, /去向未明确且影响业务结果时，先询问一个必要业务问题/)
  assert.match(profileSource, /实现事实由适用的规则编排工具补齐/)
  assert.doesNotMatch(profileSource, /\$\{\s*payload\.content\s*\}/)
})
