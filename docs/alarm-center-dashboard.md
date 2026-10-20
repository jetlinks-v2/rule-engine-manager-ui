# 告警中心仪表盘组件方案

## 状态与目标

状态：已实施，本地定向验证完成；正式菜单入口需部署后同步并启用。“今日事件 = 视觉事件原始上报量（包含后续被拦截的事件）”按用户确认执行。任务级别 M，主要归属 `runtime-ui/modules/rule-engine-manager-ui`。

原型：<https://jetlinks-ai-new.ez7268-453.workers.dev/midhub/alarm/dashboard>。

在既有 `visDashboard/AlarmCenter` 分组开发原型中的七个独立仪表盘组件，参照资源中心的画布接入、卡片展示和组件编写方式，组装到现有 `views/DashBoard/index.vue` 告警仪表盘入口。保留 `rule-engine/DashBoard`、`AlarmDashboard` 注册入口及现有首页助手能力接线。

范围限定为运行时前端。运营端 `ui/`、公共画布协议、导航壳层、后端接口和既有告警业务组件的持久化身份不在本次改动范围；若真实聚合契约需要后端变更，再更新本方案并确认影响。现场发现当前菜单定义缺少告警仪表盘，补回 `baseMenu.json` 中 `alarm-center` 下的既有 `rule-engine/DashBoard` 入口（`/alarms/dashboard`）；不写入服务端菜单配置，已保存菜单的部署需同步并启用该入口。

## 当前事实与参考入口

- 已在浏览器查看原型及物联“按设备类型”、视觉“按摄像头”两个切换状态，查看结束已恢复默认状态。
- 资源中心实际入口：`runtime-ui/modules/authentication-manager-ui/views/resources/Dashboard/index.vue`、同目录 `useResourceDashboard.ts`；组件规范与接入说明：`runtime-ui/modules/authentication-manager-ui/docs/resource-center-dashboard.md`。
- 公共画布：`runtime-ui/jetlinks-web-core/src/components/DashBoardCanvas`。宿主通过 `dashboard-sources.ts` 和 `discovery/useDashboardCatalog.ts` 限定模块、分组和入口，读取三组配对导出。当前 runtime-ui 已没有旧 `visualization-dashboard-ui` 子模块。
- 当前告警模块已有 `visDashboard/AlarmCenter/manifest.json`、旧类型 `todayAlarmCard`、`alertStats` 等；新组件采用新类型，避免改变已保存组件的语义。
- 数据参考：本模块 `dataCapabilities/deviceAlarm.service.ts`、`visionAlarm.service.ts`、`visionAlarmSummary.service.ts`、`visionAlarmTrend.service.ts`、`docs/视联告警数据能力接口说明.md`；请求封装位于 `api/iotAlarm.ts`、`api/board.ts`。
- 原始视觉事件请求参考：`runtime-ui/modules/jetlinks-ai-ui/api/videoEvent.ts`，其中事件统计使用 `/ai/task/history/*` 并传递 `assetType=device`。该路径作为接口事实参考，组件不依赖其他模块的私有页面实现。
- 展示与配置契约同时参考 `runtime-ui/modules/visualization-resources/system-resource.md`；出现历史说明与当前调用不一致时，以当前画布和资源中心生产代码为准。

## 推荐方案：沿用资源中心的监控感知页

业务任务：让项目运维人员查看事件进入量、两类告警的处理压力和变化趋势，并快速进入规则、通知配置。

```text
┌────────────────┬────────────────┬────────────────┐
│ 今日事件       │ 今日物联告警   │ 今日视觉告警   │
│ 误报拦截率     │ 累计/未处理/已处理│ 累计/未处理/已处理│
├────────────────┼────────────────┴────────────────┤
│ 快速开始       │ 告警趋势：事件 / 物联 / 视觉      │
│ 物联规则 视觉规则│ 今天 / 昨天 / 近3天 / 近7天 / 近30天│
│ 通知模板 通知渠道│ 三系列分组柱状图                 │
├────────────────────────┬─────────────────────────┤
│ 物联告警统计           │ 视觉告警统计            │
│ 告警类型 / 设备类型    │ 告警类型 / 摄像头       │
│ 水平条形图             │ 水平条形图              │
└────────────────────────┴─────────────────────────┘
```

### 方案档案

