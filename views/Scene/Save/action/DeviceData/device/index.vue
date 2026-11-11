<template>
  <div>
    <a-form :layout="'vertical'" ref="formRef" :model="modelRef">
      <a-form-item
        :name="['selector', 'selector']"
        :label="$t('device.index.9667835-0')"
        v-show="!(list.length === 1)"
        :rules="[{ required: true, message: $t('device.index.9667835-1') }]"
      >
        <TopCard
          :typeList="list"
          v-model:value="modelRef.selector.selector"
          @change="onSelectorChange"
        />
      </a-form-item>
      <Device
        v-if="modelRef.selector.selector === 'fixed'"
        :productId="productDetail.id"
        v-model:value="modelRef.selector.selectorValues"
        @change="onDeviceChange"
      />
      <a-form-item
        v-else-if="modelRef.selector.selector === 'relation'"
        :label="$t('device.index.9667835-2')"
        :name="['selector','selectorValues']"
        :rules="[{ required: true, message: $t('device.index.9667835-3') }]"
      >
        <RelationSelect
          @change="onRelationChange"
          v-model:value="modelRef.selector.selectorValues"
        />
      </a-form-item>
      <a-form-item
        v-else-if="modelRef.selector.selector === 'tag' && isTags"
        :name="['selector','selectorValues']"
        :rules="[{ trigger: 'blur', validator: tagValidator }]"
      >
        <Tag
          v-model:value="modelRef.selector.selectorValues"
          :tagData="tagList"
          @change="onTagChange"
        />
      </a-form-item>
      <a-form-item
        v-else
        :name="['selector', 'upperKey']"
        :label="$t('device.index.9667835-5')"
        :rules="[{ required: true, message: $t('device.index.9667835-6') }]"
      >
        <a-tree-select
          style="width: 100%; height: 100%"
          :tree-data="builtInList"
          v-model:value="modelRef.selector.upperKey"
          :placeholder="$t('device.index.9667835-7')"
          @select="onVariableChange"
          :fieldNames="{ label: 'fullName', value: 'id' }"
        >
          <template #title="{ fullName, description }">
            <a-space>
              {{ fullName }}
              <span style="color: grey; margin-left: 5px">{{
                description
              }}</span>
            </a-space>
          </template>
        </a-tree-select>
      </a-form-item>
    </a-form>
  </div>
</template>

<script setup lang="ts" name="Device">
import { useSceneStore } from "../../../../../../store/scene";
import TopCard from "./TopCard.vue";
import { storeToRefs } from "pinia";
import { onlyMessage } from "@jetlinks-web/utils";
import Device from "./Device.vue";
import Tag from "./Tag.vue";
import RelationSelect from "./RelationSelect.vue";
import {ACTION_DATA, getParams} from "../../../util";
import { handleParamsData } from "../../../components/Terms/util";
import { map } from "lodash-es";
import { TypeMap } from "./util";
import { selectDeviceVariables } from "../../Device/deviceVariables";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
  values: {
    type: Object,
    default: () => {},
  },
  name: {
    type: Number,
    default: 0,
  },
  thenName: {
    type: Number,
    default: 0,
  },
  branchesName: {
    type: Number,
    default: 0,
  },
  parallel: {
    type: Boolean,
  },
  productDetail: {
    type: Object,
    default: () => {},
  },
});

// 首次操作标签数据option回显问题
const isTags = computed(() => {
  return map(list.value, "value").includes("tag");
});

// save保存deviceDetail
const emits = defineEmits(["save", "cancel"]);
const action_data = inject(ACTION_DATA)
const sceneStore = useSceneStore();
const { data } = storeToRefs(sceneStore);

const formRef = ref();

const modelRef = reactive({
  deviceId: "",
  selector: {
    selector: "fixed",
    source: "upper",
    upperKey: "",
    selectorValues: undefined
  },
});

const list = ref<any[]>([]);
const builtInList = ref<any[]>([]);
const tagList = ref<any[]>([]);

const sourceChangeEvent = async () => {
  // const _params = {
  //   branch: props.thenName,
  //   branchGroup: props.branchesName,
  //   action: props.name - 1,
  // };
  const _params: Record<string, Number> = {
    branch: (action_data?.branchIndex || 0),
    branchGroup: props.thenName,
    action: props.name, // action
  }
  //判断相同产品才有按变量
  // const productId =
  //     data.value?.branches?.[props.branchesName].then?.[props.thenName]
  //         ?.actions?.[props.name > 0 ? props.name - 1 : 0]?.device?.productId;
  // if (productId === props?.productDetail?.id) {
  //     const _data = await getParams(_params, unref(data));
  //     builtInList.value = handleParamsData(filterTree(_data), 'id');
  // } else {
  //     builtInList.value = [];
  // }
  const _data = await getParams(_params, unref(data));
  builtInList.value = handleParamsData(selectDeviceVariables(_data, props.productDetail?.id), "id");

  if (props.productDetail?.id) {
    filterType(props.productDetail);
  }
};

