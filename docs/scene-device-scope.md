# 场景联动设备空间范围

场景联动的设备选择统一使用“空间分组”术语，包括页签、选择提示、空态、已选数量、范围按钮及规则摘要。空间节点仍按显式勾选生效，选择父空间不自动包含下级空间或下级设备。

归属模块为 `runtime-ui/modules/rule-engine-manager-ui`。私有化 `rule-engine/Scene` 与 SaaS 租户 `iot-user/scene-linkage` 共用 `views/SceneLinkage`；设备范围弹窗为 `views/SceneLinkage/editor/components/DeviceScopeModal.vue`，范围回显由 `views/SceneLinkage/editor/deviceScopeLabel.ts` 组织。

## 实施与验证

- 在 `locales/lang/zh.json`、`en.json`、`ja.json` 中同步空间术语，保留现有国际化键、占位符与 `space` 选择器契约，不调整接口、存储结构或范围匹配规则。
- 中文、英文、日文各 9 项资源的 JSON 解析、占位符一致性及运行时资源合并检查通过；确认设备弹窗仍引用原国际化键，合并后的新文案未被其他模块覆盖。
- `git diff --check` 通过。模块定向构建使用 Node 22.18.0 执行 `pnpm -F jetlinks-web-core build -- --module-name rule-engine-manager-ui`，退出码为 0，耗时 2m 44s；保留资源包体积、浏览器兼容数据过期等构建警告。
- 本次仅修改语言资源，未改 Vue/TypeScript、样式或业务逻辑，未执行单独 lint/typecheck。尚未在浏览器中复核弹窗与范围回显，需在上述两个场景入口确认新文案展示；现有已保存的规则摘要文本不会自动重写。

交付信息：实现提交 `3f69555`，Pull Request <https://github.com/jetlinks-v2/rule-engine-manager-ui/pull/140>，目标分支 `2.20`。
