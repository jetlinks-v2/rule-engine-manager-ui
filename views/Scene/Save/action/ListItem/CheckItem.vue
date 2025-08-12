<template>
  <slot />
</template>

<script setup lang="ts" name="ActionCheckItem">
import type { PlatformRelation } from "../../../typings";
import { useSceneStore } from "@ruleEngine/store/scene";
import { storeToRefs } from "pinia";
import {
  queryProductList,
  getRelationUsers,
  queryNoticeList,
  queryDingTalkUsers,
  queryWechatUsers,
  dingTalkDept,
  weChatDept,
  queryTemplateList,
  getTemplateDetail,
  getTags,
  detail as getDeviceDetail,
  queryNoPagingPost
} from "@ruleEngine/api/others";
import {query as ChannelQuery} from '@ruleEngine/api/channel'
import {queryCollector, queryPointNoPagingV2} from '@ruleEngine/api/collector'
import { validateAction } from '@ruleEngine/api/scene'
import { Form } from "ant-design-vue";
import {
  Branche_Index,
  EventEmitter,
  EventSubscribeKeys,
  getParams, Then_Index,
  Then_Action_Index
} from "../../util";
import { getOption } from "../../components/DropdownButton/util";
import { getBuildInData, getNotifyVariablesUser } from "./util";
import { defineExpose } from "vue";
import { useI18n } from 'vue-i18n'
import {get, isArray, set} from "lodash-es"

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data: _data } = storeToRefs(sceneStore);

const formItemContext = Form.useInjectFormItemContext();

const props = defineProps({
  branchesName: {
    type: Number,
    default: 0,
  },
  thenName: {
    type: Number,
    default: 0,
  },
  name: {
    type: Number,
    default: 0,
  },
});

const sub = ref();

const branchIndex = inject<number>(Branche_Index, 0)
const thenIndex = inject<number>(Then_Index, 0)
const actionIndex = inject<number>(Then_Action_Index, 0)

const actionNamePath: [number, string, number, string, number] = [branchIndex, "then", thenIndex, "actions", actionIndex]
const actionItem = get(_data.value.branches, actionNamePath)

let buildInGetter: ((k: string, key: string) => any) | null = null;

const formTouchOff = () => {
  formItemContext.onFieldChange();
};

const clearField  = (target: any, fieldNames: string | string[], value: any = undefined) => {
  const path = isArray(fieldNames) ? fieldNames : [fieldNames]
  set(target, path, value)
  target.changeData = true
}

const updateDeviceField = (fieldNames: string | string[], value?: any) => {
  const item = actionItem.device;
  clearField(item,fieldNames, value)
}

const updateDeviceInfoField = (fieldNames: string | string[], value?: any) => {
  const item = actionItem.configuration;
  clearField(item,fieldNames)
}

/**
 * 消息校验
 */
const updateNotifyField = (fieldNames: string | string[], value?: any) => {
  const item = actionItem.notify;
  clearField(item,fieldNames, value)
}

const updateCollectorField = (fieldNames: string | string[], value?: any) => {
  const item = actionItem.collector;
  clearField(item,fieldNames, value)
}

/**
 * 设备校验
 * @param ids
 */
const validateDevice = async (ids: string[] = []): Promise<boolean> => {
  const resp = await queryNoPagingPost({terms: [{ column: "id", termType: "in", value: ids.toString() }]});
  return resp.success && resp.result.length === ids.length;
}

const handleRelation = async (target: any, pathNames: string | string[], errField: (pathNames: string | string[]) => void) => {
  const _relationValue = (target.selectorValues?.[0]?.value as any)?.relation;
  const resp = await getRelationUsers({
    paging: false,
    sorts: [{ name: "createTime", order: "desc" }],
    terms: [
      { termType: "eq", column: "objectTypeName", value: $t('ListItem.CheckItem.9667712-0') },
      { termType: "eq", column: "relation", value: _relationValue },
    ],
  }).catch(() => ({ success: false, result: [] }));

  if (!resp.result?.length) errField(pathNames);
}

const handleContext = async (target: any, pathNames: string | string[], errField: (pathNames: string | string[]) => void) => {
  const params = { branch: branchIndex, branchGroup: thenIndex, action: actionIndex };
  const upperData = await getParams(params, unref(_data.value));
  const option = getOption(upperData, target.upperKey, 'id');
  if (!option) errField(pathNames);
}

/**
 * 设备信息校验
 */
const checkDeviceInfoDelete = async () => {
  const item = actionItem.configuration;

  const _selector = item.selector.selector as string

  if (_selector === 'context') {
    await handleContext(item.selector, ['selector', 'upper'], updateDeviceInfoField)
  }

  if (item.changeData) {
    formTouchOff()
  }
}

/**
 * 校验当前执行动作的设备或者产品是否删除
 */
const checkDeviceDelete = async () => {
  const item = actionItem.device;

  const handleWriteProperty = async () => {
    const keys = Object.keys(item.message?.properties || {});
    const key = keys[0];

    const value = item.message.properties[key];

    if (value.source === "upper") {
      if (!buildInGetter) {
        buildInGetter = await getBuildInData({ branch: branchIndex, branchGroup: thenIndex, action: actionIndex }, _data.value)
      }

      const option = buildInGetter(value.value, 'id');
      if (!option) {
        updateDeviceField(['message', 'properties', key]);
      }
    }
  }

  const _selector = item.selector as string

  if (_selector === 'context') {
    await handleRelation(item, 'upper', updateDeviceField)
  } else if (_selector === 'relation') {
    await handleRelation(item, 'selectorValues', updateDeviceField)
  }

  if (item.message?.messageType === 'WRITE_PROPERTY') {
    await handleWriteProperty();
  }

  if (item.changeData) {
    formTouchOff()
  }
};