- 内容承载：`DashBoardCanvas`，桌面 24 列，顶行 `8/8/8`、中行 `12/12`、底行 `12/12`；行高与间距参照资源中心 `16px/18px`，具体卡片高度按内容验收调整。快速开始由原先 8 列拓宽至 12 列，为内部双列入口与说明文案留足横向空间。
- 筛选面：趋势组件的五档时间切换；两个统计组件各自切换维度，默认统计今日。沿用原型局部筛选，不新增主搜索表单，`ConditionFilter` / `ProSearch` 均不适用。
- 信息密度：三层内容；告警趋势为主图，顶部指标与快速开始保持次级权重。条形图默认约十项可见，超过时在组件内滚动，完整名称通过 Tooltip 查看。
- 详情承载：复用现有业务页面；本期快速开始跳转至已有规则及通知页面，不新增详情抽屉或批量处置流程。
- 编辑梯度：运行时就地切换时间和维度；组件参数沿用画布配置面板“应用/取消”；页面默认隐藏增删和配置入口，支持拖动缩放与个人布局恢复。
- 核心复用：core 按需入口 `DashBoardCanvas`、`discovery`、`Echarts`，全局 `CloudEmpty`、现有图标能力及 menu store；Ant Design Vue 的 `Spin`、`Segmented`、`Button`、`Badge`、`Tooltip`、`Form`、`Collapse`。
- 样式锚点：资源中心 8px 圆角卡片、轻边框、标题及状态数字层级、蓝色物联与青色视觉系列；外观使用平台 token，告警状态通过圆点、标签和文字共同表达。
- 动作位置：快速开始卡片内；时间和维度操作在各卡片标题右侧；错误重试在失败区块内部。保持现有导航壳，不新增侧栏、PageHead、悬浮入口或说明 banner。
- 个人布局：使用独立于资源中心的存储 key，将账号/项目/API 范围与部署形态转为固定长度摘要，保留宽度档位，并由版本管理组件布局结构；继续由画布恢复、保存，不复用资源中心缓存。
- 响应式：按实际画布宽度采用桌面、两栏、单栏默认布局；长标题和切换器允许换行，图表随卡片尺寸 resize，保持核心数字、轴标签和内容可读。
- 不借鉴清单：不复制原型顶栏及侧栏，不添加无来源 KPI、装饰区、大表格或统一编辑弹窗；不把视觉告警的旧等级趋势直接替代三来源趋势。
- 确认方式：整体方案已于 2026-10-20 获得用户确认；按本文件实施。

备选为同样七个组件的固定 CSS Grid 展示：适合只读且无需用户调整布局的页面，时间/维度操作仍就地进行，沿用相同图表、状态和快捷入口。其骨架为“3 个摘要 → 快捷入口与主图 → 2 个统计图”，但缺少与资源中心一致的拖动、缩放和个人布局能力，故本次推荐画布方案。

## 组件拆分与数据方案

以下七个新目录和类型已实现，沿用原分组并保持旧类型兼容。

| 原型区块 | 新目录 / type | 数据与交互 |
| --- | --- | --- |
| 今日事件 | `TodayEvents` / `alarmCenterTodayEvents` | 原始视觉事件的今日数量与 AI 复判拦截率；事件定义已确认 |
| 今日物联告警 | `IotAlarms` / `alarmCenterIotAlarms` | 今日产生数量；底栏为历史累计、当前未处理、已处理 |
| 今日视觉告警 | `VisionAlarms` / `alarmCenterVisionAlarms` | 今日产生数量；底栏与物联卡保持相同语义 |
| 快速开始 | `QuickStart` / `alarmCenterQuickStart` | 配置物联规则、视觉规则、通知模板、通知渠道；按账号实际可访问菜单生成入口 |
| 告警趋势 | `AlarmTrend` / `alarmCenterTrend` | 事件、物联、视觉三系列分组柱；支持原型五档时间 |
| 物联告警统计 | `IotStatistics` / `alarmCenterIotStatistics` | 今日按告警类型、设备类型聚合；水平条形图 |
| 视觉告警统计 | `VisionStatistics` / `alarmCenterVisionStatistics` | 今日按告警类型、摄像头聚合；水平条形图 |

### 可复用能力与待补齐项