/** 关系入口已下线；变量候选由同产品的上游设备 ID 决定。 */
const filterType = (newVal: any) => {
  const metadata = typeof newVal?.metadata === 'string' ? JSON.parse(newVal.metadata || '{}') : newVal?.metadata || {};
  tagList.value = metadata.tags || [];
  list.value = [
    TypeMap.fixed,
    { ...TypeMap.context, disabled: !builtInList.value.length },
    { ...TypeMap.tag, disabled: !tagList.value.length },
  ];
};

const onSelectorChange = (val: string) => {
  modelRef.selector.selectorValues = undefined;
  modelRef.selector.selector = val;
};

const tagValidator = (_: any, value: any) => {
  if (value) {
    if (!value[0]?.value?.[0].column) {
      return Promise.reject($t('device.index.9667835-4'));
    } else if (!value[0]?.value?.[0].value) {
      return Promise.reject($t('device.index.9667835-4-1'));
    } else {
      return Promise.resolve();
    }
  } else {
    return Promise.reject($t('device.index.9667835-4'));
  }
}
/**
 * 切换设备
 * @param _detail
 */
const onDeviceChange = (_detail: any) => {

    if(_detail){
        if(_detail.length){
            modelRef.selector.selectorValues = _detail;
        }else{
            modelRef.deviceId = '';
            modelRef.selector.selectorValues = [] as any;
        }
        modelRef.selector.upperKey = '';
        const nameArr = _detail?.map((i:any)=>{
            return i.name
        })
        emits('save', unref(modelRef), { name: nameArr })
    }
};

/**
 * 变量选择
 * @param val
 * @param options
 */
const onRelationChange = (val: any, options: any) => {
  modelRef.deviceId = "deviceId";
  modelRef.selector.source = "upper";
  modelRef.selector.selectorValues = val;
  modelRef.selector.upperKey = "scene.deviceId";
  emits("save", unref(modelRef), { relationName: options.label });
};

/**
 *
 * @param val
 * @param arr
 */
const onTagChange = (val: any[], arr: any[]) => {
  if (val) {
    modelRef.deviceId = "deviceId";
    modelRef.selector.source = "fixed";
  }
  const tagName = arr.map((i, _index) => {
    const _type =
      _index !== 0 && _index !== (arr || []).length && i.type
        ? i.type === "and"
          ? $t('device.index.9667835-9')
          : $t('device.index.9667835-10')
        : "";
    return `${_type}${i.name}为${i.value}`;
  });
  emits("save", unref(modelRef), { tagName: tagName.join("") });
};

const onVariableChange = (val: any, node: any) => {
  modelRef.deviceId = val;
  modelRef.selector = {
    ...modelRef.selector,
    source: "upper",
    upperKey: val,
    selectorValues: undefined
  }
  emits("save", unref(modelRef), { name: node.description });
};

watch(
  () => props.values,
  (newVal) => {
    Object.assign(modelRef, newVal);
  },
  {
    immediate: true,
    deep: true,
  }
);

watch(
  () => props.productDetail,
  (newVal) => {
    sourceChangeEvent();
  },
  {
    immediate: true,
    deep: true,
  }
);

watch(
  () => [props.values, builtInList.value],
  ([newVal1, newVal2]) => {
    if (newVal2 && newVal2.length) {
      const param = newVal1?.selectorValues?.[0]?.value;
      const isVariable = (newVal2 || [])?.find((item: any) => {
        return item.children.find((i: any) => i.id === param);
      });
      if (isVariable) {
        modelRef.selector = "context";
      }
    }
  },
  {
    immediate: true,
    deep: true,
  }
);

const onFormSave = () => {
  return new Promise((resolve, reject) => {
    formRef.value
      .validate()
      .then(async (_data: any) => {
        if (modelRef.selector.selector === "fixed") {
          if (!modelRef.selector?.selectorValues?.[0]?.value) {
            onlyMessage($t('device.index.9667835-12'), "error");
            resolve(false);
          } else {
            resolve({
              ..._data,
              selectorValues: modelRef.selector.selectorValues,
            });
          }
        } else {
          resolve({ ..._data });
        }
      })
      .catch((err: any) => {
        resolve(false);
      });
  });
};

defineExpose({ onFormSave });
</script>

<style scoped lang="less"></style>
