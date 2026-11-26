# 场景联动前端集成测试

本目录通过独立 Vite 宿主加载真实 Vue 场景编辑器、条件树、弹窗、API wrapper、列表和预览。只模拟 HTTP 数据以及登录、权限、导航、模块注册等宿主边界。模拟服务捕获真实保存请求，详情和列表读取同一份配置，不调用场景运行接口。

## 前提

- 当前 UI 工作区已安装 pnpm 依赖，Node 22 或更高。
- 本机 Chrome；其他位置可用 `SCENE_CHROME_PATH` 指定。
- Playwright 可安装在项目之外，避免改动工作区依赖和锁文件。
- 固定 2.12 提交 `52399af70af89a337398a3cadc9258eff99c3568` 在模块 Git 对象库中存在。准备脚本不会切分支或 fetch。
- 基线准备使用 Python 3.12+ 的 UTF-8 tar 提取。可用 `SCENE_PYTHON` 指定可执行文件。

以下命令在 UI 根目录执行，路径变量按本机调整：

```powershell
$env:PYTHONUTF8 = '1'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$sceneRuntime = Join-Path $env:TEMP 'jetlinks-scene-playwright'
npm install --prefix $sceneRuntime --no-save --no-package-lock playwright@1.58.2
$env:SCENE_PLAYWRIGHT_RUNTIME = $sceneRuntime
$env:SCENE_TEST_OUTPUT = Join-Path $env:TEMP 'jetlinks-scene-frontend-results'

node modules/rule-engine-manager-ui/scripts/run-scene-trigger-tests.mjs
node modules/rule-engine-manager-ui/scripts/run-device-editor-tests.mjs
node --test modules/rule-engine-manager-ui/tests/sceneDetailQuery.test.mjs
node modules/rule-engine-manager-ui/tests/frontend/run.mjs
if ($LASTEXITCODE -ne 0) { throw '浏览器测试失败，请查看 results.json' }
node modules/rule-engine-manager-ui/tests/frontend/prepare-baseline.mjs
if ($LASTEXITCODE -ne 0) { throw '2.12 基线准备失败' }
node modules/rule-engine-manager-ui/tests/frontend/baseline.mjs
```

未设置输出变量时使用模块的 `target/scene-frontend`。基线目录可由 `SCENE_BASELINE_ROOT` 单独指定。基线业务源码来自 `git archive`；仅改其 tsconfig 的 extends 以使用当前宿主配置。测试使用当前共享组件与依赖，不能视为完整 2.12 应用安装测试。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `server.mjs`、`platform.mjs` | 隔离宿主、Vue 编译、同源模拟 HTTP、宿主边界适配 |
| `entry.js`、`legacy-entry.js` | 真实页面路由、Pinia、中文及本地图标配置 |
| `fixtures.mjs` | 产品、物模型、设备、变量和保存接口；未知接口直接失败 |
| `cases.mjs` | 浏览器实际点击和断言，步骤间保留同一条新建配置 |
| `contract.mjs` | 独立保存结构检查、共同执行字段比较 |
| `run.mjs` | Chrome 启动、结果、失败截图和异常门禁 |
| `prepare-baseline.mjs`、`baseline.mjs` | 固定源码准备、原版 UI 配置和提交数据比较 |

## 结果与边界

- `results.json`：每项 PASS/FAIL、浏览器异常、未知接口、外部访问、实际请求和实际保存 JSON。
- `<ID>-failure.png/.txt`：失败时截图与页面文本；`latest.*` 用于定位最后一个失败。
- `baseline-comparison.json`：2.12 对照样例及双方实际保存 JSON；成功文件只在整套基线通过时写出，应结合本次命令退出码判断。
- `baseline-results.json`、`baseline-source.json`：原版页面异常、保存记录及基线来源。
- 任一 UI 断言、pageerror、未知模拟接口或外部 HTTP 访问都使正常运行返回非零。场景执行接口始终拒绝。
- 浏览器目前覆盖手动、Cron、设备上线与读取、条件、模式切换和异常恢复等高风险路径；其他 Provider、空间/组/组织/标签、复杂分支、通知/采集器及尺寸视觉检查请使用文档目录的手工清单。
- 规则数据测试验证转换和往返；设备组件测试使用 Vue 自定义 renderer，不能替代真实浏览器点击。
- 宿主优先复用当前 core Vite 的预打包依赖缓存以减少启动耗时。当前环境已验证有缓存路径；无缓存回退路径尚未单独冷启动验证。

调试时可设 `SCENE_WATCH=1`；只监视 `cases.mjs`，修改生产源码、宿主或 fixtures 后必须重启。正式结果使用不带 watch 的一次性运行。
