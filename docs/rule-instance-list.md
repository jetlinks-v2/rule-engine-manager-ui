# 规则编排列表与运行观测

运行时 `/rule-engine/Instance` 使用紧凑卡片展示规则名称、启用状态与流程预览。点击卡片进入原编排抽屉，保留 `editorId` 深链接、条件筛选、新增、启停和删除；列表不另设编辑操作。没有说明时不显示占位。

前端 owner 为本模块；观测业务由 `rule-engine-manager` 负责，运行快照和数据发出统计由独立 `rule-engine` 负责。运营端 `ui/` 和场景联动列表不属于该页面改造。

## 列表与预览

- 直接复用 `POST /rule-engine/instance/_query/no-paging` 的 NDJSON 流。此通用接口不返回总数，仍支持 `paging=true`；每段 `pageSize=32`，不设置无界读取，也不显示分页器。
- 按 `createTime DESC, id DESC` 排序，以最后一条已完成分段的时间和 ID 续取；游标条件与用户筛选分别分组后 AND。失败分段从上次完成的游标重试并按 ID 去重。
- 首批记录逐条进入；追加、空态、失败和重试独立反馈。显示真实已加载数量，不伪装成规则总数。
- 摘要只读取身份、名称、说明、配置状态、模型类型/版本及创建时间，不读取完整模型和缩略图。打开编排时按 ID 读取完整详情，轻量行不能覆盖完整配置。
- 缩略图按当前窗口批量查询 `id,metadata`，独立加载骨架；不逐卡发请求，不在摘要中持有全部 SVG。Blob URL 离开窗口、隐藏或卸载后释放。
- 卡片高224px、间距16px，按容器宽度排列1至4列；正文拥有滚动。只渲染可见范围加少量预读，最多64张卡片；已加载摘要保留以支持回滚查看。

入口：`views/Instance/index.vue`、`useRuleInstanceList.ts`、`useRulePreviews.ts`、`api/instanceObservation.ts`。流式传输、项目身份、语言、认证及精度复用 core 现有 `postRuntimeNdJson`。

## 图标与气泡

禁用规则不展示、不订阅运行观测。启用规则以小图标、状态颜色和数字显示摘要，悬停、聚焦或点击打开气泡；气泡内展示输入/输出速率、缓冲、副本、总流转数量、累计错误和最近执行。部分节点缺测时使用黄色警告图标，保留已观测数值，气泡注明仅汇总已观测节点，副本分母仅为已观测任务数。未知指标仍显示缺失；气泡不触发额外采样请求。

| 信息 | 图标 / 口径 |
| --- | --- |
| 输入速率 | 向内箭头；入口节点正常 `Output` 发出的数据条数，广播前计量 |
| 输出速率 | 向外箭头；末端节点正常 `Output` 发出的结果条数；空结果、纯副作用无输出消息时不计数 |
| 缓冲待处理 | 收件箱；当前任务主订阅父链中可扫描队列的缓冲之和 |
| 运行状态 | 运行、暂停、部分运行、缺测、过期和不可用分别表达；颜色之外保留可访问名称 |
| 运行副本 | 运行中任务副本 / 当前存活任务副本数，是流程节点任务实例，不是完整流程的复制数 |
| 总流转数量 | 全部普通 Output 的累计发出条数之和，包含内部流转；同一数据经过多个节点会计多次，Output 重建后归零 |
| 累计错误 | 当前任务中出现过错误的执行数，包含已恢复错误，不等于最终失败消息数 |
| 最近执行 | 当前任务最近一次执行开始时间，不是最近成功时间 |

输入/输出分别汇总没有普通或事件上游/下游的节点，直接读取任务连接关系，不存额外 start/end 标记。`Output.getMetrics()` 由默认 Output 实现直接持有固定 meter，无额外观测包装；多入口或多末端可能重复计量同一业务事件。速率是60秒时间常数的 EWMA，5秒惰性推进、首次节拍前为0，单位条/秒；不是精确的一分钟窗口均值，也不表示下游系统写入成功。执行开始次数继续沿原统计契约，不能冒充数据条数。

Pending 使用已有 `Scannable` 主订阅父链，最多扫描64层，不递归枚举活动执行、不增加逐消息 pending 状态。包含可扫描队列中的缓冲，不包含已取出执行的数据、不可扫描订阅、额外独立订阅或外部 Broker 积压。未知返回缺失，不能解释成0。

## 周期订阅

平台 WebSocket 主题 `/rule-instance/runtime/observe`：

```json
{"ruleIds":["rule-id"],"interval":2000}
```

- 页面仅一条观测订阅，范围为当前窗口内已启用的规则；最多64个 ID，滚动变化合并100ms再建立采样，旧范围立即取消。隐藏、离页或打开全屏编排时取消。
- 首轮立即查询，后续在上轮完成后延迟2秒开始；慢消费者只保留有限范围的一轮最新完整帧，不积压 tick，不缓存历史。
- 每轮先按 `rule-instance:query` 和 `AssetsHolder` read 范围查询存在且可读的规则，再调用原调度 RPC 的轻量批量投影。不传任务配置、模型、输入或堆栈。
- RPC 每节点最多4096个任务，集群并发4、节点超时5秒，业务整轮超时10秒。节点缺测保留 `partial/unavailable`，不补0或显示伪完整分母。
- 帧包括 `timestamp,rules[]`；规则项有 `id,observationStatus,runtimeState,runningReplicas,totalReplicas,inputRate,outputRate,buffered,transferCount,errorCount,lastExecutionTime`。累计大整数以十进制字符串传输，速率为数值，缺失保留 null/缺字段。
- 页面15秒无更新即失效，传输失败按有界间隔重试；替换范围时清掉旧观测，只持有当前范围的帧。