- `alarm.device.summary` 已支持显式时间窗口内的总量、未处理、已处理。其默认窗口为当天，历史累计必须显式查询全历史或复用不带时间条件的 count API，不能将默认结果当累计。
- `alarm.vision.summary` 提供告警记录状态计数和告警历史触发计数，两者属于不同统计粒度。建议新仪表盘的两类告警统一使用告警记录粒度，主值、底栏、趋势与分布沿用同一粒度；复用 service/API 时核对 `total` 和 `alarmCount` 的来源，不直接互换。
- `alarm.vision.ai-review.summary` 已提供 `filtered`、`valid`、`total` 与 `filterRate`；显式传入今日窗口。无已完成复判时比例展示 `--`，不由原始事件量减去告警量估算拦截率。
- `alarm.event.summary` 当前合并物联与视觉告警，并非复判前的视觉事件总量；不能仅因名称包含 event 就用于原型“今日事件”。
- `alarm.vision.trend`、`alarm.vision.type.distribution`、`alarm.vision.channel.rank` 可作为视觉系列、告警类型与摄像头维度的复用入口；核对它们与新卡片的统计粒度后选用。
- 原始事件趋势、物联趋势和物联两个统计维度尚无与原型完全对应的已注册 DataSource。优先由本模块 widget service 组合现有 `/ai/task/history/*`、`/dashboard/_multi` 和物联告警聚合 API；不为图表展示新建后端接口或改动既有能力 ID。
- 设备类型参考原型中的“温度传感器、烟感探测器”等业务分类；实施前核对产品/设备分类字段及聚合关联方式。服务端聚合后批量补全名称，避免逐设备请求或全量明细拉取，也不以 `targetType=device/product/organization` 代替这些业务类别。

### 已确认与建议采用的统计口径

1. **今日事件（已确认）**：权限范围内原始视觉事件上报量，包含后续被拦截的事件，按业务事件时间统计。同一条上报及其后续复判执行不能重复计数。
2. **误报拦截率**：建议为今日成功完成告警复判的拦截数 / 成功完成复判数；与今日事件共用时间范围，但分母是已复判事件。
3. **两类告警卡片**：建议统一使用告警记录粒度，主值为今日新增记录数，底栏为历史累计及其中当前未处理/已处理记录数；在 Tooltip 说明时间范围与粒度。重复触发次数若需单独分析，另行明确展示语义。
4. **趋势与分布**：趋势三系列使用同一窗口、时区与时间桶；两张分布图独立固定今日，不随趋势切换。今天/昨天按小时，近 3/7/30 天按自然日。时区沿用项目实际契约，并在真实接口联调中确认。

接口成功且明确没有记录时展示真实零值/空态；缺失字段、非法响应与请求失败进入错误或未提供状态。缺失时间桶保留缺失含义。编辑预览使用独立确定性样例，正式运行使用真实数据。

## 组件编写与接线规则

```text
visDashboard/AlarmCenter/
  manifest.json                      # 沿用现有分组
  shared.ts / dashboard.types.ts     # 保持旧类型兼容，新增明确的配置与展示类型
  components/                       # 共享指标、趋势、条形图、快捷入口展示与配置表单
  hooks/                            # 取数生命周期、筛选状态、导航
  services/                         # 查询编排、校验、归一化、独立预览样例
  <七个组件目录>/
    config.ts
    index.ts
    <Component>.vue
    Config.vue
    thumbnail.svg
views/DashBoard/
  index.vue                         # 页面组装与既有助手接入
  useAlarmDashboard.ts              # 发现范围、布局、存储 key
```

1. 每个入口导出 `Xxx`、`XxxConfig`、`XxxConfigProps`，运行与配置 SFC 都懒加载。`config.type` 与运行描述符 name 一致，默认业务配置归入对应 type 命名空间，提供完整网格默认值和最小尺寸。
2. 运行组件沿用 `info` / `isEdit`，必要布局样式由当前契约传递；配置面板使用 `activeComponent` 和 `change(value, key)`。采用资源中心当前实际契约，不新增 `configData` 适配层。
3. 缩略图沿用资源中心 `thumbnail.svg`，由组装入口提供给 `catalog.thumbnail`；共享 discovery 无需业务专属分支。页面只加载本模块这七个入口，防止旧组件或其他分组进入默认页面。
4. 指标卡三处和统计图两处复用本组展示组件；复用边界为相同展示职责和数据契约。纯展示组件通过语义事件交互，API、路由、轮询和全局状态放 hooks/services。
5. Hook 负责 loading/error/empty、请求取消、过期响应废弃、完成后调度下一次轮询、配置和项目切换重载、KeepAlive 停用与卸载清理。每次筛选/配置/作用域变化取消同实例旧请求；完成后再调度下一轮，不新增跨项目共享的业务结果缓存。
6. `isEdit=true` 停止真实请求与菜单跳转；页面拖动缩放由 `layoutEditable` 控制，不能把布局编辑与样例预览混为同一状态。
7. 新增 Vue/JSX/TSX 控制在 300 行以内，保持 Vue 3 `script setup lang="ts"`、明确类型和模块中英文文案。组件层级不超过 5 层。
8. 单一数据源失败不让整页不可用；趋势有系列失败时明确标示失败系列并允许重试，保留成功系列。空态和错误态保留时间/维度切换操作。

