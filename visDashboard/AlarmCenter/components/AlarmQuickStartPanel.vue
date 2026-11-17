<template>
  <CloudEmpty v-if="!actions.length" :description="t('alarmDashboard.noQuickActions')" />
  <div v-else class="alarm-quick-grid" :style="gridStyle">
    <div v-for="action in actions" :key="action.key" class="alarm-quick-action" :class="{ 'is-disabled': action.disabled }">
      <a-button class="alarm-quick-navigation" html-type="button" :aria-label="t('alarmDashboard.action.' + action.key)"
        :disabled="action.disabled" @click="$emit('open', action.key)" />
      <span class="alarm-quick-icon" :class="'alarm-quick-icon-' + action.key" aria-hidden="true"><AIcon :type="action.icon" /></span>
      <span class="alarm-quick-copy">
        <strong><JEllipsis :tooltip="false">{{ t('alarmDashboard.action.' + action.key) }}</JEllipsis><span class="alarm-quick-help" @pointerdown.stop @mousedown.stop><DocumentHelp code="rule-engine/DashBoard" :help-key="`quickStart.${action.key}`" /></span></strong>
        <small><JEllipsis :tooltip="false">{{ t('alarmDashboard.actionDescription.' + action.key) }}</JEllipsis></small>
      </span>
      <RightOutlined class="alarm-quick-arrow" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { Ellipsis as JEllipsis } from '@jetlinks-web/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RightOutlined } from '@ant-design/icons-vue'
import DocumentHelp from '@jetlinks-web-core/components/DocumentHelp'
import type { AlarmQuickAction } from '../dashboard.types'
const props = defineProps<{ actions: AlarmQuickAction[] }>()
defineEmits<{ open: [key: string] }>()
const { t } = useI18n()
const gridStyle = computed(() => ({
  '--alarm-action-rows': Math.max(1, Math.ceil(props.actions.length / 2)),
  '--alarm-action-narrow-rows': Math.max(1, props.actions.length),
}))
</script>
<style scoped>
.alarm-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(var(--alarm-action-rows), minmax(0, 1fr));
  gap: 10px 12px;
  height: 100%;
  min-height: 0;
}
.alarm-quick-action:last-child:nth-child(odd) { grid-column: 1 / -1; }
.alarm-quick-action {
  position: relative;
  display: flex;
  align-items: center;
  text-align: left;
  padding: 8px 14px;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  white-space: normal;
  border: 1px solid #e5effd;
  border-radius: 4px;
  box-shadow: none;
  background: linear-gradient(90deg, #f0f6ff 0%, #fcfeff 100%);
  transition: background-color .2s, border-color .2s, box-shadow .2s, color .2s;
  box-sizing: border-box;
}
.alarm-quick-action:not(.is-disabled):hover {
  background: #eef5ff;
  border-color: #bfd8ff;
  box-shadow: 0 2px 8px rgb(30 114 240 / 8%);
}
.alarm-quick-action:not(.is-disabled):hover strong,
.alarm-quick-action:not(.is-disabled):hover .alarm-quick-arrow { color: #1e72f0; }
/* 导航铺满卡片，帮助为兄弟按钮；文本穿透点击，帮助独立接收事件。 */
.alarm-quick-navigation { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; border-radius: inherit; box-shadow: none; }
.alarm-quick-action .alarm-quick-navigation, .alarm-quick-action .alarm-quick-navigation:disabled, .alarm-quick-action .alarm-quick-navigation:hover { background: transparent; }
.alarm-quick-navigation:focus-visible { outline: 2px solid #1677ff; outline-offset: -2px; }
.alarm-quick-action.is-disabled { color: var(--jet-theme-text-disabled); opacity: .6; }
.alarm-quick-icon, .alarm-quick-copy, .alarm-quick-arrow { position: relative; pointer-events: none; }
.alarm-quick-help { display: inline-flex; pointer-events: auto; flex: none; }
.alarm-quick-icon {
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  margin-right: 12px;
  border-radius: 6px;
  font-size: 16px;
  color: #fff;
  background: linear-gradient(135deg, #8cbbff, #2c7af8);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 35%);
}
.alarm-quick-icon-visionRules,
.alarm-quick-icon-channels { background: linear-gradient(135deg, #8ee4ff, #18b3ee); }
.alarm-quick-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; justify-content: center; }
strong {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: #1d2129;
  transition: color .2s;
}
small {
  color: #86909c;
  font-size: 12px;
  line-height: 16px;
  margin-top: 2px;
}
.alarm-quick-arrow { flex: none; color: #c9cdd4; font-size: 12px; margin-left: 8px; transition: color .2s; }
@container alarm-widget (max-width: 480px) {
  .alarm-quick-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: repeat(var(--alarm-action-narrow-rows), minmax(0, 1fr));
    gap: 8px;
  }
  .alarm-quick-action { padding: 6px 10px; }
  .alarm-quick-icon { flex-basis: 28px; width: 28px; height: 28px; margin-right: 8px; }
  .alarm-quick-arrow { display: none; }
}
</style>