运行端必须装载新引擎构件；边界沿已有连接读取，无需为观测额外重新编译规则。旧节点或自定义 Output 没有对应能力时保留缺失；Output 装饰器应转交被装饰对象的指标。没有任务且完整读取成功时可明确返回0。

## 成本与验证边界

不增加逐次执行记录、历史存储、定时器线程、全局指标注册表或依赖。每任务复用一个新增发出 meter，同时供入口/末端两种角色读取；Pending 只在查询时扫描。

JDK21、256MiB 堆的 Instrumentation 对照原 QPS 版本：默认 Output 对象32→40B，加一个80B meter；无下游时另持有固定冷 Mono 和两个16B捕获对象，共新增136B/Output（1万个约1.30MiB），有下游时复用原 writer，不增加这48B。执行监控器不再持有输出 meter，仍为112B（含原执行 meter）。执行指标快照为56B，查询 Output 时另分配32B只读快照，不在写出热路径分配。

同一 JMH 单输出空函数探针相对原 QPS 版本：执行416.88→414.51ns/op，分配保持1704B/次；执行指标快照23.27→23.41ns/op、分配保持56B/次。相较此前包装实现，执行分配1744→1704B/次。没有新增逐消息状态。这是本机短微基准，不能据此承诺生产吞吐或多线程争用成本。

验证结果：引擎27项（含真实双节点 Output 指标 RPC、真实 EventBus 缓冲2→0、广播计数一次、空结果、并发订阅及 Output 重建归零）通过并本地 install；管理层7项定向测试通过，覆盖总流转数量及缺测保留已观测数据；前端列表/游标/范围替换/禁用/Blob 清理和气泡渲染11项通过，包含警告图标、缺测数字、过期隐藏、真实零值及大整数。`git diff --check` 通过。

内置浏览器已确认真实三列列表、独立预览、禁用不显示指标、输入/输出/缓冲图标气泡和真实 WebSocket 缺测处理；点击卡片进入原抽屉并恢复 `editorId`，关闭后回到列表，菜单仅保留启停/删除。760px视口重排为单列、内容区无横向溢出；一次刷新列表/预览响应头约51ms/177ms，数值不代表生产延迟。

完整验证仍有环境限制：

- 前端 `vue-tsc --noEmit -p tsconfig.instance-list.json` 被已有跨模块类型错误阻断，本次新增/修改文件无诊断；模块生产构建被现有场景页 `Product.vue` 引用设备 API 未导出的 `queryDeviceProductCategoryTree_api` 阻断。
- 管理模块完整 Maven 构建被现有 things/assets 构件不一致阻断；管理层使用实际依赖及改变源码独立 javac/JUnit 验证，不等同于整个模块重新编译成功。
- 本模块未配置独立 lint 命令；类型检查、行为测试与差异空白检查分别记录，不能替代完整 lint。生产构建的既有阻塞未因本轮字段和展示调整改变，未重复执行同一失败构建。
- 本轮内置浏览器确认真实页面缺测时显示警告图标、已观测副本数、说明及总流转数量入口；当前运行宿主缺少新指标字段，输入/输出、Pending、总流转量保留缺失。需在运行宿主升级后补全数值联调；未对运行中的规则执行启停或部署操作。

重验入口：`pnpm test:instance-list`（包含三个测试文件）、`vue-tsc --noEmit -p tsconfig.instance-list.json`、`pnpm -F jetlinks-web-core build -- --module-name rule-engine-manager-ui`；后端 `mvn -Dtest=RuleInstanceObservationServiceTest test`，上游 reactor 执行 `TaskOutputMetricsTest,TaskRuntimeProjectionTest,TaskExecutionMonitorTest,TaskExecutionMetricsTest,FunctionTaskObservationTest,TaskDumpMetricsRpcTest`。

## 关联交付

- 引擎实现 `0d539595025bc329df3f42f731fb6fd725d49f5c`：[rule-engine #17](https://github.com/jetlinks/rule-engine/pull/17)，基于原 QPS [#16](https://github.com/jetlinks/rule-engine/pull/16)。
- 管理入口 `b2f1874ea7a1e96f646faff8b88ef9f4eecccbe1`：[rule-engine-manager #294](https://github.com/jetlinks-v2/rule-engine-manager/pull/294)，Draft，等待完整依赖验证。
- 页面实现 `91ba2aadf5a2bfc70b5ed66a96e806e66c76ed24`：[rule-engine-manager-ui #164](https://github.com/jetlinks-v2/rule-engine-manager-ui/pull/164)，Draft，等待完整构建与新宿主数值联调。
