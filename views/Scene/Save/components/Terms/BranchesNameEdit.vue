<template>
  <a-modal
    visible
    title="编辑"
    :keyboard="false"
    :maskClosable="false"
    @cancel="onCancel"
    @ok="onOk"
  >
    <a-form ref='formRef' layout='vertical' :model="formData">
      <a-form-item label="条件名称" required name="name" :rules="[{ max: 64, message: '最多输入64个字符'}]">
        <a-input v-model:value="formData.name"></a-input>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup name="BranchesNameEdit">
const props = defineProps({
  name: {
    type: String,
    default: undefined
  }
})

const emit = defineEmits(['cancel', 'ok'])

const formData = reactive({
  name: props.name
})
const formRef = ref()


const onCancel = () => {
  emit('cancel')
}

const onOk = async () => {
  const data = await formRef.value.validate()

  if (data) {
    emit('ok', formData.name)
  }
}

</script>

<style scoped>

</style>
