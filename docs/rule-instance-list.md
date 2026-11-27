# 规则编排列表与运行观测

运行时 `/rule-engine/Instance` 使用紧凑卡片展示规则名称、启用状态与流程预览。点击卡片进入原编排抽屉，保留 `editorId` 深链接、条件筛选、新增、启停和删除；列表不另设编辑操作。没有说明时不显示占位。

规则名称保持单行，从开头显示并在末尾省略；悬停或键盘聚焦标题可查看完整名称。顶部按图标、可收缩标题和固定宽度操作按钮排列。启用／禁用以底部状态图标呈现，与运行观测共用信息行，不使用状态标签；图标提示当前状态及可执行动作，点击复用启停确认和动作权限，提交期间禁用。

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

输入/输出分别汇总没有普通或事件上游/下游的节点，直接读取任务连接关系，不存额外 start/end 标记。默认 `AbstractOutput` 继承 `RateMeter`，直接在自身对象中承载统计字段，`Output.getMetrics()` 只在查询时生成快照；无独立 meter 或观测包装。无下游终端在 `write(data)` 调用时计数，直接返回共享 `Reactors.ALWAYS_TRUE`，重复订阅该返回值不重复计数；流式写出按消费到的数据逐条调用 write，有下游时沿原发送链计量。多入口或多末端可能重复计量同一业务事件。速率是60秒时间常数的 EWMA，5秒惰性推进、首次节拍前为0，单位条/秒；不是精确的一分钟窗口均值，也不表示下游系统写入成功。执行开始次数继续沿原统计契约，不能冒充数据条数。

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

运行端须先装载允许继承 `RateMeter` 的新 core，再升级引擎；旧 final 版本的 core 无法加载新的 `AbstractOutput`。边界沿已有连接读取，无需为观测额外重新编译规则。旧节点或自定义 Output 没有对应能力时保留缺失；Output 装饰器应转交被装饰对象的指标。没有任务且完整读取成功时可明确返回0。

## 成本与验证边界

不增加逐次执行记录、历史存储、定时器线程、全局指标注册表或新依赖。每个 Output 在自身继承字段中维护发出累计及速率，同时供入口/末端两种角色读取；Pending 只在查询时扫描。

JDK21、256MiB堆的Instrumentation测量：默认Output对象88B，统计字段继承自RateMeter，不单独分配meter。Output直接保存预编译路由，由write执行终端及有下游逻辑，移除聚合writer lambda和仅用于组装的outputs/evaluator字段。相对此次精简前，终端Output及聚合函数112→88B，有下游120→88B；不含两版相同的预编译Flux、路由函数及共享类元数据。相对原QPS版本，仅Output部分的增量分别为终端56B、有下游32B。执行监控器由原监控器及独立meter合计112B降至96B，每任务少一个对象、节省16B。执行指标快照56B，查询Output另分配32B只读快照，不在写出热路径分配。

对同一Output.write(data).block探针，终端分配维持约0B/次；单路本地EventBus写出的分配1872→1760B/次，耗时439.58±84.79→438.79±6.85ns/op；终端耗时均约10.69ns/op。JDK21/256MiB、单线程单fork、预热2轮/测量3轮、每轮1秒。分配量仅描述该探针及JIT结果，不能据此推导所有条件路由或业务图每条数据均节省112B。

Input 保留原确认和回调适配，不新增接收计数器。数据及监听器通过惰性载体交给原 `observeExecution(Mono)` 扩展入口，默认监控器将其融合成一个订阅边界；自定义上下文装饰或透传该入口仍生效，不提前调用监听器。

同一监控器直接相邻的观察返回原Mono；惰性回调在订阅时直接遇到同监控器观察点，也复用已有订阅器。隔着错误恢复等算子时保留轻量订阅器，共享根执行的失败状态，保持原Context及请求、取消和终止保护。根订阅器和嵌套订阅器均由40B降至32B，根状态仍按每次订阅独立创建。

相对嵌套融合前的同一引擎构件（d1e3b39），同一默认上下文JMH探针的分配量如下：

| 路径 | 融合前 B/次 | 融合后 B/次 |
| --- | ---: | ---: |
| 直接相邻重复观察 | 256 | 184 |
| 惰性回调内直接相邻观察 | 232 | 184 |
| 跨错误恢复算子的嵌套观察 | 272 | 256 |
| 单层有限执行 | 192 | 184 |
| 空输入回调 | 192 | 184 |

