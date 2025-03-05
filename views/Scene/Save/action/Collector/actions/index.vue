<template>
    <div>
        <a-form :layout="'vertical'" ref="formRef" :model="modelRef">
            <a-form-item
                :name="['message', 'messageType']"
                :label="$t('actions.index.9667837-0')"
                :rules="[{ required: true, message: $t('actions.index.9667837-1') }]"
            >
                <TopCard
                    :typeList="TypeList"
                    v-model:value="modelRef.message.messageType"
                    @change="handleChange"
                />
            </a-form-item>
            <template v-if="deviceMessageType === 'read'">
                <a-form-item
                    :name="['message', 'properties']"
                    :label="$t('Collector.actions.index-6100078-0')"
                    :rules="[{ required: true, message: $t('Collector.actions.index-6100078-1') }]"
                >
                    <a-select
                        showSearch
                        :placeholder="$t('Collector.actions.index-6100078-2')"
                        v-model:value="modelRef.message.properties"
                    >
                        <a-select-option
                            v-for="item in readPointList"
                            :value="item?.id"
                            :key="item?.id"
                            :label="item?.name"
                            >{{ item?.name }}</a-select-option
                        >
                    </a-select>
                </a-form-item>
            </template>
            <template v-else-if="deviceMessageType === 'write'">
                <WriteProperty
                    ref="writeFormRef"
                    v-model:value="modelRef.message.properties"
                    v-model:columnMap="columnMap"
                    :builtInList="builtInList"
                    :pointList="pointList"
                />
            </template>
        </a-form>
    </div>
</template>

<script lang="ts" setup name="ActionDeviceActions">
import TopCard from '../../Device/device/TopCard.vue';
import WriteProperty from './WriteProperty.vue';
import {sceneImages} from "@ruleEngine/assets";
import { useI18n } from 'vue-i18n';
import {getParams} from "@ruleEngine/views/Scene/Save/util";
import {useSceneStore} from "@ruleEngine/store/scene";
import {storeToRefs} from "pinia";

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data } = storeToRefs(sceneStore);

const TypeList = [
    {
        label: $t('Collector.actions.index-6100078-0'),
        value: 'read',
        image: sceneImages.readProperty,
        tip: '',
        disabled: false,
    },
    {
        label: $t('Collector.actions.index-6100078-3'),
        value: 'write',
        image: sceneImages.writeProperty,
        tip: '',
        disabled: false,
    },
];

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
    productDetail: {
        type: Object,
        default: () => {},
    },
    columnMap: {
        type: Object,
        default: () => ({}),
    },
    collectorId: {
        type: String,
        default: '',
    },
    pointList: {
        type: Array as PropType<Record<string, any>[]>,
        default: () => ([]),
    }
});
const emit = defineEmits(['change']);

const readPointList = computed(() => {
  /**
   * 读：1（001）
   * 写：2（010）
   * 订阅：4（100）
   * 可使用按位与计算来校验是否包含对应枚举
   * 例如，判断是否包含读：accessModes & 1 !== 0，判断是否包含写：accessModes & (1 << 1) !== 0
   */
  return props.pointList.filter((item: any) => {
    return (item.accessModeMask & 1) !== 0;
  }).map((item: any) => {
    return {
      ...item,
      label: item.name,
      value: item.id,
    };
  })
})

const formRef = ref();
const columnMap = ref(props.columnMap || {});

const modelRef = reactive({
    message: {
        messageType: props.values?.handlerType,
        properties: props.values?.handlerType === 'write' ? {
          [props.values?.pointSelectInfos?.[0]?.pointIds?.[0]]: {
            value: props.values?.value,
            source: props.values?.source,
          }
        } : props.values?.pointSelectInfos?.[0]?.pointIds?.[0],
        inputs: [],
    },
    propertiesValue: '',
});

const writeFormRef = ref();

const deviceMessageType = computed(() => {
    return modelRef.message.messageType;
});

const builtInList = ref<any[]>([]);

const onFormSave = () => {
    return new Promise((resolve, reject) => {
        formRef.value
            .validate()
            .then(async (_data: any) => {
                if (writeFormRef.value) {
                    const _val = await writeFormRef.value?.onSave();
                    if (!_val) {
                        reject(false);
                    }
                }
                resolve({
                    message: {
                        ...modelRef.message,
                        ..._data.message,
                    },
                });
            })
            .catch((err: any) => {
                reject(err);
            });
    });
}
const getColumnMap = () => {
    return columnMap.value;
};

const queryBuiltIn = async () => {
  const _params = {
    branch: props.thenName,
    branchGroup: props.branchesName,
    action: props.name - 1,
  };
  const _data = await getParams(_params, unref(data));
  builtInList.value = _data;
};


const handleChange = (val) => {
  columnMap.value = {};
  const flag = val === 'write';
  modelRef.message = {
    messageType: val,
    properties: (flag ? undefined : []) as any,
    inputs: [],
  };
  if (flag) {
    queryBuiltIn();
  }
}

watch(
  () => props.values?.message,
  (newVal) => {
    if (newVal?.messageType) {
      modelRef.message = JSON.parse(JSON.stringify(newVal));
      if (
        ['WRITE_PROPERTY', 'INVOKE_FUNCTION'].includes(
          newVal.messageType,
        )
      ) {
        queryBuiltIn();
      } else {
        if (!modelRef.message.properties) {
          modelRef.message = Object.assign(modelRef.message, {
            properties: [],
          });
        }
      }
    }
  },
  { immediate: true },
);
defineExpose({
    onFormSave,
    getColumnMap
})
</script>
