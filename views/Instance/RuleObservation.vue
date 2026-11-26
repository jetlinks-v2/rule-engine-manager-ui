<template>
  <a-popover :trigger="['hover', 'focus', 'click']" placement="topLeft">
    <template #content>
      <div class="rule-observation__detail">
        <div class="rule-observation__status" :style="{ color }"><AIcon :type="icon" :spin="loading" /> {{ statusText }}</div>
        <dl>
          <dt :title="t('RuleInstanceList.inputHelp')"><AIcon type="DownloadOutlined" /> {{ t('RuleInstanceList.inputRate') }}</dt><dd><a-skeleton-input v-if="loading" active size="small" /><template v-else>{{ rate(runtime?.inputRate) }} {{ t('RuleInstanceList.perSecond') }}</template></dd>
          <dt :title="t('RuleInstanceList.outputHelp')"><AIcon type="UploadOutlined" /> {{ t('RuleInstanceList.outputRate') }}</dt><dd>{{ rate(runtime?.outputRate) }} {{ t('RuleInstanceList.perSecond') }}</dd>
          <dt :title="t('RuleInstanceList.bufferHelp')"><AIcon type="InboxOutlined" /> {{ t('RuleInstanceList.buffered') }}</dt><dd>{{ ready ? runtime?.buffered ?? '—' : '—' }}</dd>
          <dt :title="t('RuleInstanceList.replicasHelp')">{{ t('RuleInstanceList.replicas') }}</dt><dd>{{ ready ? `${runtime?.runningReplicas}/${runtime?.totalReplicas}` : '—' }}</dd>
          <dt :title="t('RuleInstanceList.errorsHelp')">{{ t('RuleInstanceList.totalErrors') }}</dt><dd>{{ ready ? runtime?.errorCount ?? '—' : '—' }}</dd>
          <dt :title="t('RuleInstanceList.recentHelp')">{{ t('RuleInstanceList.recent') }}</dt><dd>{{ ready && runtime?.lastExecutionTime ? dayjs(runtime.lastExecutionTime).format('MM-DD HH:mm:ss') : '—' }}</dd>
        </dl>
        <small>{{ t('RuleInstanceList.smoothed') }}</small>
      </div>
    </template>
    <button type="button" class="rule-observation" :style="{ color }" :aria-label="`${t('RuleInstanceList.runtimeDetails')}: ${statusText}`" @click.stop>
      <AIcon :type="icon" :spin="loading" :style="{ color }" />
      <template v-if="ready">
        <span :title="t('RuleInstanceList.inputRate')"><AIcon type="DownloadOutlined" /> {{ rate(runtime?.inputRate) }}<small>/s</small></span>
        <span :title="t('RuleInstanceList.outputRate')"><AIcon type="UploadOutlined" /> {{ rate(runtime?.outputRate) }}<small>/s</small></span>
        <span :title="t('RuleInstanceList.buffered')" :style="Number(runtime?.buffered) > 0 ? { color: token.colorWarning } : undefined"><AIcon type="InboxOutlined" /> {{ runtime?.buffered ?? '—' }}</span>
      </template>
      <span v-else>{{ statusText }}</span>
    </button>
  </a-popover>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { theme } from 'ant-design-vue'
import dayjs from 'dayjs'
import type { RuleRuntimeInfo } from './listTypes'
const props = defineProps<{ runtime?: RuleRuntimeInfo; stale: boolean; failed: boolean; loading: boolean }>()
const { t } = useI18n({ useScope: 'parent' })
const { token } = theme.useToken()
const ready = computed(() => !props.stale && !props.failed && props.runtime?.observationStatus === 'ready')
const state = computed(() => props.loading ? 'loading' : props.failed || !props.runtime ? 'unavailable' : props.stale ? 'stale'
  : props.runtime.observationStatus === 'partial' ? 'observationPartial' : props.runtime.observationStatus !== 'ready' ? props.runtime.observationStatus : props.runtime.runtimeState)
const statusText = computed(() => t(`RuleInstanceList.status.${state.value}`))
const color = computed(() => state.value === 'running' ? token.value.colorSuccess
  : ['partial', 'observationPartial', 'paused'].includes(state.value) ? token.value.colorWarning : token.value.colorTextTertiary)
const icon = computed(() => state.value === 'loading' ? 'SyncOutlined' : state.value === 'running' ? 'PlayCircleOutlined'
  : state.value === 'paused' ? 'PauseCircleOutlined' : ['partial', 'observationPartial'].includes(state.value) ? 'WarningOutlined'
    : state.value === 'stopped' ? 'StopOutlined' : 'QuestionCircleOutlined')
const rate = (value?: number | null) => ready.value && value != null ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'
</script>
<style scoped>
.rule-observation{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:0;border:0;background:none;font:inherit;font-size:12px;cursor:pointer}
.rule-observation:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
.rule-observation>span{display:inline-flex;align-items:center;gap:3px;color:var(--ink-3)}
.rule-observation>span+span{margin-inline-start:3px}
.rule-observation small{font-size:10px}
.rule-observation__detail{width:248px;font-size:12px}
.rule-observation__status{display:flex;align-items:center;gap:6px;margin-bottom:12px;font-size:13px;font-weight:500}
.rule-observation__detail dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:0}
.rule-observation__detail dt{color:var(--ink-3);font-weight:400}
.rule-observation__detail dd{margin:0;text-align:end;font-variant-numeric:tabular-nums}
.rule-observation__detail small{display:block;color:var(--ink-3);margin-top:10px}
.rule-observation__detail :deep(.ant-skeleton-input){width:60px;min-width:60px;height:16px}
</style>
