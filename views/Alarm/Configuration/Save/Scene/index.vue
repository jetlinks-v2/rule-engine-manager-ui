<template>
  <FullPage>
    <JProTable
      mode="CARD"
      style="padding: 16px 0"
      :request="queryTable"
      :gridColumns="[1, 2, 3]"
      :defaultParams="{
        sorts: [{ name: 'createTime', order: 'desc' }],
        terms: [
          {
            terms: [
              {
                column: 'id',
                termType: 'alarm-bind-rule',
                value: id,
              },
            ],
            type: 'and',
          },
        ],
      }"
      ref="actionRef"
    >
      <template #headerLeftRender>
        <a-space>
          <j-permission-button
            type="primary"
            @click="showModal"
            hasPermission="rule-engine/Alarm/Configuration:add"
          >
            <template #icon>
              <AIcon type="PlusOutlined" />
            </template>
            {{ $t('Scene.index.021455-0') }}
          </j-permission-button>
        </a-space>
      </template>
      <template #card="slotProps">
        <SceneCardBox
          :value="slotProps"
          :status="slotProps.state?.value"
          :statusText="slotProps.state?.text"
          :alarmId="id"
          :activeKeys="activeKeys[slotProps.id]"
          :showMask="false"
          :showBranches="false"
          :showBindTags="true"
          :showRule="false"
          :showHistory="false"
          @click="handleView(slotProps)"
        >
          <div class="scene-view">{{ $t('Scene.index.021455-1') }}</div>
        </SceneCardBox>
      </template>
    </JProTable>
  </FullPage>
  <Save
    v-if="visible"
    :id="id"
    :type="configurationData.current?.targetType"
    @close-save="closeSave"
    @save-scene="saveSuccess"
  ></Save>

  <SceneDrawer
    v-if="scene.visible"
    :detail="scene.detail"
    :id="id"
    @cancel="sceneCancel"
  />
</template>

<script lang="ts" setup>
import { query } from "../../../../../api/scene";
import { queryBindScene } from "../../../../../api/configuration";
import { useRoute } from "vue-router";
import Save from "./Save/index.vue";
import { useAlarmConfigurationStore } from "../../../../../store/alarm";
import { storeToRefs } from "pinia";
import SceneDrawer from "./SceneDrawer.vue";
import SceneCardBox from "./Save/CardBox.vue";
import { useRequest } from "@jetlinks-web/hooks";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const route = useRoute();
const id = route.query?.id;

const alarmConfigurationStore = useAlarmConfigurationStore();
const { configurationData } = storeToRefs(alarmConfigurationStore);
const scene = reactive({
  visible: false,
  detail: undefined,
});

const actionRef = ref();

const { data: activeKeys, reload } = useRequest(queryBindScene, {
  defaultParams: { terms: [{ column: "alarmId", value: id }] },
  onSuccess(res) {
    const activeMap = res.result.data.reduce((prev, next) => {
      if (prev[next.ruleId]) {
        prev[next.ruleId].push(next.branchIndex);
      } else {
        prev[next.ruleId] = [next.branchIndex];
      }
      return prev;
    }, {});
    return activeMap || {};
  },
  defaultValue: {},
});

// const getActions = (
//   data: Partial<Record<string, any>>,
//   type: 'card' | 'table',
// ): ActionsType[] => {
//   if (!data) return [];
//   const actions: ActionsType[] = [
//     {
//       key: 'action',
//       text: '解绑',
//       icon: 'DisconnectOutlined',
//       popConfirm: {
//         title: '确认解绑？',
//         onConfirm: async () => {
//           // const res = await unbindScene(id, [data.id], data.branchIndex);
//           const res = await unbindScene(id, [data.id]);
//           if (res.status === 200) {
//             onlyMessage('操作成功');
//             actionRef.value.reload();
//           }
//           return
//         },
//       },
//     },
//   ];
//   return actions;
// };

const queryTable = (_terms: any) => {
  return query(_terms, id);
};

const visible = ref(false);

const showModal = () => {
  visible.value = true;
};
const closeSave = () => {
  visible.value = false;
};
const saveSuccess = () => {
  visible.value = false;
  actionRef.value.reload();
  reload();
};
/**
 * 查看
 * @param record
 */
const handleView = (record: Record<string, any>) => {
  scene.detail = record;
  scene.visible = true;
};

const sceneCancel = () => {
  scene.visible = false;
  scene.detail = undefined;
  actionRef.value?.reload();
};
</script>
<style lang="less" scoped>
.subTitle {
  color: rgba(0, 0, 0, 0.65);
  font-size: 14px;
  margin-top: 10px;
}

.scene-view {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  font-size: 16px;
  height: 100%;
  color: transparent;
  padding-top: 30px;
  background-color: rgba(#000, 0);
  cursor: pointer;
  transition: background-color 0.3s;

  &:hover {
    background-color: rgba(#000, 0.4);
    color: #fff;
  }
}
</style>
