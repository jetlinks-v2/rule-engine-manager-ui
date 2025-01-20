<template>
  <a-modal
      title="执行动作"
      visible
      :width="1000"
      @cancel="onCancel"
      @ok="save"
      :maskClosable="false"
  >
    <div class="body_height_60">
      <a-steps :current="current" @change="stepChange">
        <a-step>
          <template #title>选择通道</template>
        </a-step>
        <a-step>
          <template #title>选择采集器</template>
        </a-step>
        <a-step>
          <template #title>执行动作</template>
        </a-step>
      </a-steps>
      <div class="steps-content">
        <Channel
            v-if="current === 0"
            v-model:rowKey="CollectorModel.pointSelectInfos[0].channelId"
            v-model:detail="channelDetail"
            @change="onProductChange"
        />
        <Collector
            v-else-if="current === 1"
            v-model:rowKey="CollectorModel.pointSelectInfos[0].collectorId"
            v-model:detail="collectorDetail"
            :channelId="CollectorModel.pointSelectInfos[0].channelId"
            :name="name"
            :parallel="parallel"
            :branchesName="branchesName"
            :thenName="thenName"
            :values="CollectorModel"
            @save="onDeviceSave"
            :channelDetail="channelDetail"
            ref="collectorRef"
        />
        <Action
            v-else-if="current === 2"
            :name="name"
            :pointList="pointList"
            :collectorId="CollectorModel.pointSelectInfos[0].collectorId"
            :branchesName="branchesName"
            :thenName="thenName"
            :values="CollectorModel"
            :channelDetail="channelDetail"
            :columnMap="options.columnMap"
            ref="actionRef"
            @change="onActionsChange"
        />
      </div>
    </div>
    <template #footer>
      <div class="steps-action">
        <a-button v-if="current === 0" @click="onCancel">取消</a-button>
        <a-button v-else @click="prev">上一步</a-button>
        <a-button type="primary" v-if="current < 2" @click="saveClick"
        >下一步
        </a-button
        >
        <a-button type="primary" v-else @click="saveClick"
        >确定
        </a-button
        >
      </div>
    </template>
  </a-modal>
</template>

<script lang="ts" setup>
import Channel from './Channel.vue';
import Collector from './Collector.vue';
import Action from './actions/index.vue';
import {onlyMessage} from '@jetlinks-web/utils';
import {useRequest} from "@jetlinks-web/hooks";
import {queryPointNoPaging} from "@ruleEngine/api/collector";
import {cloneDeep} from "lodash-es";

type Emit = {
  (e: 'cancel'): void;
  (e: 'save', data: any, options: Record<string, any>): void;
};

const props = defineProps({
  value: {
    type: Object,
    default: () => {
    },
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
  options: {
    type: Object,
    default: () => ({})
  }
});

const {data: pointList, run} = useRequest(queryPointNoPaging, {
  immediate: false
});
const current = ref<number>(0);
const collectorRef = ref<any>();
const actionRef = ref<any>();

const channelDetail = ref<any>({});
const collectorDetail = ref<any>({});

const CollectorModel = reactive<Record<string, any>>({
  selector: 'fixed',
  handlerType: 'read',
  pointSelectInfos: [{
    channelId: '',
    collectorId: '',
    pointIds: [],
  }],
  source: 'fixed',
  value: undefined,
});

const CollectorOptions = ref<Record<string, any>>({});

const emit = defineEmits<Emit>();
const optionColumnCache = ref<string[]>(props.options?.otherColumn || [])

const onCancel = () => {
  emit('cancel');
};

const onSave = (_data: any, _columnMap: any = {}) => {
  const item: any = {
    handlerType: _data.message.messageType,
    source: CollectorModel.source,
    pointSelectInfos: [
      {
        collectorId: CollectorModel.pointSelectInfos[0]?.collectorId,
        pointIds: typeof _data.message.properties === 'object' ? Object.keys(_data.message.properties || {}) : [_data.message.properties],
      }
    ],
  };
  const _options: any = {
    selector: CollectorModel.selector, //选择器标识
    triggerName: collectorDetail.value.name || '触发采集器',
    ...CollectorOptions.value,
    otherColumns: [],
    columnMap: _columnMap,
    channelId: CollectorModel.pointSelectInfos[0]?.channelId,
    pointName: pointList.value?.filter(_item => item.pointSelectInfos[0]?.pointIds.includes(_item.id))?.map(_item => _item.name)?.join('、')
  };
  const _type = _data.message.messageType;
  if (_type === 'read') {
    _options.type = '读取';
  }
  if (_type === 'write') {
    item.value = _data.message.properties[Object.keys(_data.message.properties)[0]]?.value;
    _options.type = '设置';
    _options.propertiesValue =
        (typeof _options?.propertiesValue === 'object'
            ? JSON.stringify(_options?.propertiesValue)
            : _options?.propertiesValue)
  }

  emit('save', item, JSON.parse(JSON.stringify(_options)));
};

const onProductChange = (_val: any, bol: boolean) => {
  if (!bol) {
    CollectorModel.pointSelectInfos[0].collectorId = ''
    CollectorModel.selector = 'fixed';
    CollectorModel.source = 'fixed';
  }
  channelDetail.value = _val;
  CollectorOptions.value.productName = _val?.name;
};

const onDeviceSave = (_data: any, obj?: any) => {
  Object.assign(CollectorModel, {..._data});
  CollectorOptions.value = {...unref(CollectorOptions), ...obj};
};

const onActionsChange = (options?: any, optionColumn: string[]) => {
  optionColumnCache.value = optionColumn
  const obj = {
    ...CollectorOptions.value,
    ...options,
  };
  CollectorOptions.value = obj;
};

const save = async (step?: number) => {
  let _step = step !== undefined ? step : current.value;
  if (_step === 0) {
    CollectorModel.pointSelectInfos[0]?.channelId
        ? (current.value = 1)
        : onlyMessage('请选择通道', 'error');
  } else if (_step === 1) {
    if (CollectorModel.pointSelectInfos[0]?.collectorId) {
      current.value = 2;
    } else {
      onlyMessage('请选择采集器', 'error');
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

watch(
    () => props.value,
    (newValue) => {
      Object.assign(CollectorModel, cloneDeep(newValue));
      CollectorModel.pointSelectInfos[0].channelId = props.options.channelId;
    },
    {immediate: true},
);
watch(
    () => CollectorModel.pointSelectInfos[0]?.collectorId,
    (newVal) => {
      run({
        terms: [
          {
            column: 'collectorId',
            value: newVal,
          }
        ]
      })
    },
    {immediate: true},
)
</script>

<style lang="less" scoped>
.steps-steps {
  width: 100%;
  margin-bottom: 17px;
  padding-bottom: 17px;
  border-bottom: 1px solid #f0f0f0;
}

.steps-content {
  height: calc(100% - 35px);
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