## 实施顺序

1. 锁定上述统计口径，核对真实聚合响应、设备分类关联、时间桶与权限；明确每个显示值的数据来源及空值含义。
2. 在原有分组补齐七个组件的元数据、懒加载入口、配置面板与缩略图；完成可复用展示和明确类型。
3. 接入现有 service/API，补齐本组缺失聚合编排，处理局部失败、请求去重、竞态和预览隔离。
4. 在现有 `views/DashBoard` 组装画布、响应式默认布局、快捷入口及个人布局存储，保留现有路由注册和助手接入。
5. 完成定向验证并将实际结果、剩余风险回填本文件；已有 commit/PR 时再补交付引用。

## 验证与外部依赖

本次完成七个组件、页面组装、模块菜单定义与中英文文案；未修改后端或运营端。复用既有 9200 Vite 服务，临时验收入口已移除。

验证范围：

- 静态：七组三组导出、唯一 type、缩略图可达、语言包 JSON、SFC 与 TS 语法、文件职责及行数、`git diff --check`。
- 定向数据/生命周期验证：今日/昨日跨日边界、累计与今日分离、复判分母为零、真实零与缺失值、三系列对齐、分类名称补全、接口失败及局部重试、配置/项目变化后的迟到响应和卸载清理、预览零请求。
- 复用现有数据能力专项：`pnpm -C runtime-ui/modules/rule-engine-manager-ui run test:data-capabilities`；只有改到既有助手接线或工具时再运行对应专项。
- 页面：复用现有本地运行时页面核对三层布局、五档时间和四种统计维度、四个快捷入口的权限和目标、拖动缩放后刷新恢复、宽/窄卡片内容及横向溢出。操作前后保护原有个人布局。
- 性能约束：不默认执行全项目构建。待补充门禁为 `pnpm -C runtime-ui exec vue-tsc --noEmit -p modules/rule-engine-manager-ui/tsconfig.json` 和 `pnpm -C runtime-ui build:standalone`；确需运行前先说明原因和资源安排。模块当前没有 lint 脚本。

真实验收依赖登录态、告警/视觉事件资产权限、对应聚合接口和有效样本。若现有后端没有所需设备分类/事件聚合能力，先在本文件记录具体缺口，再确认后端范围。

预计仅发布 runtime-ui 静态资源，无后端服务重启要求。开发环境新增目录后若 Vite 保留旧 glob 缓存，需要使 `dashboard-sources.ts` 失效或重启现有运行时 Vite 服务。提交与 PR 尚未创建。

## 实施结果与验证

### 个人布局缓存 key 简化

已实现：将原来包含 URL 编码作用域和完整组件清单的长 key 收敛为 `alarm-dashboard:v1:<作用域摘要>:<宽度档位>`。复用已安装的 `crypto-js` 生成 32 位十六进制 MD5 摘要，宽屏 key 固定为 56 个字符。账号、项目、API 与部署形态仍共同参与摘要计算；宽屏/中等/窄屏分别保存，不调整已保存组件的位置和尺寸。组件结构由缓存版本管理，不在新 key 中重复列出七个组件名。

实现入口：`views/DashBoard/alarmDashboardStorage.ts` 负责生成新旧标识，`useAlarmDashboard.ts` 提供给页面，`index.vue` 将旧标识通过现有 `DashBoardCanvas.legacyStorageKeys` 契约传入。沿用公共画布迁移逻辑：新缓存优先，迁入旧布局成功写入后才移除旧 key；存储写入失败继续使用旧布局并保留原记录。迁移只读取当前账号/项目/API/部署和宽度档位对应的精确旧 key，不遍历其他缓存。编辑预览不启用持久化。

验证：`node --test tests/alarmDashboardStorage.test.mjs` 7/7 通过，覆盖固定长度与确定性、账号/各项目标识/API/部署及宽度隔离、精确旧 key 重建、原始坐标尺寸完整迁移、新缓存优先、损坏缓存/存储不可用/写入失败时保留旧数据，以及清理失败时继续使用迁入结果。两个 TypeScript 文件的语法、页面 SFC 脚本/模板/样式和 `legacyStorageKeys` 接线检查通过；现有 9200 Vite 服务转换新 helper、页面 hook 和页面入口均返回 HTTP 200，`git diff --check` 通过。本次未操作用户浏览器中的缓存，实际迁移在刷新挂载画布时执行。未运行全量 lint/typecheck/build，无新增依赖或后端重启要求。

