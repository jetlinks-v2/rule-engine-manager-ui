<template>
  <svg
    class="alarm-level-icon"
    :data-level="level"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    role="img"
    :aria-label="alt || t('AlarmPresentation.level', { level: level ?? '—' })"
  >
    <path d="M6.5 16.5V10a5.5 5.5 0 0 1 11 0v6.5M5 17h14M10 20h4M12 2v1" />
    <path d="M12 8v3.5" />
    <circle
      cx="12"
      cy="14"
      r=".8"
      fill="currentColor"
      stroke="none"
    />
  </svg>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'LevelIcon' })
defineProps<{ level?: number; alt?: string }>()
const { t } = useI18n()
</script>
<style scoped>
.alarm-level-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
  color: var(--ink-2, #999);
}
/* Preserve the platform's five severity colors; current alarm state is a separate badge. */
.alarm-level-icon[data-level='1'] {
  color: var(--alarm-level-1, #e50012);
}
.alarm-level-icon[data-level='2'] {
  color: var(--alarm-level-2, #ff9457);
}
.alarm-level-icon[data-level='3'] {
  color: var(--alarm-level-3, #fabd47);
}
.alarm-level-icon[data-level='4'] {
  color: var(--alarm-level-4, #999);
}
.alarm-level-icon[data-level='5'] {
  color: var(--alarm-level-5, #bbb);
}
</style>
