<template>
  <a-button v-if="advanced" type="text" size="small" :disabled="disabled" @click="emit('business')"><AIcon type="ArrowLeftOutlined" />{{ t('business') }}</a-button>
  <a-dropdown v-else :trigger="['click']" :disabled="disabled" :get-popup-container="formulaPopupContainer"><a-button type="text" size="small" :disabled="disabled" :aria-label="t('more')"><AIcon type="EllipsisOutlined" /></a-button><template #overlay><a-menu><a-menu-item :disabled="!canAdvance" @click="canAdvance && emit('advanced')"><AIcon type="CodeOutlined" /> {{ t('advanced') }}</a-menu-item></a-menu></template></a-dropdown>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { editorMessages } from '@jetlinks-web-core/components/Expression/editorMessages'
import { formulaPopupContainer } from './formula'
defineProps<{disabled?:boolean;advanced:boolean;canAdvance:boolean}>()
const emit=defineEmits<{(event:'advanced'):void;(event:'business'):void}>()
const {t}=useI18n({useScope:'local',messages:editorMessages})
</script>
