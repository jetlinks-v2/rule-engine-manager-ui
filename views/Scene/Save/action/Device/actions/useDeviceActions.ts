import { toThingModelOptions } from '../../../../../SceneLinkage/editor/thingModel'
import { detail } from '@rule-engine-manager-ui/api/others';
import { useSceneStore } from '@rule-engine-manager-ui/store/scene';
import { storeToRefs } from 'pinia';
import {ACTION_DATA, getParams} from '../../../util';
import { sceneImages } from '@rule-engine-manager-ui/assets';
import { useI18n } from 'vue-i18n'
import { computed, inject, reactive, ref, unref, watch } from 'vue'
type DeviceActionsProps = {
  compact: boolean; values: Record<string, any>; productDetail: Record<string, any>;
  name: number; thenName: number; branchesName: number; columnMap: Record<string, any>;
}
/** 指令表单的物模型、上游参数和校验编排；保留旧版消息与参数映射格式。 */
export function useDeviceActions(props: DeviceActionsProps, emit: (event: 'change', options?: Record<string, any>, columns?: string[]) => void) {

  const { t: $t } = useI18n()
  const sceneStore = useSceneStore();
  const { data } = storeToRefs(sceneStore);
  const action_data = inject<{ branchIndex?: number }>(ACTION_DATA)
  const allTypes = [
      {
          label: $t('actions.index.9667837-2'),
          value: 'INVOKE_FUNCTION',
          image: sceneImages.invokeFunction,
          tip: '',
          disabled: false,
      },
      {
          label: $t('actions.index.9667837-4'),
          value: 'READ_PROPERTY',
          image: sceneImages.readProperty,
          tip: '',
          disabled: false,
      },
      {
          label: $t('actions.index.9667837-7'),
          value: 'WRITE_PROPERTY',
          image: sceneImages.writeProperty,
          tip: '',
          disabled: false,
      },
  ];

  const actionTypeOptions = computed(() => allTypes.map((item, index) => ({
      ...item,
      icon: ['AppstoreOutlined', 'SearchOutlined', 'EditOutlined'][index],
      description: $t(`IotSceneLinkage.actionDescription.${['executeFunction', 'readProperty', 'writeProperty'][index]}`),
  })).filter(item => availableTypes.value.includes(item.value)))
  const TypeList = computed(() => allTypes.filter(item => availableTypes.value.includes(item.value)))
  function optionValue(option: any) { return option?.data?.value ? option.data : option }

  const formRef = ref();
  const columnMap = ref(props.columnMap || {});

  const modelRef = reactive({
      message: {
          messageType: 'INVOKE_FUNCTION',
          functionId: undefined,
          properties: undefined,
          inputs: [],
      },
      propertiesValue: '',
  });

  const writeFormRef = ref();
  const functionRef = ref();

  const functionSelect = (val: any, options?: any) => {
      columnMap.value = {};
      modelRef.message.inputs = [];
      emit('change', {
          propertiesName: metadata.value?.functions?.find(item => item.id === val)?.name,
          propertiesValue: modelRef.propertiesValue,
      });
  };

  const propertySelect = (val: any, options?: any) => {
      emit('change', {
          propertiesName: metadata.value?.properties?.find(item => item.id === val)?.name,
          propertiesValue: modelRef.propertiesValue,
      });
  };

  const functionRules = [
      {
          validator(_: string, value: any) {
              const arr = functions.value.filter((i: any) => {
                  return i?.expands?.required;
              });
              if (arr.length) {
                  if (!value?.length) {
                      return Promise.reject($t('actions.index.9667837-8'));
                  } else {
                      const hasValue = value?.find(
                          (item: { name: string; value: any }) =>
                              item.value === undefined,
                      );
                      if (hasValue) {
                          const functionItem = arr?.find(
                              (item: any) => item.id === hasValue.name,
                          );
                          return Promise.reject(
                              functionItem?.name
                                  ? $t('actions.index.9667837-9', [functionItem.name])
                                  : $t('actions.index.9667837-8'),
                          );
                      }
                  }
              }
              return Promise.resolve();
          },
          trigger: ['change', 'blur'],
      },
  ];

  const metadataLoaded = ref(false)
  const metadata = ref<{
      functions: any[];
      properties: any[];
  }>({
      functions: [],
      properties: [],
  });

  // 动作允许复杂物模型类型；仅复用富文本展示，不套用触发条件的类型限制。
  const functionOptions = computed(() => toThingModelOptions(metadata.value?.functions || [], 'function', true))
  const readOptions = computed(() => toThingModelOptions((metadata.value?.properties || []).filter(item => item.expands?.type?.includes('read')), 'property', true))

  const writeOptions = computed(() => toThingModelOptions((metadata.value?.properties || []).filter(item => item.expands?.type?.includes('write')), 'property', true))
  // 动作类型与其字段下拉使用同一套能力判断，空物模型不展示空类型。
  const availableTypes = computed(() => [
    ...(functionOptions.value.length ? ['INVOKE_FUNCTION'] : []),
    ...(readOptions.value.length ? ['READ_PROPERTY'] : []),
    ...(writeOptions.value.length ? ['WRITE_PROPERTY'] : []),
  ])

  const deviceMessageType = computed(() => {
      return modelRef.message.messageType;
  });

  const builtInList = ref<any[]>([]);

  const functions = computed(() => {
      const _item = (metadata.value?.functions || []).find((item: any) => {
          return modelRef.message?.functionId === item.id;
      });
      return _item?.inputs || [];
  });

  const _property = computed(() => {
      const _item = (metadata.value?.properties || []).find((item: any) => {
          if (deviceMessageType.value === 'WRITE_PROPERTY') {
              return (
                  Object.keys(modelRef.message.properties || {})?.[0] === item.id
              );
          }
          return modelRef.message?.properties?.[0] === item.id;
      });
      return _item;
  });

  const _function = computed(() => {
      const _item = (metadata.value?.functions || []).find((item: any) => {
          return modelRef.message?.functionId === item.id;
      });
      return _item;
  });

  const queryBuiltIn = async () => {
      // const _params = {
      //     branch: props.branchesName,
      //     branchGroup: props.thenName,
      //     action: props.name - 1,
      // };
    const _params = {
      branch: (action_data?.branchIndex || 0),
      branchGroup: props.thenName,
      action: props.name, // action
    }
      const _data = await getParams(_params, unref(data));
      builtInList.value = _data;
  };

  const onMessageTypeChange = (val: string) => {
      columnMap.value = {};
      const flag = ['WRITE_PROPERTY', 'INVOKE_FUNCTION'].includes(val);
      modelRef.message = {
          messageType: val,
          functionId: undefined,
          properties: (flag ? undefined : []) as any,
          inputs: [],
      };
      if (flag) {
          queryBuiltIn();
      }
  };

  const onWriteChange = (val: string, optionColumn: string[]) => {
      modelRef.propertiesValue = val;
      emit(
          'change',
          {
              propertiesName:
                  deviceMessageType.value === 'INVOKE_FUNCTION'
                      ? _function.value?.name
                      : _property.value?.name,
              propertiesValue: modelRef.propertiesValue,
          },
          optionColumn,
      );
  };

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
                  if (functionRef.value) {
                      const _val = await functionRef.value?.validate();
                  }
                  resolve({
                      message: {
                          ...modelRef.message,
                          ..._data.message,
                      },
                  });
                  // emit('change', {
                  //     propertiesName:
                  //         deviceMessageType.value === 'INVOKE_FUNCTION'
                  //             ? _function.value?.name
                  //             : _property.value?.name,
                  //     propertiesValue: modelRef.propertiesValue,
                  // });
              })
              .catch((err: any) => {
                  reject(err);
              });
      });
  };

  const getColumnMap = () => {
      return columnMap.value;
  };

  watch(
      () => props.productDetail,
      (newVal) => {
          if (newVal?.id) {
              // 详细资源弹窗的动作能力来自产品物模型，不能因设备尚未选中而隐藏可配置字段。
              if (props.compact) {
                  metadata.value = typeof newVal.metadata === 'string' ? JSON.parse(newVal.metadata || '{}') : newVal.metadata || {};
                  metadataLoaded.value = newVal.metadata != null;
                  return;
              }
              if (
                  props.values?.selector === 'fixed' &&
                  props.values?.selectorValues?.length === 1
              ) {
                  const id = props.values?.selectorValues?.[0]?.value;
                  if (id) {
                      detail(id).then((resp) => {
                          if (resp.status === 200) {
                              metadata.value = JSON.parse(
                                  resp.result?.metadata || '{}',
                              );
                              metadataLoaded.value = true;
                          }
                      });
                  }
              } else {
                  metadata.value = typeof newVal.metadata === 'string' ? JSON.parse(newVal.metadata || '{}') : newVal.metadata || {};
                  metadataLoaded.value = newVal.metadata != null;
              }
          }
      },
      { immediate: true },
  );

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

  watch([availableTypes, metadataLoaded], ([types, loaded]) => {
    if (loaded && !types.includes(modelRef.message.messageType)) onMessageTypeChange(types[0] || '')
  }, { immediate: true, flush: 'post' })

  return { formRef, modelRef, actionTypeOptions, TypeList, optionValue, onMessageTypeChange, deviceMessageType, metadata, functionOptions, readOptions, functionSelect, propertySelect, functionRef, writeFormRef, functions, builtInList, columnMap, onWriteChange, onFormSave, getColumnMap }
}
