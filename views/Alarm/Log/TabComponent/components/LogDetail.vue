<template>
  <a-modal
    visible
    okText="确定"
    cancelText="取消"
    :width="1000"
    title="告警日志"
    :closable="true"
    @ok="closeModal"
    @cancel="closeModal"
  >
    <div class="alarmInfo">
      <span class="alarmTitle">{{ data?.alarmConfigName }}</span>
      <span class="alarmTime">{{
        dayjs(data?.alarmTime).format("YYYY-MM-DD HH:mm:ss")
      }}</span>
    </div>
    <a-descriptions bordered :column="2">
      <a-descriptions-item label="触发条件" :span="2">{{
        data?.triggerDesc
      }}</a-descriptions-item>
      <a-descriptions-item label="告警原因" :span="2">{{
        data?.actualDesc
      }}</a-descriptions-item>
      <a-descriptions-item label="告警源" :span="2">
        <div v-if="data.targetType === 'device'">
          设备ID：<a-button
          type="link"
          @click="() => gotoDevice(data?.sourceId)"
        >{{ data?.sourceId }}</a-button
        >
        </div>
        <div v-else>
          场景联动ID：<a-button
          type="link"
          @click="() => gotoRule(data)"
        >{{ data?.sourceId }}</a-button
        >
        </div>
      </a-descriptions-item>
      <a-descriptions-item label="告警流水" :span="2"
        ><div style="max-height: 500px; overflow-y: auto">
          <JsonViewer
            :value="JSON.parse(data?.alarmInfo)"
            :expanded="true"
            :expandDepth="4"
          ></JsonViewer></div
      ></a-descriptions-item>
    </a-descriptions>
  </a-modal>
</template>

<script setup>
import dayjs from "dayjs";
import JsonViewer from "vue3-json-viewer";
import { useMenuStore } from "@/store/menu";
const props = defineProps({
  data: Object,
});
const menuStory = useMenuStore();
const runningWater = computed(() => {
  return JSON.parse(props.data?.alarmInfo);
});

const emit = defineEmits(["close"]);
const closeModal = () => {
  emit("close");
};
const gotoDevice = (id) => {
  menuStory.jumpPage("device/Instance/Detail", {
    params: { id, tab: "Running" },
  });
};

const gotoRule = (record) => {
  menuStory.jumpPage(
    'rule-engine/Scene/Save',
    {
      query: { triggerType:record.sourceName==='定时触发'?'timer':'manual', id:record.sourceId, type: 'view' },
    }
  );
}
</script>
<style lang="less" scoped>
.alarmInfo {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  .alarmTitle {
    font-weight: 600;
    font-size: 16px;
    color: #1a1a1a;
  }
  .alarmTime {
    font-size: 14px;
  }
}
</style>
