<script setup lang="ts">
import {randomString} from "@jetlinks-web/utils";

const props = defineProps({
  value: String,
})

const emit = defineEmits(['search', 'update:value'])
const searchId = randomString(8)
const searchInputRef = ref()
const measureRef = ref()
const inputValue = ref()
const inputWidth = ref()

let blurTimeout

const onChange = (e) => {
  inputValue.value = e.target.value
  emit("search", e.target.value)
  emit("update:value", e.target.value)
}

const onBlur = () => {
  blurTimeout = setTimeout(() => {
    searchInputRef.value.value = ''
    inputValue.value = ''
    emit("search", inputValue.value)
    emit("update:value", inputValue.value)
  }, 300)
}

const onFocus = () => {
  clearTimeout(blurTimeout)
  searchInputRef.value.focus()
}

onMounted(() => {
  watch(
    inputValue,
    () => {
      inputWidth.value = measureRef.value.scrollWidth;
    },
    { flush: 'post', immediate: true },
  );
});

defineExpose({
  focus: () => {
    onFocus()
  },
})
</script>

<template>
  <div class="label-search" :style="{width: inputWidth + 'px'}">
    <input
      ref="searchInputRef"
      :id="searchId"
      class="label-search-input"
      type="search"
      autocomplete="off"
      @input="onChange"
      @focus="onFocus"
      @blur="onBlur"
    />
    <span class="search-mirror" ref="measureRef">
      {{ inputValue }}&nbsp;
    </span>
  </div>
</template>

<style scoped lang="less">
.label-search {
  position: relative;
  .label-search-input {
    cursor: auto;
    margin: 0;
    padding: 0;
    background: transparent;
    border: none;
    outline: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    width: 100%;
    outline-offset: -2px;
  }

  .search-mirror {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 999;
    white-space: pre;
    visibility: hidden;
  }
}
</style>