/**
 * 校验当前执行动作的通知配置、消息模板是否删除
 */
const checkNoticeDelete = async () => {
  const item = actionItem.notify;
  const _triggerType = _data.value.triggerType;

  // 通知配置
  const configResp = await queryNoticeList({
    terms: [ { column: "id", termType: "eq", value: item!.notifierId }],
  });

  if (configResp.success && (configResp.result as any)?.total === 0) {
    updateNotifyField("notifierId")
    return;
  }

  // 通知模版
  const templateResp = await queryTemplateList({
    terms: [{ column: "id", termType: "eq", value: item.templateId }]
  });

  if (templateResp.success && (templateResp.result as any).total === 0) {
    updateNotifyField("templateId")
    return;
  }

  const templateDetailResp = await getTemplateDetail(item.templateId);

  if (!templateDetailResp.success) return

  const variableDefinitions = templateDetailResp.result.variableDefinitions || [];
  const variableMap = new Map(variableDefinitions.map((d: any) => [d.id, d.expands?.businessType]));
  const variableKeys = Object.keys(item.variables || {});
  const notifyType = item.notifyType;

  // 拆分处理 fixed 类型变量
  const checkFixedVariable = async (
    type: string,
    value: string,
    notifyType: string,
    notifierId: string
  ) => {
    switch (type) {
      case "user": {
        if (!["dingTalk", "weixin"].includes(notifyType)) return true;
        const resp =
          notifyType === "dingTalk"
            ? await queryDingTalkUsers(notifierId)
            : await queryWechatUsers(notifierId);
        return resp?.success && resp.result.some((u: any) => u.id === value);
      }
      case "tag": {
        const resp = await getTags(notifierId);
        return resp?.success && resp.result.some((t: any) => t.id === value);
      }
      case "org": {
        if (!["dingTalk", "weixin"].includes(notifyType)) return true;
        const resp =
          notifyType === "dingTalk"
            ? await dingTalkDept(notifierId)
            : await weChatDept(notifierId);
        return resp?.success && resp.result.some((o: any) => o.id === value);
      }
      default:
        return true;
    }
  };

  // 拆分处理 relation 类型变量
  const checkRelationVariable = async (
    relation: PlatformRelation,
    triggerType?: string
  ) => {
    const users = await getNotifyVariablesUser(triggerType === "device");
    const targetId = relation?.objectId;
    return (
      users.platform.some((u) => u.id === targetId) ||
      users.relation.some((u) => u.id === targetId)
    );
  };

  for (const key of variableKeys) {
    const variable = item.variables[key];
    const type = variableMap.get(key);

    if (type) { // 表示该变量被删除
      item.changeData = true
      formTouchOff()
      return
    }

    let valid = false;

    if (variable.source === "upper") {
      if (!buildInGetter) {
        const params = {
          branch: branchIndex,
          branchGroup: thenIndex,
          action: actionIndex,
        }
        buildInGetter = await getBuildInData(params, _data.value)
      }
      valid = !!buildInGetter(variable.upperKey, "id")
    } else if (variable.source === "fixed") {
      valid = await checkFixedVariable(type as string, variable.value, notifyType, item.notifierId);
    } else if (variable.source === "relationId") {
      valid = await checkRelationVariable(variable.relation, _triggerType);
    }

    if (!valid) {
      item.changeData = true;
      formTouchOff();
      return;
    }
  }
};

const checkCollectorDelete = async () => {
  const item = actionItem.collector;
  const options = actionItem.options;
  const channelId = options.channelId
  const { collectorId, pointIds } = item.pointSelectInfos[0]

  const channelResp = await ChannelQuery({ terms:[{ column: "id", termType: "eq", value: channelId }] });

  if (channelResp.result.total === 0) {
    item.changeData = true
    options.channelId = undefined
    formTouchOff()
    return
  }

  const collectorResp = await queryCollector({terms:[{ column: "id", termType: "eq", value: collectorId }]})

  if (collectorResp.result.total === 0) {
    updateCollectorField(['pointSelectInfos','collectorId'])
    return
  }

  const pointResp = await queryPointNoPagingV2({terms:[{ column: "id", termType: "eq", value: pointIds[0] }]})

  if (pointResp.result.length === 0) {
    updateCollectorField(['pointSelectInfos','pointIds'])
    return
  }

  if (item.source === "upper") {
    const params = { branch: branchIndex, branchGroup: thenIndex, action: actionIndex };
    const upperData = await getParams(params, unref(_data.value));
    const option = getOption(upperData, item.value, 'id');
    if (!option) updateCollectorField("value");
  }

}

const check = () => {
  if (_data.value.branches![props.branchesName].then[props.thenName]) {
    const _executor = actionItem.executor;
    if (_executor === "device" && actionItem.device) {// 设备输出，并且有值
      checkDeviceDelete();
    } else if (_executor === "notify" && actionItem.notify) { // 消息通知，并且有值
      checkNoticeDelete();
    } else if (_executor === "device-data" && actionItem.configuration) { // 设备信息，并且有值
      checkDeviceInfoDelete()
    } else if (_executor === "collector" && actionItem.collector) { // 采集器输出，并且有值
      checkCollectorDelete()
    }
  }
};

const subscribe = () => {
  // 订阅上一个action
  const _key = EventSubscribeKeys({
    branch: props.branchesName,
    branchGroup: props.thenName,
    action: props.name,
  });

  sub.value = EventEmitter.subscribe(_key, check);
};

subscribe();

check();

onUnmounted(() => {
  buildInGetter = null
})

defineExpose({
  formTouchOff,
});
</script>

<style scoped></style>
