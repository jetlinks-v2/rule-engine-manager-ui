<template>
  <a-modal
    :maskClosable="false"
    width="45vw"
    title="编辑"
    @cancel="close"
    @ok="save"
    visible
    cancelText="取消"
    okText="确定"
  >
    <a-form layout="vertical" :model="outputData" ref="formRef">
      <a-form-item label="状态">
        <a-switch
          checked-children="启用"
          un-checked-children="启用"
          v-model:checked="outputData.status"
        ></a-switch>
      </a-form-item>
      <a-form-item
        v-if="outputData.status"
        label="kafka地址"
        name="address"
        :rules="[
          {
            required: true,
            message: '请输入kafka地址',
          },
          {
            max: 64,
            message: '最多输入64个字符',
          },
        ]"
      >
        <a-input
          v-model:value="outputData.address"
          placeholder="请输入kafka地址"
        ></a-input>
      </a-form-item>
      <a-form-item
        v-if="outputData.status"
        label="topic"
        name="topic"
        :rules="[
          {
            required: true,
            message: '请输入topic',
          },
          {
            max: 64,
            message: '最多输入64个字符',
          },
        ]"
      >
        <a-input v-model:value="outputData.topic"></a-input>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script lang="ts" setup>
import { saveOutputData } from "../../../../../api/config";
import { onlyMessage } from "@jetlinks-web/utils";
const formRef = ref();
const props = defineProps({
  data: {
    default: "",
  },
});
let outputData = reactive({
  status: false,
  address: "",
  topic: "",
});
watchEffect(() => {
  outputData.status =
    props.data?.data?.state?.value === "enabled" ? true : false;
  outputData.address = props.data?.data?.config?.config?.address;
  outputData.topic = props.data?.data?.config?.config?.topic;
});

const close = () => {
  emit("closeModel");
};
const save = () => {
  formRef.value.validateFields().then(() => {
    saveOutputData({
      config: {
        sourceType: "kafka",
        config: {
          ...outputData,
          state: outputData?.status ? "enabled" : "disable",
        },
      },
      state: outputData?.status ? "enabled" : "disable",
      id: props?.data?.data?.id,
      sourceType: "kafka",
      exchangeType: "producer",
    }).then((res) => {
      if (res.status === 200) {
        onlyMessage("操作成功");
        emit("saveSuc");
      }
    });
  });
};
const emit = defineEmits(["closeModel", "saveSuc"]);
</script>
<style lang="less" scoped></style>
