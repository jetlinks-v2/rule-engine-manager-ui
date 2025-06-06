<template>
  <a-drawer
    visible
    :title="$t('Scene.SceneDrawer.021453-0')"
    :width="600"
    :closable="false"
    :keyboard="false"
    @close="onCancel"
  >
    <div class="scene-warp">
      <TitleComponent :data="$t('Scene.SceneDrawer.021453-1')" />
      <a-descriptions size="small" :column="2" bordered>
        <a-descriptions-item :label="$t('Scene.SceneDrawer.021453-2')">
          <j-ellipsis>{{ detail.name }}</j-ellipsis>
        </a-descriptions-item>
        <a-descriptions-item :label="$t('Scene.SceneDrawer.021453-3')">{{
          itemType.text
        }}</a-descriptions-item>
      </a-descriptions>
      <TitleComponent :data="$t('Scene.SceneDrawer.021453-4')" style="margin: 12px 0" />
      <div class="branches-warp">
        <BranchesTabs
          :branchesGroup="branchesGroup"
          :alarmId="id"
          :branchesId="detail.id"
          :activeKeys="activeKeys"
          :show="true"
          :showDetailBtn="false"
          :showUnbindBtn="true"
          :triggerType="detail.triggerType"
          @select="handleBind"
        />
        <div v-if="loading" class="branches-loading">
          <a-spin />
        </div>
      </div>
    </div>
  </a-drawer>
</template>

<script setup name="SceneDrawer">
import { useRequest } from "@jetlinks-web/hooks";
import {
  queryBindScene,
  unbindScene,
  unBindAlarm,
  bindScene,
} from "../../../../../api/configuration";
import { handleGroupAndFilter, typeMap } from "./Save/utils";
import BranchesTabs from "./Save/BranchesTabs.vue";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
  id: {
    type: String,
    default: undefined,
  },
  detail: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["cancel"]);

const loading = ref(false);

const itemType = computed(() => {
  return typeMap.get(props.detail.triggerType) || {};
});

const branchesGroup = computed(() => {
  return handleGroupAndFilter(
    props.detail.branches,
    props.detail.options?.when || []
  );
});

const { data: activeKeys } = useRequest(queryBindScene, {
  defaultParams: { terms: [{ column: "alarmId", value: props.id }] },
  onSuccess(res) {
    const activeMap = res.result.data.reduce((prev, next) => {
      if (props.detail.id === next.ruleId) {
        prev.push(next.branchIndex);
      }
      return prev;
    }, []);
    return activeMap || [];
  },
  defaultValue: [],
});

const onCancel = () => {
  emit("cancel");
};

const handleBind = (id, selected) => {
  loading.value = true;
  if (selected) {
    //
    bindScene([
      {
        alarmId: props.id,
        ruleId: props.detail.id,
        branchIndex: id,
      },
    ])
      .then((res) => {
        activeKeys.value.push(id);
      })
      .finally(() => {
        loading.value = false;
      });
  } else {
    const request =
      id === -1
        ? unbindScene(props.id, [props.detail.id])
        : unBindAlarm(props.detail.id, props.id, [id]);
    request
      .then((res) => {
        activeKeys.value = activeKeys.value.filter((key) => key !== id);
      })
      .finally(() => {
        loading.value = false;
      });
  }
};
</script>

<style scoped lang="less">
.scene-warp {
  display: flex;
  flex-direction: column;
  height: 100%;

  .branches-warp {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    position: relative;

    .branches-loading {
      position: absolute;
      top: 0;
      left: 0;
      height: 0;
      padding: 20%;
    }
  }
}
</style>
