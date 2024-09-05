<template>
  <img :src="src" />
</template>

<script setup>
import { configImages } from '../../assets/index';
defineOptions({
  name: 'LevelIcon'
})

const props = defineProps({
  level: {
    type: Number,
    default: undefined
  }
})

const src = computed(() => {
  return configImages.alarm[props.level]
})


</script>

<style scoped>

</style>
