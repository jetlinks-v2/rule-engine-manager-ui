import type { DeviceModelType, DeviceOptionType, DeviceActionModalProps } from './typings';
import { onlyMessage } from '@jetlinks-web/utils';
import { useSceneStore } from '../../../../../store/scene';
import { storeToRefs } from 'pinia';
import { isActionChange } from '../../util';
import { useI18n } from 'vue-i18n'
import { getProduct } from '../../../../../api/scene-linkage'
import { computed, inject, reactive, ref, unref, watch } from 'vue'

type Emit = {
    (e: 'cancel'): void;
    (e: 'save', data: any, options: Record<string, any>): void;
};

/** 编排设备动作草稿、产品物模型与原生选择器的保存，弹窗只负责展示和转发操作。 */
export function useDeviceActionModal(props: DeviceActionModalProps, emit: Emit) {

  const { t: $t } = useI18n()
  const sceneStore = useSceneStore();
  const { data } = storeToRefs(sceneStore);

  const current = ref<number>(0);
  const scopeEditorMode = ref<'resource' | 'advanced'>('resource')
  const sceneEditorMode = inject<string>('scene-editor-mode', 'legacy')
  const isDetailedEditor = computed(() => sceneEditorMode === 'detail')
  const deviceRef = ref<any>();
  const actionRef = ref<any>();
  const productDetail = ref<any>({});
  const productDetailLoading = ref(false)
  let productDetailTask: Promise<void> | undefined
  const activeProductId = ref('')
  const DeviceModel = reactive<DeviceModelType>({
      productId: '',
      deviceId: '',
      selector: 'fixed',
      selectorValues: [],
      upperKey: '',
      source: 'fixed',
      message: {
          messageType: 'INVOKE_FUNCTION',
      },
  });
  const DeviceOptions = ref<DeviceOptionType>(props.options as DeviceOptionType);

  const optionColumnCache = ref<string[]>(props.options?.otherColumn || [])
  const isResourceScope = computed(() => current.value === 1 && scopeEditorMode.value === 'resource')
  const onCancel = () => {
      emit('cancel');
  };

  const onSave = (_data: any, _columnMap: any = {}) => {
      const item: any = {
          selector: DeviceModel.selector,
          source: DeviceModel.source,
          selectorValues: DeviceModel.selectorValues,
          productId: DeviceModel.productId,
          upperKey: DeviceModel.upperKey,
          message: _data.message,
      };
      if (DeviceModel.selector === 'relation') {
          item.upperKey = 'scene.deviceId';
      }
      const _options: any = {
          // name: '-', //设备名称
          // type: '', //类型
          // properties: '', //属性功能
          // propertiesValue: '', //设置功能
          triggerName: data.value.options?.trigger?.name || $t('Device.index.9667820-7'),
          ...DeviceOptions.value,
          selector: DeviceModel.selector, // 展示标记也使用当前范围，避免被旧 options 覆盖。
          otherColumns: item.message?.inputs?.filter((item: any) => item.value.source === 'upper')
          .map((item: any) => item.value.value)
          .reduce((pre: any[], cur: any) => {
            if(!pre.includes(cur)) {
              pre.push(cur)
            }
            return pre
          }, []) || [],
          columnMap: _columnMap,
      };
      const _type = _data.message.messageType;
      if (_type === 'INVOKE_FUNCTION') {
          _options.type = $t('Device.index.9667820-8');
        _options.otherColumns = Object.values(_columnMap)
      }
      if (_type === 'READ_PROPERTY') {
          _options.type = $t('Device.index.9667820-9');
      }
      if (_type === 'WRITE_PROPERTY') {
          _options.type = $t('Device.index.9667820-10');
          _options.propertiesValue =
              (typeof _options?.propertiesValue === 'object'
                  ? JSON.stringify(_options?.propertiesValue)
                  : _options?.propertiesValue)
        _options.otherColumns = optionColumnCache.value
      }
      emit('save', item, JSON.parse(JSON.stringify(_options)));
  };
  const onProductChange = (_val: any, bol = false) => {
      if (!_val?.id) return
      const productChanged = Boolean(activeProductId.value && activeProductId.value !== _val.id)
      if (!bol && productChanged) {
          DeviceModel.selectorValues = undefined;
          DeviceModel.deviceId = ''
          DeviceModel.selector = 'fixed'
          DeviceModel.upperKey = ''
          DeviceModel.source = 'fixed'
          scopeEditorMode.value = 'resource'
          const flag = isActionChange(
              typeof _val.metadata === 'string' ? JSON.parse(_val.metadata || '{}') : _val.metadata || {},
              DeviceModel?.message,
          );
          if (!flag) {
              DeviceModel.message = {
                  messageType: 'INVOKE_FUNCTION',
              };
          }
      }
      activeProductId.value = _val.id
      productDetail.value = _val;
      DeviceOptions.value.productName = _val.name;
      productDetailLoading.value = true
      const selectedProductId = _val.id
      // 新版产品卡只承载列表摘要，范围与指令编辑仍需要完整物模型数据。
      productDetailTask = getProduct(selectedProductId)
          .then((response: any) => {
              if (DeviceModel.productId === selectedProductId) {
                  productDetail.value = { ..._val, ...(response?.result || response || {}) }
                  DeviceOptions.value.productName = productDetail.value.name || _val.name
              }
          })
          .finally(() => {
              if (DeviceModel.productId === selectedProductId) productDetailLoading.value = false
          })
  };
  const onDeviceSave = (_data: any, obj?: any) => {
      Object.assign(DeviceModel, { ..._data });
      DeviceOptions.value = { ...unref(DeviceOptions), ...obj };
  };
  /** 资源壳的变量和关系范围沿用原版 source/upperKey，指令配置格式保持不变。 */
  const onResourceScopeSave = (payload: any) => {
      Object.assign(DeviceModel, {
          selector: payload.scope.selector,
          selectorValues: payload.scope.selectorValues,
          productId: payload.scope.productId || DeviceModel.productId,
          source: payload.scope.source || 'fixed',
          upperKey: payload.scope.upperKey || '',
      });
      DeviceOptions.value = {
          ...unref(DeviceOptions),
          ...payload.actionOptions,
          name: payload.scope.options?.names || [],
          relationName: payload.scope.selector === 'relation' ? payload.scope.options?.names?.[0] : undefined,
          tagName: payload.scope.selector === 'tag' ? payload.scope.options?.tagName : undefined,
          productName: payload.scope.productName || productDetail.value.name,
      };
      optionColumnCache.value = payload.optionColumns || [];
      onSave(payload.action, payload.columnMap);
  };
  const onActionsChange = (options?: any, optionColumn: string[] = []) => {
      optionColumnCache.value = optionColumn
      const obj = {
          ...DeviceOptions.value,
          ...options,
      };
      DeviceOptions.value = obj;
  };
  const save = async (step?: number) => {
      let _step = step !== undefined ? step : current.value;
      if (_step === 0) {
          if (!DeviceModel.productId) {
              onlyMessage($t('Device.index.9667820-11'), 'error');
              return
          }
          await productDetailTask
          current.value = 1
      } else if (_step === 1) {
          if (deviceRef.value) {
              await deviceRef.value?.onFormSave();
              current.value = 2;
          } else if (DeviceModel.selectorValues?.length || DeviceModel.upperKey) {
              current.value = 2;
          } else {
              onlyMessage($t('Device.index.9667820-12'), 'error');
          }
      } else {
          if (actionRef.value) {
              const _data = await actionRef.value?.onFormSave();
              const _columnMap = actionRef.value?.getColumnMap()
              onSave(_data, _columnMap);
          }
      }
  };
  const stepChange = (step: number) => {
      if (step !== 0) {
          save(step - 1);
      } else {
          current.value = 0;
      }
  };
  const prev = () => {
      current.value -= 1;
  };

  const saveClick = () => save();

  /** 编辑已有详细模式动作时补齐物模型数据，但不重置已选设备和指令。 */
  async function hydrateSelectedProduct(productId: string) {
      productDetailLoading.value = true
      const selectedProductId = productId
      productDetailTask = getProduct(selectedProductId)
          .then((response: any) => {
              if (DeviceModel.productId !== selectedProductId) return
              productDetail.value = response?.result || response || {}
              DeviceOptions.value.productName = productDetail.value.name || DeviceOptions.value.productName
          })
          .finally(() => {
              if (DeviceModel.productId === selectedProductId) productDetailLoading.value = false
          })
      await productDetailTask
  }

  watch(
      () => props.value,
      (newValue) => {
          Object.assign(DeviceModel, newValue);
          activeProductId.value = newValue?.productId || ''
          // 详细模式编辑已有动作时直接展示已选产品下的设备列表并回显范围。
          current.value = isDetailedEditor.value && newValue?.productId ? 1 : 0
          scopeEditorMode.value = !isDetailedEditor.value && ['context', 'relation'].includes(newValue?.selector)
              ? 'advanced'
              : 'resource';
          if (isDetailedEditor.value && newValue?.productId) void hydrateSelectedProduct(newValue.productId)
      },
      { immediate: true },
  );
    return { isResourceScope, isDetailedEditor, current, DeviceModel, DeviceOptions, productDetail, productDetailLoading, deviceRef, actionRef, onCancel, save, stepChange, onProductChange, onDeviceSave, onActionsChange, onResourceScopeSave, prev, saveClick }
}
