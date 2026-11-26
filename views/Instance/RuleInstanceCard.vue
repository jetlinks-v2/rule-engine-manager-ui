<template>
  <article class="rule-card" @click="!busy && canOpen && emit('open')">
    <header class="rule-card__head">
      <AIcon class="rule-card__icon" type="BranchesOutlined" />
      <j-permission-button class="rule-card__title" type="link" :title="rule.name"
        :hasPermission="`${permissionKey}:view`" :disabled="busy" @click.stop="emit('open')">{{ rule.name }}</j-permission-button>
      <a-tag :color="enabled ? 'blue' : undefined">{{ enabled ? t('RuleInstanceList.enabled') : rule.state?.value === 'disable' ? t('RuleInstanceList.disabled') : rule.state?.text }}</a-tag>
      <span @click.stop>
        <a-dropdown :trigger="['click']" placement="bottomRight">
          <a-button type="text" :aria-label="t('RuleInstanceList.actions')" :loading="busy"><AIcon type="EllipsisOutlined" /></a-button>
          <template #overlay>
            <a-menu @click="stopMenuClick">
              <a-menu-item key="toggle"><j-permission-button type="text" :disabled="busy" :hasPermission="`${permissionKey}:action`"
                :popConfirm="{ title: t('Instance.index.020452-10', [toggleText]), onConfirm: () => emit('toggle') }">{{ toggleText }}</j-permission-button></a-menu-item>
              <a-menu-item key="delete"><j-permission-button type="text" danger :disabled="busy || rule.state?.value !== 'disable'"
                :hasPermission="`${permissionKey}:delete`" :tooltip="enabled ? { title: t('Instance.index.020452-14') } : undefined"
                :popConfirm="{ title: t('Instance.index.020452-15'), onConfirm: () => emit('delete') }">{{ t('Instance.index.020452-13') }}</j-permission-button></a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </span>
    </header>
    <div class="rule-card__summary"><p v-if="rule.description?.trim()" :title="rule.description">{{ rule.description }}</p></div>
    <j-permission-button class="rule-card__preview" type="text" :hasPermission="`${permissionKey}:view`" :disabled="busy"
      :aria-label="`${t('RuleInstanceList.preview')} ${rule.name}`" @click.stop="emit('open')">
      <a-skeleton-image v-if="!preview || preview.status === 'loading'" active />
      <img v-else-if="preview.url" :src="preview.url" :alt="rule.name" decoding="async" loading="lazy" />
      <span v-else class="rule-card__no-preview"><AIcon type="BranchesOutlined" />{{ t(preview.status === 'failed' ? 'RuleInstanceList.previewFailed' : 'RuleInstanceList.noPreview') }}</span>
    </j-permission-button>
    <footer v-if="enabled" class="rule-card__footer">
      <RuleObservation :runtime="runtime" :stale="stale" :failed="failed" :loading="loading" />
    </footer>
  </article>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRulePermission } from '../../hook/usePermission'
import { useAuthStore } from '@jetlinks-web-core/store'
import type { RuleListItem, RuleRuntimeInfo } from './listTypes'
import type { RulePreview } from './useRulePreviews'
import RuleObservation from './RuleObservation.vue'
const props = defineProps<{ rule: RuleListItem; runtime?: RuleRuntimeInfo; preview?: RulePreview; stale: boolean; failed: boolean; loading: boolean; busy: boolean }>()
const emit = defineEmits<{ open: []; toggle: []; delete: [] }>()
const { t } = useI18n({ useScope: 'parent' })
const permissionKey = useRulePermission()
const auth = useAuthStore()
const canOpen = computed(() => auth.hasPermission(`${permissionKey}:view`))
const enabled = computed(() => props.rule.state?.value === 'started')
const toggleText = computed(() => t(enabled.value ? 'Instance.index.020452-2' : 'Instance.index.020452-9'))
const stopMenuClick = ({ domEvent }: { domEvent: Event }) => domEvent.stopPropagation()
</script>
<style scoped>
.rule-card{height:224px;display:flex;flex-direction:column;min-width:0;border:1px solid var(--line);border-radius:var(--r-3,8px);background:var(--panel-background);overflow:hidden;cursor:pointer}
.rule-card:hover{border-color:var(--accent)}
.rule-card__head{display:flex;align-items:center;gap:6px;padding:8px 6px 0 12px;min-width:0;min-height:40px}
.rule-card__icon{color:var(--accent);font-size:16px;flex:none}
.rule-card__head :deep(.ant-tag){margin-inline-end:0;font-size:12px}
.rule-card__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0;text-align:start;font-size:14px;font-weight:600;color:var(--ink-1)}
.rule-card__summary{height:32px;flex:none;padding:2px 12px 0}
.rule-card__summary p{margin:0;font-size:12px;line-height:16px;color:var(--ink-3);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.rule-card__preview{display:flex;align-items:center;justify-content:center;flex:1;min-height:0;height:auto;min-width:0;margin:4px 12px 8px;padding:6px;border-radius:6px;background:var(--surface-2,var(--panel-background));overflow:hidden}
.rule-card__preview img{width:100%;height:100%;object-fit:contain}
.rule-card__preview :deep(.ant-skeleton-image){height:88px}
.rule-card__no-preview{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-3)}
.rule-card__no-preview :deep(.anticon){font-size:24px;color:var(--ink-4,var(--ink-3))}
.rule-card__footer{display:flex;align-items:center;padding:6px 12px;min-height:32px;border-top:1px solid var(--line);min-width:0;font-size:12px}
</style>
