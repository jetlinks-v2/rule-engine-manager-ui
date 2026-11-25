# 场景联动通知通道

## 目标与范围

规则引擎场景联动的“发送通知”以 `GET /notify/channel/all` 返回的已启用、当前用户可访问通道为唯一候选来源。当消息模板中的场景主题启用且接口返回 `inside-mail` 时，通知方式中应可选“站内信”；主题禁用或当前用户不可访问时，接口不返回该候选，前端不补造。

归属模块为 `runtime-ui/modules/rule-engine-manager-ui`，快速模式入口为 `views/SceneLinkage/editor/index.vue`，详细模式通过 `views/Scene/Save/action/SceneNotify/index.vue` 复用 `NotifyActionRow.vue`。后端场景执行器统一调用通知命令，透传是否使用第三方关系的配置；未开启时保持原投递行为。消息模板启停规则与运营端 `ui/` 不变。

## 实施计划

1. 将场景通知候选从仅允许 `notifier-*` 改为同时允许内置 `inside-mail`，继续排除其他无关通道。
2. 通知弹窗仅配置通知方式和接收人，不展示正文；`inside-mail` 和外部 `notifier-*` 在选择或回显时均不请求模板详情，内容由消息模板页统一维护和预览。
3. 将候选转换和模板判断收敛为可测试函数，覆盖站内信、外部通道、无关通道、未返回通道及当前用户收件条件。

## 验证与风险

执行场景通知定向测试、Vue SFC 编译检查与 `git diff --check`。配置是否完整按通知方式和接收人判断，不以正文预览是否存在判断。

## 实施结果

- `utils/sceneNotify.ts` 统一过滤场景通知通道：仅保留后端返回的 `inside-mail` 和 `notifier-*`，不在前端生成站内信候选。
- `views/SceneLinkage/editor/index.vue` 在选择或回显通知方式时仅保存通道 ID 和展示名称，不再查询或缓存模板正文和变量名称。
- `utils/notifyUser.ts` 允许具有用户 ID 的当前用户接收站内信，不再错误要求邮箱或手机号。

## 节点回显与规则预览

快速与详细模式共用通知配置交互和 `SceneNotifySummary.vue` 摘要。弹窗以两个全宽字段配置通知方式和接收人，保留模板说明及配置摘要；正文格式、预览和测试统一在消息模板页处理。详细模式仍保存原生 `action.configuration`，仅由适配层转换为公共组件需要的结构；展示名称通过已有权限查询补齐，不回写或替换运行配置。规则预览和列表中的持久化摘要沿用“当 / 且 / 就”的语义与关键词颜色，兼容旧摘要中的连接冒号，显示时不再添加冒号。

验证结果：

- `pnpm run test:scene-notify`：4 项全部通过。
- `vue/compiler-sfc` 对 `views/SceneLinkage/editor/index.vue` 的脚本与模板编译通过。
- `git diff --check`：通过。
- 模块级 `vue-tsc --noEmit` 未通过，输出为工作区已有的全量类型错误（包含 `jetlinks-web-core` 和场景编辑器既有组件）；本次新增工具文件已由定向 esbuild 测试完成类型转译验证。

交付信息：实现提交 `3f74778`，Pull Request <https://github.com/jetlinks-v2/rule-engine-manager-ui/pull/133>。

## 待接入的场景通知 Hook

`views/SceneLinkage/editor/useSceneNotification.ts` 收拢通知候选查询、模板预览刷新、失败重试及配置页导航，依赖 core 的 `hooks/useNotificationConfigNavigation.ts`。当前编辑页仍使用自身逻辑，尚未引用该 hook。该 hook 保留旧的模板查询与预览逻辑，后续接入前应先对齐当前不展示正文、不查询模板详情的交互，不改变场景保存协议。

`node --test tests/sceneNotify.test.mjs tests/sceneNotificationFlow.test.mjs` 共 7 项通过，覆盖站内信不查模板、保留接收人及业务草稿、切换渠道 / 移除行后的迟到结果、失败与重试、传递真实配置渠道。测试使用 API 和 core 导航替身，不能代替真实跨标签联调；TypeScript 语法转译及差异检查通过，未重复模块完整类型检查与构建。接入前需完成 core 导航的多语言与浏览器验证，并验证编辑页与该 hook 的事件连接。


## 与视觉告警同步的通知对象规则

场景联动和视觉告警共用 core `api/notificationRecipients.ts` 的凭据能力及组织角色目录规则：

