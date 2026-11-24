<template>
  <slot v-if="failed" name="fallback" />
  <component :is="content" v-else v-bind="{ ...contentProps, ...$attrs }" />
</template>
<script setup lang="ts">
import { onErrorCaptured, ref, watch, type Component } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ content: Component; contentProps: Record<string, unknown> }>()
const emit = defineEmits<{ (event: 'failed'): void }>()
const failed = ref(false)
onErrorCaptured(() => { failed.value = true; emit('failed'); return false })
watch(() => props.content, () => { failed.value = false })
</script>
