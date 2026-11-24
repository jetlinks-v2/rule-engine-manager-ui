import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const directory = fileURLToPath(new URL('../tests', import.meta.url))
// 每个模块独立进程，隔离 SSR 全局状态并避开 node:test 的二进制 IPC 传输。
for (const file of readdirSync(directory).filter(name => /^metric.*\.test\.mjs$/.test(name)).sort()) {
  const result = spawnSync(process.execPath, [resolve(directory, file)], { stdio: 'inherit' })
  if (result.error) console.error(result.error)
  if (result.status !== 0) process.exitCode = 1
}