- 钉钉工作通知（`dingTalkMessage`）：人员、组织。
- 企业微信（`corpMessage`）：人员、组织、角色。
- 钉钉机器人（`dingTalkRobotWebHook`）、Webhook：固定目标，不选择人员。
- 未能查询凭据详情时保留人员模式，不推断组织角色或机器人能力。

快速、详细模式共用通知弹窗、配置校验与摘要。组织角色存为 `dimensions: [{type, id}]`，名称仅放 `options.recipientScopes`；所有渠道均通过 `notifyChannelIds` 指定具体实例，固定目标不额外保存模板 ID。切换渠道清除不支持的范围，取消编辑恢复完整快照。此次扩展尚未发布，不保留旧字段 `recipients` 的兼容别名；已保存的测试场景应重新选择目标并保存通知配置。

人员下拉与视觉告警保持一致：左侧姓名、右侧小字用户名，保留姓名或用户名搜索，不显示组织路径。弹窗配置预览按部门、成员、标签顺序显示非空分组，名称标签支持鼠标及键盘移除；按当前动作、对象类型和 ID 更新草稿，不影响其他渠道或同 ID 的其他类型。移除最后一个目标后仍需满足必填校验，取消弹窗恢复原配置。界面上的部门、标签分别使用平台组织、角色目录，保存类型仍是 `org/role`。

后端场景动作将新字段透传给 `UserNotificationTaskExecutorProvider`。执行器统一组装 `SendUserNotificationCommand`，传入 `userIds`、`dimensions`、现有渠道 ID 和配置中的 `useThirdPartyRelation`，开关默认 `false`。前端在切换或保存渠道时，为钉钉工作通知、企业微信写入 `true`，其他渠道写入 `false`；不在规则层解析第三方绑定或按服务商分支发送。未开启开关的调用仍按原有维度查用户流程投递。

通知层根据命令开关选择投递机制，不提前探测能力或自动拆分渠道。开启时使用 `DepartmentRecipientResolver`、`TagRecipientResolver`，从当前凭据的 `workNotificationRecipients.departments/tags` 将所选组织、角色解析为第三方部门、标签 ID，不展开平台用户。微信、钉钉的现有渠道 Provider 将目标转换为各自的收件字段，基类统一创建临时模板并发送；`NotifySendResolver` 保持原有资源解析职责。未绑定、绑定歧义、不支持的维度或渠道在发送时报错，不回退到模板根部门、全公司或平台用户路径。需要不同投递机制的渠道应分别组装命令，发送主体和配置权限范围沿用原规则。

人员和维度分别投递，保留原有共存规则。用户分支只查询指定用户的第三方账号，清空模板部门、标签；维度分支只使用所选绑定目标，清空模板用户；钉钉同时关闭 `toAllUser`。每次调用创建独立模板，不修改共享模板或数据库。一个渠道的组织、角色合并为一次维度请求；该渠道不再同时走维度查用户路径。用户本身也属于选中部门时，仍可能收到两条，这是原有受众交集语义。

固定目标沿用通知层的 `receiverPolicy`，钉钉在自己的 Provider 中读取关联模板以区分工作通知和机器人；企业微信、邮件、Webhook 等通道创建不读取模板，模板仍在发送时解析。钉钉机器人与 Webhook 使用 `explicit` 策略。场景规则只调用通知命令，不独立调用 `SendNotifyCommand`。发送结果、重试及错误处理沿用既有通知链路。

验证关注渠道能力一致、范围选择与回显、目录失败重试、切换与取消、无人员固定模板、后端配置透传及不重复发送。真实外部通知仍需使用已配置渠道联调，回归必须检查实际企业请求的接收字段及发送次数，不能仅断言 DTO 中存在组织/角色 ID。

2026-11-25 本轮验证：`node --test tests/sceneNotify.test.mjs tests/sceneNotificationFlow.test.mjs` 共 16 项通过，覆盖统一 `dimensions` 配置、渠道切换及 `useThirdPartyRelation` 保存、组织角色选择与移除。`node scripts/run-scene-trigger-tests.mjs` 共 184 项通过，包含通知摘要、快速与详细模式及场景配置回归。后端使用 JDK 17 完成编译及 119 项相关定向测试；额外固定目标回归有 3 项原版同样失败，详见 notify-manager 的第三方关系通知验证记录。未进行浏览器联调或真实第三方发送。
