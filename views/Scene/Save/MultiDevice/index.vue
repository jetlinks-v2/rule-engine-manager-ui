<script setup lang="ts" name="MultiDevice">
import { storeToRefs } from 'pinia';
import { useSceneStore } from '../../../../store/scene'
import Terms from '../components/Terms'
import CheckItem from '../Device/CheckItem.vue'
import { useI18n } from 'vue-i18n'
import { useRequest } from '@jetlinks-web/hooks'
import { getRelationUsers } from '@ruleEngine/api/others'
import DeviceArray from './DeviceArray.vue'

const { t: $t } = useI18n()
const sceneStore = useSceneStore()
const { data } = storeToRefs(sceneStore)
const termsRef = ref()
const multiDeviceRef = ref()



const { data: relationData } = useRequest(getRelationUsers, {
  onSuccess: (resp) => {
    return resp.result.map(item => {
      const label = `${item.name}/${item.reverseName}`
      return {
        label,
        value: item.relation,
        objectType: item.objectType,
      }
    })
  }
});

const rules = [{
  validator(_: any, v: any) {
    if (!v) {
      return Promise.reject(new Error($t('Device.index.372524-1')));
    } else {

      if (!v.relation.relation) {
        return Promise.reject(new Error($t('MultiDevice.index-07221552-1')));
      }

      if (!v.triggers.length) {
        return Promise.reject(new Error($t('MultiDevice.index-07221552-2')));
      } else {
        const hasChange = v.triggers.some((item: any) => {
          const { selector, operation, productId, selectorValues} = item
          return !productId ||
            (['fixed', 'org'].includes(selector) && !selectorValues) ||
            (operation?.operator === 'readProperty' && !operation!.readProperties.length) ||
            (operation?.operator === 'writeProperty' && !Object.keys(operation!.writeProperties).length) ||
            (operation?.operator === 'invokeFunction' && !operation.functionId) ||
            (operation?.operator === 'reportEvent' && !operation.eventId)
        })

        if (hasChange) {
          return Promise.reject(new Error($t('Device.index.372524-2')));
        }
      }
    }

    return Promise.resolve();
  },
}]

const relationChange  = (_: any, option: any) => {
  data.value.trigger.multiDevice.relation.objectType = option.objectType
  // 触发校验
  multiDeviceRef.value?.onFieldChange()
}

defineExpose({
  changePaneIndex: (index: number) => termsRef.value?.changePaneIndex(index)
})
</script>

<template>
  <div class='multi-device'>
    <a-form-item
      v-if="data.trigger"
      :rules='rules'
      :name='["trigger", "multiDevice"]'
      ref="multiDeviceRef"
    >
      <template #label>
        <TitleComponent :data="$t('Device.index.372524-0')">
          <template #extra>
            <a-form-item-rest>
              <div style="display: flex; gap:8px">
                <a-select
                  style="width: 260px;margin-left: 16px"
                  :placeholder="$t('MultiDevice.index-07221552-1')"
                  :options="relationData"
                  v-model:value="data.trigger.multiDevice.relation.relation"
                  @change="relationChange"
                />
                <a-tooltip
                title="通过设备间关系实现跨设备联动，设备任意一侧都可触发，系统将根据设备关系自动找出对端设备并执行参数校验"
                >
                  <AIcon type="" />
                </a-tooltip>
              </div>
            </a-form-item-rest>
          </template>
        </TitleComponent>
      </template>
      <DeviceArray :data="data.trigger.multiDevice.triggers" />
      <CheckItem />
    </a-form-item>
    <Terms ref="termsRef" type="multi-device" />
  </div>
</template>

<style scoped lang="less">

</style>
