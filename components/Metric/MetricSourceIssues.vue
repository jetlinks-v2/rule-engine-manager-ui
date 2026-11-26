<template>
  <details v-if="!disabled && (diagnostics.total || abnormal)" class="metric-source-issues" :class="{'is-reference':optionalOnly && !abnormal}" :open="abnormal || !optionalOnly">
    <summary><AIcon :type="optionalOnly && !abnormal ? 'InfoCircleOutlined' : 'ExclamationCircleOutlined'" />{{ t(optionalOnly && !abnormal ? 'issueReferenceNotice' : 'issueDetails') }}<small v-if="diagnostics.total > 1">{{ diagnostics.total }}</small><span v-if="diagnostics.issues[0]" class="metric-source-issues__name">{{ metricIssueName(diagnostics.issues[0],template,t,value?.metricId) }}<template v-if="optionalOnly && !abnormal">：{{ metricIssueReason(diagnostics.issues[0].reason,t) }}</template></span><small v-if="optionalOnly && !abnormal">{{ t('issueContinued') }}</small></summary>
    <ul v-if="diagnostics.issues.length"><li v-for="(issue,index) in diagnostics.issues" :key="`${issue.inputId}:${index}`">
      <div><strong>{{ metricIssueName(issue,template,t,value?.metricId) }}</strong><span>{{ metricIssueReason(issue.reason,t) }}</span></div>
      <small>{{ t(issue.required ? 'issueRequired' : 'issueOptional') }}<template v-if="mapping(issue)"> · {{ t(`issueKind_${mapping(issue)!.kind}`) }}</template><template v-if="issue.eventTime"> · {{ t('sourceTime') }} {{ time(issue.eventTime) }}</template></small>
      <p v-if="metricIssueNextStep(issue.reason,t)">{{ metricIssueNextStep(issue.reason,t) }}</p>
      <a-button v-if="editable && inputId(issue)" type="link" size="small" @click="emit('editSource',inputId(issue)!)">{{ t('issueCheckBinding') }}<AIcon type="RightOutlined" /></a-button>
    </li></ul>
    <p v-else>{{ t('issueNoDetails') }}</p>
    <small v-if="diagnostics.total > diagnostics.issues.length">{{ t('issueTruncated',{count:diagnostics.total - diagnostics.issues.length}) }}</small>
  </details>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import { metricState } from './presentation'
import { metricInputDiagnostics, metricIssueInputId, metricIssueName, metricIssueReason, metricIssueNextStep, type MetricInputIssue } from './sourceDiagnostics'
import type { MetricConfig, MetricTemplate, MetricValue } from './types'
const props=defineProps<{value?:MetricValue;template?:MetricTemplate;configuration?:MetricConfig;editable?:boolean;disabled?:boolean}>()
const emit=defineEmits<{(event:'editSource',inputId:string):void}>()
const {t,locale}=useI18n({useScope:'local',messages:metricMessages})
const diagnostics=computed(()=>metricInputDiagnostics(props.value))
const abnormal=computed(()=>metricState(props.value).tone === 'error')
// 省略/截断的诊断不能被当作可选项；只弱化明确可缺省且已有结果的提示。
const optionalOnly=computed(()=>diagnostics.value.total > 0 && diagnostics.value.total === diagnostics.value.issues.length
  && diagnostics.value.issues.every(issue=>issue.required === false))
const inputId=(issue:MetricInputIssue)=>metricIssueInputId(issue,props.template,props.value?.metricId)
const mapping=(issue:MetricInputIssue)=>{ const id=inputId(issue); return id ? props.configuration?.inputMappings[id] : undefined }
const time=(value:number)=>new Date(value).toLocaleString(String(locale.value))
</script>
<style scoped>
.metric-source-issues { border-radius:var(--r-2,6px); background:var(--bg-sunken); padding:10px 12px; font-size:var(--fs-12,12px); color:var(--ink-2) }
summary { display:flex; align-items:center; flex-wrap:wrap; gap:6px; cursor:pointer; color:var(--ink-2) }
summary :deep(.anticon) { color:var(--color-warning,#faad14) }
.is-reference summary :deep(.anticon) { color:var(--ink-3) }
.metric-source-issues__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:55% }
summary::before { content:'›'; transition:transform .15s }
details[open]>summary::before { transform:rotate(90deg) }
small { color:var(--ink-3) }
p { margin:10px 0 0; line-height:1.6 }
ul { list-style:none; margin:8px 0 0; padding:0 }
li { position:relative; padding:8px 0; border-bottom:1px solid var(--line) }
li>div { display:flex; flex-wrap:wrap; gap:8px }
li:has(.ant-btn)>div { padding-right:100px }
li strong { font-weight:500; color:var(--ink-1) }
li :deep(.ant-btn) { position:absolute; right:0; top:6px; padding-inline:0 }
li:last-child { border-bottom:0; padding-bottom:0 }
</style>
