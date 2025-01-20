<script setup name="Fulfill">
import {useI18n} from "vue-i18n";
import { queryAggregation, queryArrayTerms, queryBuiltInParams } from '@ruleEngine/api/scene'
import {useRequest} from "@jetlinks-web/hooks";
import WhenItem from './When.vue'
import {useAggContext, useColumnContext, useFulfillDataContext} from "./hooks";
import {
  defaultTermsValue
} from "./util";
import { useSceneStore } from '@ruleEngine/store/scene'
import {detail, productDetail} from "@ruleEngine/api/instance";
import {cloneDeep} from "lodash-es";
import TermItem from './Terms.vue'

const props = defineProps({
  value: {
    type: Object,
    default: () => ({}),
  },
  column: {
    type: String
  },
  property: {
    type: String,
    default: undefined
  },
  branchParams: {
    type: Object
  }
})
const emit = defineEmits(['select', 'update:value'])

const { t: $t} = useI18n()
const sceneStore = useSceneStore();
const dataCache = ref([])
const visible = ref(false)
const showPropertyList = ref(false)
const formRef = ref()
const builtInOptions = ref([])

const aggregation = ref({
  column: undefined,
  function: undefined,
  value: { source: 'fixed', value: undefined },
  termType: undefined
})

const { data: aggregationOptions } = useRequest(queryAggregation, {
  onSuccess(resp) {
    return resp.result.map(item => ({ ...item, label: item.name, value: item.id }))
  }
})

const { data: arrayTermsOptions, run } = useRequest(queryArrayTerms, {
  immediate: false,
  onSuccess(resp) {
    return resp.result.map(item => ({ ...item, label: item.name, value: item.column }))
  }
})

useAggContext(aggregationOptions)
useColumnContext(arrayTermsOptions)
useFulfillDataContext(dataCache)

const onSelect = async () => {
  const result = await formRef.value.validateFields()
  if (result) {
    let obj = cloneDeep(dataCache.value)
    if (aggregation.value.value.value) {
      obj.aggregation = [{ ...cloneDeep(aggregation.value)}]
    }
    emit('update:value', obj)
    emit('select', obj, '', '条件')
    hideVisible()
  }
}

const showVisible = async () => {
  visible.value = true
  if (sceneStore.data.trigger.type === 'device') {
    const propertyId = props.column.split('.')[1]
    let resp
    if (sceneStore.data.trigger.device.selectorValues.length === 1 ) {
      resp = await detail(sceneStore.data.trigger.device.selectorValues[0].value)
    } else {
      resp = await productDetail(sceneStore.data.trigger.device.productId)
    }

    if (resp.result.metadata) {
      const _metadata = JSON.parse(resp.result.metadata)
      const property = _metadata.properties?.find(item => item.id === propertyId)
      run(property)
    }
  }

  queryBuiltInParams(toRaw(sceneStore.data), props.branchParams).then(resp => {
    if (resp.success) {
      builtInOptions.value = resp.result
    }
  })

  if (dataCache.value.filter?.length === 0) {
    dataCache.value.filter = [
      {
        type: 'and',
        terms: [
          defaultTermsValue
        ]
      }
    ]
  }
}

const onAdd = () =>{
  dataCache.value.filter.push({
    type: 'and',
    terms: [
      defaultTermsValue
    ]
  })
}

const onSwitch = (e) => {
  if (!e) {
    aggregation.value = {
      column: undefined,
      value: { source: 'fixed', value: undefined },
      termType: undefined,
      function: undefined
    }
  }
}

const hideVisible = () => {
  visible.value = false
  //  清空数据
  dataCache.value.filter = []
  onSwitch()
}

const tips = computed(() => {
  return props.value.filter?.length ? '条件' : '请配置条件'
})

watch(() => [JSON.stringify(props.value), visible.value], () => {
  if (visible.value) {
    const obj = props.value || {}
    dataCache.value = Object.keys(obj).length ? cloneDeep(obj) : { filter: []}

    if (props.value && props.value.aggregation?.length) {
      aggregation.value = cloneDeep(props.value.aggregation[0])
      showPropertyList.value = true
    }
  }

}, { immediate: true, deep: true})
</script>

<template>
  <div class="fulfill scene-select-value">
    <div class="dropdown-button value" @click="showVisible">
      {{ tips }}
    </div>
    <a-modal
      v-model:visible="visible"
      title="配置条件"
      width="800px"
      :okText="$t('Save.index.551010-2')"
      :keyboard="false"
      :maskClosable="false"
      @ok="onSelect"
      @cancel="hideVisible"
    >
      <a-form
        ref="formRef"
        :model="dataCache.filter"
        v-if="visible"
      >
        <div style="display: flex; padding-top: 10px;overflow: auto">
          <WhenItem
            v-for="(item, index) in dataCache.filter"
            :data="item"
            :showDeleteBtn="dataCache.filter.length > 1"
            :isFirst="index === 0"
            :isLast="index === dataCache.filter.length - 1"
            @add="onAdd"
          />
        </div>
      </a-form>
      <div class="array-property">
        <div class="tips">
          <div class="left">
            <div class="icon">
              <AIcon type="FunctionOutlined"/>
            </div>
            <div>
              <div style="font-size: 16px">聚合</div>
              <div>通过聚合函数对数据项进行汇总</div>
            </div>
          </div>
          <div class="right">
            <a-switch v-model:checked="showPropertyList" @change="onSwitch" />
          </div>
        </div>
        <div v-if="showPropertyList" class="array-property-list">
          <TermItem
            v-if="visible"
            :options="arrayTermsOptions"
            :isLast="false"
            :showDeleteBtn="false"
            :showAggregationOption="true"
            :builtInOptions="builtInOptions"
            :showBuildIn="true"
            v-model:value="aggregation"
          />
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped lang="less">
@import '../../DropdownButton/index.less';

.array-property {
  .tips {
    padding: 16px;
    border-radius: 6px;
    background-color: @font-gray-200;
    margin: 12px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .left {
      display: flex;
      align-items: center;

      .icon {
        font-size: 20px;
        margin-right: 8px;
      }
    }
  }
}

.array-property-list {
  display: flex;
  gap: 12px;
}
</style>
