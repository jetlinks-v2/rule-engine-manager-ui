<template>
  <div class="new-alarm">
    <div class="title">{{ $t('components.NewAlarm.753525-0') }}</div>
    <div v-if="alarmList.length" class="new-alarm-items">
      <ul>
        <li v-for="item in alarmList.slice(0, 3)" :key="item">
          <div class="new-alarm-item">
            <div class="new-alarm-item-time">
              <img :src="dashBoardImg.dashboard" alt="" />{{
                item.lastAlarmTime ? dayjs(item.lastAlarmTime).format(
                                    'YYYY-MM-DD HH:mm:ss',
                                ) : dayjs(item.alarmTime).format(
                                    'YYYY-MM-DD HH:mm:ss',
                                )
              }}
            </div>
            <div class="new-alarm-item-content">
              <j-tooltip :title="item.alarmName" placement="topLeft">
                <a
                  @click="
                    () => {
                      return jumpDetail(item);
                    }
                  "
                  >{{ item.alarmName }}</a
                >
              </j-tooltip>
            </div>
            <div class="new-alarm-item-state">
              <j-badge
                :status="item.state?.value === 'warning' ? 'error' : 'default'"
              >
              </j-badge>
              <span
                :class="item.state?.value === 'warning' ? 'error' : 'default'"
              >
                {{ item.state?.text }}
              </span>
            </div>

            <div :class="['new-alarm-item-level', `level-${item.level}`]">
              <j-ellipsis style="width: calc(100%)">
                {{ item.levelName }}
              </j-ellipsis>
            </div>
          </div>
        </li>
      </ul>
    </div>
    <div v-else class="empty-body">
      <j-empty :image="Empty.PRESENTED_IMAGE_SIMPLE"></j-empty>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Empty } from "ant-design-vue";
import { useMenuStore } from "@/store/menu";
import { dashBoardImg } from "../../../assets/index";
import dayjs from "dayjs";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
  alarmList: {
    type: Array,
    default: [],
  },
});
const menuStore = useMenuStore();
const jumpDetail = (item: any) => {
  menuStore.jumpPage(`rule-engine/Alarm/Log/Detail`, {
    params: {
      id: item.id,
      detail: true,
    },
  });
};
</script>
<style scoped lang="less">
.new-alarm {
  padding: 24px;
  background-color: #fff;
  border: 1px solid #e0e4e8;
  border-radius: 2px;
  height: 100%;
  .title {
        color: rgba(0, 0, 0, 0.64);
        font-size: 14px;
    }
}
.new-alarm-items {
  ul {
    list-style: none;
    padding: 0;
  }
  .new-alarm-item {
    display: flex;
    gap: 12px;
    margin: 18px 0;
    font-size: 12px;
    .new-alarm-item-time {
      width: 180px;
      font-size: 14px;

      > img {
        margin-right: 8px;
      }
    }
  }
  .new-alarm-item-content {
    width: ~"calc(100% - 360px)";
  }
  .new-alarm-item-state {
    width: 90px;
    text-align: center;
    font-size: 14px;
    .error {
      color: @error-color;
    }

    .default {
      color: @text-color;
    }
  }
  .new-alarm-item-level {
    width: 70px;
    padding: 2px 8px;
    color: #fff;
    text-align: center;
    border-radius: 2px;

    &.level-1 {
      background-color: #e50012;
    }

    &.level-2 {
      background-color: #ff9457;
    }

    &.level-3 {
      background-color: #fabd47;
    }

    &.level-4 {
      background-color: #999;
    }

    &.level-5 {
      background-color: #bbb;
    }
  }
}
.empty-body {
  height: 142px;
  display: flex;
  flex-direction: column;
  align-content: center;
  justify-content: center;
  width: 100%;
}
</style>