### 页面滚动与快速开始展示

整页外观与资源中心对齐：资源中心在所属模块 `index.ts` 的 `getContentPanelOverrides()` 中声明 `resources/Dashboard: false`，卡片之间直接露出项目页面背景。告警仪表盘采用相同扩展点，对 `rule-engine/DashBoard`、`AlarmDashboard` 与 `/alarms/dashboard` 声明 `false`，移除整页额外白底、阴影、圆角和内边距；保留各业务卡片自身外观及布局壳层的页面留白。删除此前仅调整祖先面板溢出的页面 CSS，个人坐标与尺寸、公共面板默认行为保持原契约。已核对模块导出注册、三个别名关闭面板且无关页面不受覆盖；页面 SFC 脚本/模板/样式和 `git diff --check` 通过。声明随代码加载生效，刷新页面即可，不依赖重新初始化菜单。

滚动规则：页面根不收缩，画布随内容自然增高，由最外层页面承担滚动。此前隔离复现曾确认统一 `ContentPanel` 的默认 `overflow: auto` 会在面板高度不足时形成内部滚动；当前直接移除这层包裹，画布内容规则仍保证自然高度及可见溢出。

`components/AlarmQuickStartPanel.vue` 已对齐资源中心 `QuickStartPanel.vue` 的浅蓝渐变、轻边框、32px 蓝/青图标徽章、等高网格、文案层级及悬停反馈；窄容器采用单列和 28px 图标，奇数项末项铺满。继续使用四项原入口与原权限逻辑。

默认比例调整：`views/DashBoard/alarmDashboardLayout.ts` 的宽屏快速开始由 `w=8` 改为 `w=12`，趋势由 `x=8,w=16` 改为 `x=12,w=12`，二者各占半行并与底部统计卡片对齐。保留整行高度，避免入口过窄造成接近方形及说明截断；继续由画布优先恢复已保存的个人位置/尺寸，不升版存储键或清理个人布局。`node --test --test-name-pattern='every responsive layout' tests/alarmDashboard.test.mjs` 通过，三档布局均保持七个独立组件、无重叠且不越过 24 列；`git diff --check` 通过。此次只调整默认坐标，复用已有快速开始宽窄渲染证据，不重复执行整项目构建。

验证：原有背景面板的隔离复现测得 1862×955 时 `clientHeight/scrollHeight = 851/916`，用于确认内部滚动来源；当前方案改为不挂载面板，不将旧包裹结构的结果当作当前整页验收。快速开始组件在 720×320、420×390 独立挂载的验证继续有效：四个按钮无内容溢出，图标分别为 32/28px，四个原始 `open` 事件通过。未执行全量构建，当前登录态整页视觉复验仍待完成。临时诊断代码和测试页已移除，无后端服务重启要求。

### 标题栏切换项样式

参照资源中心网关状态指标的分段切换样式，统一告警趋势与两个统计卡片：浅灰背景、白色选中块、蓝色选中文字、6px 外圆角、4px 选中块圆角和 26px 标签最小高度。落点为 `visDashboard/AlarmCenter/components/AlarmWidget.vue`，保留现有选项与切换行为。定向 SFC 脚本/模板/样式检查与 `git diff --check` 通过；当前 `localhost:9200/#/alarms/dashboard` 三处样式目视核对及昨日/设备类型/摄像头切换通过，已恢复默认选中项。本次不运行全量构建，无后端重启要求。

### 实际代码与口径

