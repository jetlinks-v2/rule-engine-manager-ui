<template>
    <div class='timer'>
      <a-form-item
        :rules="rules"
        :name="['trigger', 'timer']"
      >
        <template #label>
          <TitleComponent data='触发规则' style='font-size: 14px;' />
        </template>
        <AddButton
            style='width: 100%'
            @click='visible = true'
        >
          <template #extra>
            <span style="padding-right: 10px;">
              系统时间到达
            </span>
          </template>
          <Title :options='data.options.trigger' />
        </AddButton>
      </a-form-item>
      <div class='actions-branches-item' >

        <a-form-item
          :rules="actionRules"
          :name="['branches', 0, 'then']"
        >
          <template #label>
            <TitleComponent data='执行动作' style='font-size: 14px;' />
          </template>
          <Action
            :thenOptions="data.branches ? data?.branches[0].then : []"
            :name="0"
          />
        </a-form-item>
      </div>
      <AddModel
        v-if="visible"
        @cancel='visible = false'
        @save="save"
        :value="data.trigger.timer"
      />
    </div>
</template>

<script lang="ts" setup name='SceneSaveTimer'>
import { useSceneStore } from '../../../../store/scene';
import { storeToRefs } from 'pinia';
import Action from '../action/index.vue';
import AddModel from './AddModal.vue'
import AddButton from '../components/AddButton.vue'
import Title from './Title.vue'
import type { OperationTimer, BranchesThen } from '../../typings';

const sceneStore = useSceneStore();
const { data } = storeToRefs(sceneStore);
const visible = ref(false)

const rules = [{
  validator(_: any, v: any) {
    if (!v) {
      return Promise.reject(new Error('请配置定时触发规则'));
    }
    return Promise.resolve();
  },
}]

const actionRules = [{
  validator(_: any, v?: BranchesThen[]) {
    if (!v || (v && !v.length) || !v.some(item => item.actions && item.actions.length)) {
      return Promise.reject('至少配置一个执行动作');
    }
    return Promise.resolve();
  },
}]

const onActionUpdate = (_data: any, type: boolean) => {
    const indexOf = data.value.branches![0].then.findIndex(
        (item) => item.parallel === type,
    );
    if (indexOf !== -1) {
        if (_data?.actions?.length) {
            data.value.branches![0].then[indexOf] = _data;
        } else {
            data.value.branches![0].then[indexOf].actions = [];
        }
    }
};

const save = (_data: OperationTimer, options: Record<string, any>) => {
  data.value.trigger!.timer = _data
  data.value.options!.trigger = options
  visible.value = false
}
</script>

<style scoped lang='less'>
@minWidth: 75%;

.timer {
  .actions-branches-item {
    width: 100%;
  }
}


@media (min-width: 1600px) {
  .timer {
    .actions-branches-item {
      width: @minWidth;
    }
  }
}
</style>
