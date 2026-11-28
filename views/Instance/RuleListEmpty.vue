<template>
  <section class="rule-list-empty">
    <CloudEmpty :type="hasSearch ? 'default' : 'page'" :search="search" :search-name="t('EmptyCreate.names.rules')" :image-style="{ height: '112px' }">
      <template #description>
        <h2 class="rule-list-empty__title">{{ t('RuleInstanceList.emptyTitle') }}</h2>
        <p class="rule-list-empty__description">{{ t('RuleInstanceList.emptyDescription') }}</p>
      </template>
      <a-space wrap style="justify-content:center">
        <j-permission-button type="primary" :hasPermission="`${permissionKey}:add`" @click="$emit('templates')">{{ t('RuleInstanceList.createFromTemplate') }}</j-permission-button>
        <j-permission-button :hasPermission="`${permissionKey}:add`" @click="$emit('blank')">{{ t('RuleInstanceList.createBlank') }}</j-permission-button>
      </a-space>
      <p class="rule-list-empty__hint">{{ t('RuleInstanceList.createHint') }}</p>
    </CloudEmpty>
    <a-button v-if="hasSearch" @click="$emit('clear-search')">{{ t('RuleInstanceList.clearSearch') }}</a-button>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CloudEmpty from '@jetlinks-web-core/components/CloudEmpty/index.vue'
import { useEmptyCreateState, type EmptyCreateSearch } from '@jetlinks-web-core/hooks/useEmptyCreateState'
import { ruleListMessages } from './listMessages'

const props = defineProps<{ search?: EmptyCreateSearch; permissionKey: string }>()
defineEmits<{ (event: 'templates' | 'blank' | 'clear-search'): void }>()
const { t } = useI18n({ useScope: 'local', messages: ruleListMessages })
const { hasSearch } = useEmptyCreateState(() => props.search)
</script>

<style scoped>
.rule-list-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:100%; padding:24px 0; box-sizing:border-box; }
.rule-list-empty__title { margin:0 0 8px; color:var(--ink-1); font-size:var(--fs-20); font-weight:600; line-height:1.4; }
.rule-list-empty__description { max-width:32rem; margin:0 auto 20px; color:var(--ink-2); line-height:1.6; }
.rule-list-empty__hint { margin:12px 0 0; color:var(--ink-2); font-size:var(--fs-12); }
</style>