- 七个组件保持三组懒加载导出、独立配置命名空间与 SVG 缩略图；`components/AlarmWidget.vue` 统一状态承载，指标、快速开始、趋势和统计分别由纯展示组件负责。配置的应用/取消沿用 core 画布草稿协议。
- `api/alarmDashboard.ts` 沿用平台 request、取消信号和资产上下文。所有物联/视觉 count 与 aggregation 显式附带 `targetType=device/aiTaskMediaTarget`，兼容当前部署只按路径注入权限而未限制类型的行为。现场最初两卡都返回 1,107；补充显式目标后物联 19、视觉 1,088，状态数各自闭合。
- `services/metrics.ts` 将今日数量与无时间条件的历史累计分别查询，部分指标失败保留成功结果；复判只统计 `taskType=reviewHandle`、`success=true`、非等待且 `hitResults=0/1` 的历史。
- `services/query.ts` 以业务 `timestamp` 查询原始事件，排除单独保存的复判记录；统一检查 success、返回结构与计数，非法响应进入失败状态。
- `services/trends.ts` 以同一自然日范围/粒度组装三来源；物联与视觉使用告警记录 `alarmTime` 聚合，事件使用 `/ai/task/history/aggregation/_count`。系列失败独立标示，缺失桶不伪装为零。
- `services/statistics.ts` 固定今日记录口径。物联设备类型先按 `targetId` 聚合，再按每批最多 200 个有权限设备补全 `productId/productName`，汇总为产品类型；摄像头以告警记录的 `sourceId/sourceName` 聚合，保持与指标同一记录粒度。
- `views/DashBoard/useAlarmDashboard.ts` 仅发现七个新入口；宽度分档布局在 `alarmDashboardLayout.ts`，缓存按账号、项目、API、部署和宽度档位隔离。窄屏快速开始增加默认高度，四个入口均完整显示。
- 模块 `baseMenu.json` 在现有告警中心根 ID 下补回 `rule-engine/DashBoard`，路径为 `/alarms/dashboard`；当前服务端保存的菜单没有此项，代码没有替用户修改服务端菜单。

### 已完成验证

- `node --test tests/alarmDashboard.test.mjs`：11/11 通过，覆盖自然日跨月范围、非法响应/真实零、原始事件排除复判、拦截率分母、今日/累计分离、局部失败、三系列窗口、205 台设备分两批补全、摄像头记录口径、显式目标类型和资产参数、三档布局、预览零请求及卸载取消、七组导出和双语键对齐。
- `node dataCapabilities/dataCapabilities.test.mjs`：通过，现有 17 个能力的 manifest/source/output schema 与文案保持一致。
- 本次 47 个 Vue/TS 文件的 SFC 脚本、模板、样式及 TS 语法定向检查通过，均未超过 300 行；中英文 JSON、菜单 JSON 和 `git diff --check` 通过。首次扩大检查到未改旧组件时，三处旧 Less 依赖宿主注入变量，随后检查收敛到本次改动范围。
- 定向 `vue-tsc` 纳入全部新增 Vue/TS 及页面，依赖链报告 473 项诊断，本次新增和修改路径无诊断；整体检查未通过。没有执行全项目 lint 或生产构建，模块未配置 lint 脚本。
- Vite 实际转换的正式页面及组件入口均返回 HTTP 200；修正了现有 `setup-name-support` 插件无法解析外部 `defineProps<AlarmWidgetProps>` 的问题，入口使用带明确属性类型的声明，不改公共构建插件。
- 带现有登录态的临时验收画布挂载七个真实组件：原始事件主值随真实上报增长；物联累计 19（未处理 5、已处理 14），视觉累计 1,088（未处理 1,084、已处理 4）。当天两类告警均为 0，统计面板显示业务空态。
- 五档时间切换、物联按类型/设备类型、视觉按类型/摄像头均可操作；1600/800/420px 实际容器布局目视核对通过，800px 双列和 420px 单列快速开始四项完整显示。配置标题取消后保持原值，应用后标题立即更新。编辑预览用独立确定性样例验证非空图表，不修改服务端数据。
- 四个快捷入口实际跳转通过：物联规则 `/alarms/rules/iot`、视觉规则 `/alarms/rules/visualAlarm`、消息模板 `/alarms/notify/template`、通知渠道 `/alarms/notify/delivery`。临时验收脚本、页面注入及专用 tsconfig 已移除，宿主 `index.html` 与验收前逐字一致；临时测试标签页已关闭并恢复原型标签页。

### 剩余验收与发布依赖

- 当前真实今日告警为空；非空设备产品分类补全、摄像头统计和排名已用隔离响应验证，仍需真实非空样本验收。
- 普通侧栏导航需先同步并启用 `/alarms/dashboard` 菜单；本次仅验证临时挂载及正式页面的 Vite 转换，没有把临时挂载视为正式菜单验收。
- 拖动、缩放与缓存恢复复用现有 core 实现，本次未完成正式菜单页的刷新恢复验收；KeepAlive 的真实停用/激活交互也保留为部署后复验项。
- 发布 runtime-ui 静态资源后生效，无后端服务重启要求；已有开发服务通过失效共享扫描模块识别新目录，无需本次重启。代码未提交或推送。
