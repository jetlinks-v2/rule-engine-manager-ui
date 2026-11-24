<template>
  <div v-if="!disabled && (!compact || !hasValue || runtime?.state !== 'loaded')" class="metric-runtime" :class="{ 'is-compact':compact }">
    <div class="metric-runtime__state">
      <a-tag v-if="compact" :color="runtime?.state === 'failed' ? 'error' : runtime?.state === 'degraded' ? 'warning' : undefined">{{ t(stateKey) }}</a-tag>
      <span v-else class="metric-runtime__status" :class="`is-${runtime?.state || 'unknown'}`"><AIcon :type="stateIcon" />{{ t(stateKey) }}</span>
      <small v-if="runtime?.replicas != null && !compact" class="metric-runtime__replicas"><AIcon type="CopyOutlined" />{{ t(runtime.complete === false ? 'runtimeReplicasKnown' : 'runtimeReplicas', { count: runtime.replicas }) }}</small>
      <small v-if="hasValue && runtime?.state !== 'loaded'">{{ t('lastResult') }}</small>
    </div>
    <dl v-if="runtime && !compact" class="metric-runtime__facts">
      <div v-if="runtime.lastCalculationTime != null"><dt>{{ t('runtimeLastCalculation') }}</dt><dd><time>{{ time(runtime.lastCalculationTime) }}</time></dd></div>
      <div v-if="runtime.lastCalculationFailureTime != null"><dt>{{ t('runtimeLastCalculationFailure') }}</dt><dd><time>{{ time(runtime.lastCalculationFailureTime) }}</time></dd></div>
    </dl>
    <small v-if="runtime?.complete === false && !compact" class="metric-runtime__incomplete">{{ t('runtimeIncomplete') }}</small>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { metricMessages } from './messages'
import type { MetricRuntime } from './types'
import { metricDateText as time } from './time'
const props = defineProps<{ runtime?: MetricRuntime; disabled?: boolean; compact?: boolean; hasValue?: boolean }>()
const { t } = useI18n({ useScope: 'local', messages: metricMessages })
// 就绪和执行事实独立于结果质量；未执行过不显示为计算成功。
const stateKey = computed(() => props.runtime ? { pending: 'runtimePending', loaded: 'runtimeLoaded', failed: 'runtimeFailed', degraded: 'runtimeDegraded', unknown: 'runtimeUnknown' }[props.runtime.state] : 'runtimeUnknown')
const stateIcon = computed(() => ({ loaded:'CheckCircleOutlined',pending:'ClockCircleOutlined',failed:'CloseCircleOutlined',degraded:'ExclamationCircleOutlined',unknown:'QuestionCircleOutlined' }[props.runtime?.state || 'unknown']))
</script>
<style scoped>
.metric-runtime { display:grid; gap:6px; font-size:var(--fs-12,12px); line-height:20px }
.metric-runtime.is-compact { margin-top:4px }
.metric-runtime__state { display:flex; flex-wrap:wrap; align-items:center; gap:4px 16px }
.metric-runtime__status,.metric-runtime__replicas { display:inline-flex; align-items:center; gap:6px }
.metric-runtime__status { color:var(--ink-2) }
.metric-runtime__status.is-loaded :deep(.anticon) { color:var(--success,#389e0d) }
.metric-runtime__status.is-failed :deep(.anticon) { color:var(--danger,#ff4d4f) }
.metric-runtime__status.is-degraded :deep(.anticon) { color:var(--warning,#bf871a) }
.metric-runtime__state small,.metric-runtime__incomplete { color:var(--ink-3); font-size:inherit }
.metric-runtime__facts { display:flex; flex-wrap:wrap; gap:4px 20px; margin:0 }
.metric-runtime__facts>div { display:flex; flex-wrap:wrap; gap:4px 12px }
.metric-runtime__facts dt { color:var(--ink-3) }
.metric-runtime__facts dd { margin:0; color:var(--ink-2); font-variant-numeric:tabular-nums }
</style>