JDK21/256MiB堆，每项单线程单fork，预热2轮/测量3轮、每轮1秒，启用GC profiler。另对单层执行、空输入和跨恢复路径反转顺序，以预热3轮/测量5轮复核；单层执行与空输入的耗时和基线误差区间重叠，嵌套耗时存在大幅波动，不作生产吞吐或时延改善承诺。没有新增逐消息统计状态、全局缓存或对象池。

验证结果：引擎35项定向测试、reactor编译及本地install通过，新增条件输出只投递匹配数据、过滤前计数及终端空配置/并发共享返回值验证；相邻观察幂等、动态相邻Context/背压/取消、重复订阅及恢复前错误独立计量、真实双节点RPC、EventBus缓冲2→0、不同监控器隔离和原扩展入口仍通过。QueueInput使用真实实现及可控队列流，不等同于外部队列集群测试。core4项、管理层7项、前端11项测试复用相关源码及协议未改变的前阶段证据，未重复执行。`git diff --check` 通过。

内置浏览器已确认真实三列列表、独立预览、禁用不显示指标、输入/输出/缓冲图标气泡和真实 WebSocket 缺测处理；点击卡片进入原抽屉并恢复 `editorId`，关闭后回到列表，菜单仅保留启停/删除。760px视口重排为单列、内容区无横向溢出；一次刷新列表/预览响应头约51ms/177ms，数值不代表生产延迟。

完整验证仍有环境限制：

- 前端 `vue-tsc --noEmit -p tsconfig.instance-list.json` 被已有跨模块类型错误阻断，本次新增/修改文件无诊断；模块生产构建被现有场景页 `Product.vue` 引用设备 API 未导出的 `queryDeviceProductCategoryTree_api` 阻断。
- 管理模块完整 Maven 构建被现有 things/assets 构件不一致阻断；管理层使用实际依赖及改变源码独立 javac/JUnit 验证，不等同于整个模块重新编译成功。
- 本模块未配置独立 lint 命令；类型检查、行为测试与差异空白检查分别记录，不能替代完整 lint。生产构建的既有阻塞未因本轮字段和展示调整改变，未重复执行同一失败构建。
- 前阶段内置浏览器已确认真实页面缺测时显示警告图标、已观测副本数、说明及总流转数量入口；该次验证的运行宿主缺少新指标字段，输入/输出、Pending、总流转量保留缺失。仍需补全升级后的数值联调，本次内部观测融合没有重新验证或部署运行宿主。

重验入口：`pnpm test:instance-list`（包含三个测试文件）、`vue-tsc --noEmit -p tsconfig.instance-list.json`、`pnpm -F jetlinks-web-core build -- --module-name rule-engine-manager-ui`；后端 `mvn -Dtest=RuleInstanceObservationServiceTest test`，上游 reactor 执行 `TaskOutputMetricsTest,TaskRuntimeProjectionTest,TaskExecutionMonitorTest,TaskExecutionMetricsTest,FunctionTaskObservationTest,TaskDumpMetricsRpcTest,QueueInputObservationTest`。

## 关联交付

- core继承支持：[jetlinks-core #130](https://github.com/jetlinks/jetlinks-core/pull/130)，已合并至 `9bad5a4c6882d1029b759a8f51590f7f9a88292d`，运行构件须包含该变更。
- 引擎实现 `22a5ff10e21089bcc02cda502c7ee6c1de8607de`：[rule-engine #17](https://github.com/jetlinks/rule-engine/pull/17)，基于原 QPS [#16](https://github.com/jetlinks/rule-engine/pull/16)，并依赖 core继承支持。
- 管理入口 `b2f1874ea7a1e96f646faff8b88ef9f4eecccbe1`：[rule-engine-manager #294](https://github.com/jetlinks-v2/rule-engine-manager/pull/294)，Draft，等待完整依赖验证。
- 页面实现 `91ba2aadf5a2bfc70b5ed66a96e806e66c76ed24`：[rule-engine-manager-ui #164](https://github.com/jetlinks-v2/rule-engine-manager-ui/pull/164)，Draft，等待完整构建与新宿主数值联调。
