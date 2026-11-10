import type {DeviceModelDataType, DeviceOptionType} from './typings';
import { type DeviceScope } from '../../../../SceneLinkage/editor/components/DeviceScopeModal.vue'
import { getProduct } from '../../../../../api/scene-linkage'
import { onlyMessage } from '@jetlinks-web/utils';
import { detail } from '@rule-engine-manager-ui/api/instance';
import { useSceneStore } from '@rule-engine-manager-ui/store/scene';
import { storeToRefs } from 'pinia';
import { isActionChange } from '../../util';
import { handleMetadata } from './util'
import { useI18n } from 'vue-i18n'
import { computed, inject, reactive, ref, unref, watch } from 'vue'
import type { DeviceActionModalProps } from '../Device/typings'

type Emit = {
    (e: 'cancel'): void;
    (e: 'save', data: any, options: Record<string, any>): void;
};

/** 编排设备动作草稿、产品物模型与原生选择器的保存，弹窗只负责展示和转发操作。 */
export function useDeviceDataModal(props: DeviceActionModalProps, emit: Emit) {

  const { t: $t } = useI18n()
  const sceneStore = useSceneStore();
  const { data } = storeToRefs(sceneStore);

  const isDetailedEditor = inject('scene-editor-mode', 'legacy') === 'detail'
  const current = ref<number>(0);
  const deviceRef = ref<any>();
  const productDetail = ref<any>({});
  const productDetailLoading = ref(false)
  let productDetailTask: Promise<void> | undefined
  /** 产品卡只带摘要；进入范围选择前补齐标签与物模型，且忽略已切换产品的响应。 */
  function loadProduct(productId: string) {
    productDetailLoading.value = true
    productDetailTask = getProduct(productId).then((response: any) => {
      if (DeviceModel.productId === productId) productDetail.value = response?.result || response || {}
    }).finally(() => {
      if (DeviceModel.productId === productId) productDetailLoading.value = false
    })
    return productDetailTask
  }
  const activeProductId = ref(String(props.value?.productId || ''));

  const DeviceModel = reactive<DeviceModelDataType>({
      productId: '',
      deviceId: '',
      selector: {
        selector: 'fixed',
        selectorValues: [],
        upperKey: '',
        source: 'fixed',
      },
      message: {
          messageType: 'INVOKE_FUNCTION',
      },
  });

  const DeviceOptions = ref<DeviceOptionType>({ ...props.options });
  const scopeDraft = computed<DeviceScope>(() => ({
      selector: DeviceModel.selector.selector as DeviceScope['selector'],
      selectorValues: DeviceModel.selector.selectorValues || [],
      upperKey: DeviceModel.selector.upperKey,
      source: DeviceModel.selector.source,
      options: { names: DeviceModel.selector.selector === 'relation' && DeviceOptions.value.relationName ? [DeviceOptions.value.relationName] : Array.isArray(DeviceOptions.value.name) ? DeviceOptions.value.name : DeviceOptions.value.name ? [DeviceOptions.value.name] : [], tagName: DeviceOptions.value.tagName },
      productId: DeviceModel.productId,
      productName: productDetail.value.name || props.options.productName,
  }))
  /** 设备信息读取沿用嵌套 selector 配置，只替换详细模式的选择承载。 */
  function saveResourceScope(scope: DeviceScope) {
      DeviceModel.selector = { ...DeviceModel.selector, selector: scope.selector, selectorValues: scope.selectorValues, source: scope.source || 'fixed', upperKey: scope.upperKey || '' } as typeof DeviceModel.selector
      Object.assign(DeviceOptions.value, { name: scope.options?.names || [], relationName: scope.selector === 'relation' ? scope.options?.names?.[0] : undefined, tagName: scope.options?.tagName, productName: scope.productName })
      void onSave()
  }

  const onCancel = () => {
      emit('cancel');
  };

  const onSave = async () => {
      let metadata = productDetail.value.metadata || '{}';
      // 产品卡列表只含摘要，新建动作保存前补全物模型，避免动态范围读不到产品字段。
      if (isDetailedEditor && !productDetail.value.metadata) {
        const response: any = await getProduct(DeviceModel.productId);
        metadata = (response?.result || response)?.metadata || metadata;
      }
      if (DeviceModel.selector.selector === 'fixed' && DeviceModel.selector.selectorValues?.length === 1) {
        const resp = await detail(DeviceModel.selector.selectorValues[0].value);
        if (resp.success) {
          metadata = resp.result?.metadata || metadata
        }
      }

      const item: any = {
          selector: DeviceModel.selector,
          productId: DeviceModel.productId,
          configs: ['state', 'onlineTime', 'offlineTime', 'deviceName', 'productName'],
          ...handleMetadata(typeof metadata === 'string' ? JSON.parse(metadata) : metadata),
      };
      if (DeviceModel.selector.selector === 'relation') {
          item.selector.upperKey = 'scene.deviceId';
      }
      const _options: any = {
          triggerName: data.value.options?.trigger?.name || $t('Device.index.9667820-7'),
          ...DeviceOptions.value,
          selector: DeviceModel.selector.selector, //选择器标识
          otherColumns: [],
      };
      emit('save', item, JSON.parse(JSON.stringify(_options)));
  };

  const onProductChange = (_val: any, bol: boolean) => {
      // 产品选择器先更新 v-model，独立保存旧 ID 才能识别更换产品并清空旧设备范围。
      if (!bol && activeProductId.value && activeProductId.value !== _val.id) {
        DeviceModel.selector = {
          selectorValues: undefined,
          selector: 'fixed',
          upperKey: '',
          source: 'fixed'
        }
          DeviceModel.deviceId = ''
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
      productDetail.value = _val;
      activeProductId.value = String(_val.id || '');
      DeviceOptions.value.productName = _val?.name;
      if (isDetailedEditor) void loadProduct(_val.id)
  };

  const onDeviceSave = (_data: any, obj?: any) => {
      Object.assign(DeviceModel, { ..._data });
      DeviceOptions.value = { ...unref(DeviceOptions), ...obj };
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
      } else {
          if (deviceRef.value) {
              const resp = await deviceRef.value?.onFormSave();
              if(resp){
                onSave();
              }
          } else if (DeviceModel.selector.selectorValues?.length) {
              onSave();
          } else {
              onlyMessage($t('Device.index.9667820-12'), 'error');
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

  watch(
      () => props.value,
      (newValue) => {
          Object.assign(DeviceModel, newValue);
          activeProductId.value = String(newValue?.productId || '');
          if (isDetailedEditor && newValue?.productId) {
              current.value = 1
              void loadProduct(newValue.productId)
          }
      },
      { immediate: true },
  );
    return { isDetailedEditor, current, DeviceModel, productDetail, productDetailLoading, scopeDraft, deviceRef, onCancel, save, stepChange, onProductChange, onDeviceSave, saveResourceScope, prev, saveClick }
}
