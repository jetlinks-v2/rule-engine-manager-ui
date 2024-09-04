<template>
  <img :src="src" />
</template>

<script setup>
import { configImages } from '../../views/Alarm/Config/data';
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
