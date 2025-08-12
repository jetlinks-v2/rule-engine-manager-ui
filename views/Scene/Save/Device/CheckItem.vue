<template>
  <slot></slot>
</template>

<script setup lang="ts" name="CheckItem">
import { storeToRefs } from "pinia";
import { useSceneStore } from "@ruleEngine/store/scene";
import { Form } from "ant-design-vue";
import {
  queryProductList,
  detail as deviceDetailQuery,
  queryNoPagingPost,
} from "@ruleEngine/api/others";
import { getTreeData_api } from "@ruleEngine/api/department";
import {query as channelQuery} from '@ruleEngine/api/channel'
import {queryCollector, queryPointNoPagingV2} from '@ruleEngine/api/collector'

const sceneStore = useSceneStore();
const { data } = storeToRefs(sceneStore);
const formItemContext = Form.useInjectFormItemContext();

const formTouchOff = () => {
  formItemContext.onFieldChange();
};

const check = async (): Promise<boolean> => {
  return ! data.value.trigger!.device!.changeData;
};

const checkCollector = async (): Promise<boolean> => {

  const channelResp = await channelQuery({ terms: [{ column: 'id', value: data.value.options.channelId }] })

  if (channelResp.success && !channelResp.result.data.length) {
    data.value.options.channelId = ""
    return false
  }

  const collectorResp = await queryCollector({ terms: [{ column: 'id', value: data.value.trigger!.collector!.pointSelectInfo.collectorId }] });

  if (collectorResp.success && !collectorResp.result.data.length) {
    data.value.trigger!.collector!.pointSelectInfo.collectorId = ''
    return true
  }

  const pointResp = await queryPointNoPagingV2({
    terms: [
      {
        column: 'collectorId',
        value: data.value.trigger!.collector!.pointSelectInfo.collectorId,
      }
    ]
  })

  if (pointResp.success && data.value.trigger?.collector) {
    const pointSet = new Set(pointResp.result.map((item: any) => item.id))
    const result = data.value.trigger?.collector?.pointSelectInfo.pointIds.every(p => pointSet.has(p))

    if (!result) {
      data.value.trigger.collector!.pointSelectInfo.pointIds = []
    }

    return !!result
  }

  return true
}

const checkInit = async () => {
  let checkStatus = true

  if (data.value.trigger?.device) {
    checkStatus = await check();

  } else if (data.value.trigger?.collector) {
    checkStatus = await checkCollector();
  } else if (data.value.trigger?.multiDevice) {
    checkStatus = !data.value.trigger!.multiDevice.triggers.some(item => item.changeData);
  }

  if (!checkStatus) {
    formTouchOff();
  }
};

checkInit();
</script>

<style scoped></style>
