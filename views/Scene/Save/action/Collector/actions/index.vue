<template>
    <div>
        <a-form :layout="'vertical'" ref="formRef" :model="modelRef">
            <a-form-item
                :name="['message', 'messageType']"
                :label="$t('actions.index.9667837-0')"
                :rules="[{ required: true, message: $t('actions.index.9667837-1') }]"
            >
                <a-select v-if="compact" v-model:value="modelRef.message.messageType" :options="actionTypeOptions" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="false" @change="handleChange">
                    <template #option="option"><div class="scene-editor__device-trigger-option"><span><AIcon :type="optionValue(option).icon" /></span><div><b>{{ optionValue(option).label }}</b><small>{{ optionValue(option).description }}</small></div></div></template>
                </a-select>
                <TopCard v-else
                    :typeList="TypeList"
                    v-model:value="modelRef.message.messageType"
                    @change="handleChange"
                />
            </a-form-item>
            <template v-if="deviceMessageType === 'read'">
                <a-form-item
                    :name="['message', 'properties']"
                    :label="$t('Collector.actions.index-6100078-0')"
                    :rules="[{validator: validator, trigger: 'change'}]"
                >
                    <ThingModelSelect v-if="compact" v-model="modelRef.message.properties" :options="readPointOptions" :placeholder="$t('Collector.actions.index-6100078-2')" />
                    <a-select v-else
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
                    :compact="compact"
                    @change="onWriteChange"
                />
            </template>
        </a-form>
    </div>
</template>

<script lang="ts" setup name="ActionDeviceActions">
import TopCard from '../../Device/device/TopCard.vue';
import ThingModelSelect from '../../../../../SceneLinkage/editor/components/ThingModelSelect.vue';
import WriteProperty from './WriteProperty.vue';
import {sceneImages} from "@rule-engine-manager-ui/assets";
import { useI18n } from 'vue-i18n';
import {ACTION_DATA, getParams} from "@rule-engine-manager-ui/views/Scene/Save/util";
import {useSceneStore} from "@rule-engine-manager-ui/store/scene";
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

const actionTypeOptions = computed(() => TypeList.map((item, index) => ({
    ...item, icon: index ? 'EditOutlined' : 'SearchOutlined',
    description: $t(index ? 'IotSceneLinkage.collector.writeDescription' : 'IotSceneLinkage.collector.readDescription'),
})))
function optionValue(option: any) { return option?.data?.value ? option.data : option }
const props = defineProps({
    compact: { type: Boolean, default: false },
    selectedPointId: { type: String, default: undefined },
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
const emit = defineEmits(['change', 'type-change', 'point-change']);
const action_data = inject(ACTION_DATA)
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

const readPointOptions = computed(() => readPointList.value.map(item => ({ label: item.name, value: item.id, valueType: item.dataType, kind: 'property' as const })))
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

const validator = (_rule, value) => {
    if(!value) {
        return Promise.reject($t('Collector.actions.index-6100078-2'));
    } else {
        if (!props.pointList?.find((item: any) => item.id === value)) {
            return Promise.reject($t('Terms.TermsItem.9093428-0'));
        } else {
            return Promise.resolve();
        }
    }
}

const queryBuiltIn = async () => {
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
  const _data = await getParams(_params, unref(data));
  builtInList.value = _data;
};


const handleChange = (val) => {
  columnMap.value = {};
  emit('type-change', val)
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

const onWriteChange = (val: string, optionColumn: string[]) => {
    modelRef.propertiesValue = val;
    emit(
        'change',
        {
            propertiesName: val,
            propertiesValue: modelRef.propertiesValue,
        },
        optionColumn,
    );
};

watch(
  () => props.values,
  (newVal) => {
    if(newVal?.handlerType === 'write') {
      queryBuiltIn();
    }
  },
  { immediate: true },
);
/** 点位列表和右侧原有参数编辑器共享同一选中值，回显时保留已保存的写入参数。 */
watch([() => props.selectedPointId, deviceMessageType], ([value]) => {
  if (!props.compact) return
  const previousId = modelRef.message.messageType === 'write' ? Object.keys(modelRef.message.properties || {})[0] : modelRef.message.properties
  if (value === previousId) return
  modelRef.message.properties = modelRef.message.messageType === 'write'
    ? value ? { [value]: { source: 'fixed', value: undefined } } : undefined
    : value
}, { immediate: true })

// 右侧下拉和中间点位列表使用同一个选中值，写入参数变化不能打断选择同步。
watch(() => modelRef.message.properties, value => {
  if (!props.compact) return
  emit('point-change', modelRef.message.messageType === 'write' ? Object.keys(value || {})[0] || '' : value || '')
}, { deep: true })

defineExpose({
    onFormSave,
    getColumnMap
})
</script>
