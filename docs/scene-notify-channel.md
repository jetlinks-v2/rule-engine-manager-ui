# 场景联动通知通道

## 目标与范围

规则引擎场景联动的“发送通知”以 `GET /notify/channel/all` 返回的已启用、当前用户可访问通道为唯一候选来源。当消息模板中的场景主题启用且接口返回 `inside-mail` 时，通知方式中应可选“站内信”；主题禁用或当前用户不可访问时，接口不返回该候选，前端不补造。

归属模块为 `runtime-ui/modules/rule-engine-manager-ui`，快速模式入口为 `views/SceneLinkage/editor/index.vue`，详细模式通过 `views/Scene/Save/action/SceneNotify/index.vue` 复用 `NotifyActionRow.vue`。本次不修改后端、消息模板启停规则、通知发送协议、运营端 `ui/` 或其他非场景通知通道。

## 实施计划

1. 将场景通知候选从仅允许 `notifier-*` 改为同时允许内置 `inside-mail`，继续排除其他无关通道。
2. `inside-mail` 不依赖通知模板，选择或回显时不请求 `_query-with-templates`；外部 `notifier-*` 继续沿用原有模板内容查询。
3. 将候选转换和模板判断收敛为可测试函数，覆盖站内信、外部通道、无关通道、未返回通道及当前用户收件条件。

## 验证与风险

执行场景通知定向测试、Vue SFC 编译检查与 `git diff --check`。主要风险是站内信无模板正文，因此界面仅显示通道名称；不将它误判为配置缺失。

## 实施结果

- `utils/sceneNotify.ts` 统一过滤场景通知通道：仅保留后端返回的 `inside-mail` 和 `notifier-*`，不在前端生成站内信候选。
- `views/SceneLinkage/editor/index.vue` 在选择或回显站内信时跳过模板详情请求，直接保存通道 ID；外部通道保持原有模板查询，并缓存模板变量名称供配置和摘要展示。
- `utils/notifyUser.ts` 允许具有用户 ID 的当前用户接收站内信，不再错误要求邮箱或手机号。

## 节点回显与规则预览

快速与详细模式共用通知配置交互和 `SceneNotifySummary.vue` 摘要，突出通知方式、收信人及模板变量值。详细模式仍保存原生 `action.configuration`，仅由适配层转换为公共组件需要的结构；展示名称通过已有权限查询补齐，不回写或替换运行配置。规则预览和列表中的持久化摘要沿用“当 / 且 / 就”的语义与关键词颜色，兼容旧摘要中的连接冒号，显示时不再添加冒号。

验证结果：

- `pnpm run test:scene-notify`：4 项全部通过。
- `vue/compiler-sfc` 对 `views/SceneLinkage/editor/index.vue` 的脚本与模板编译通过。
- `git diff --check`：通过。
- 模块级 `vue-tsc --noEmit` 未通过，输出为工作区已有的全量类型错误（包含 `jetlinks-web-core` 和场景编辑器既有组件）；本次新增工具文件已由定向 esbuild 测试完成类型转译验证。

交付信息：实现提交 `3f74778`，Pull Request <https://github.com/jetlinks-v2/rule-engine-manager-ui/pull/133>。

## 待接入的场景通知 Hook

`views/SceneLinkage/editor/useSceneNotification.ts` 收拢通知候选查询、模板预览刷新、失败重试及配置页导航，依赖 core 的 `hooks/useNotificationConfigNavigation.ts`。当前编辑页仍使用自身逻辑，尚未引用该 hook；本次仅将既有辅助代码和测试纳入版本管理，不改变场景保存协议或页面行为。

`node --test tests/sceneNotify.test.mjs tests/sceneNotificationFlow.test.mjs` 共 7 项通过，覆盖站内信不查模板、保留接收人及业务草稿、切换渠道 / 移除行后的迟到结果、失败与重试、传递真实配置渠道。测试使用 API 和 core 导航替身，不能代替真实跨标签联调；TypeScript 语法转译及差异检查通过，未重复模块完整类型检查与构建。接入前需完成 core 导航的多语言与浏览器验证，并验证编辑页与该 hook 的事件连接。
