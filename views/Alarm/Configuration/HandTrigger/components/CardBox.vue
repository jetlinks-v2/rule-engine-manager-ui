<template>
  <div
    class="card j-table-card-box"
    :class="{ selectedCard: selected }"
    @click="click"
  >
    <div class="card-warp" :class="{ disabled: disabled }">
      <div class="card-type">
        <div class="card-type-text">
          <img :height="16" :src="itemType.icon" style="margin-right: 5px" />
          {{ itemType.text }}
        </div>
      </div>
      <div class="card-content" :style="{ paddingTop: '40px' }">
        <div
          class="card-content-bg-item card-content-bg1"
          :style="bgcColor"
        ></div>
        <div
          class="card-content-bg-item card-content-bg2"
          :style="bgcColor"
        ></div>
        <div class="card-content-body">
          <!-- 图片 -->
          <div class="card-item-avatar">
            <img :src="itemType.img" />
          </div>

          <!-- 内容 -->
          <div class="card-item-body">
            <div>
              <j-ellipsis style="width: calc(100% - 100px)">
                <span style="font-size: 16px; font-weight: 600">
                  {{ value.name }}
                </span>
              </j-ellipsis>
              <div v-if="showBindTags && activeBranches.length">
                <a-tag v-for="tag in activeBranches">
                  <j-ellipsis style="max-width: 120px">
                    {{ tag }}
                  </j-ellipsis>
                </a-tag>
              </div>
              <j-ellipsis v-else>
                <div class="subTitle">
                  {{ $t('components.CardBox.0214517-0') }}{{ value?.description || itemType.tip }}
                </div>
              </j-ellipsis>
            </div>
          </div>
        </div>
        <div class="card-content-tabs" v-if="showBranches">
          <BranchesTabs
            :branchesGroup="branchesGroup"
            :alarmId="alarmId"
            :branchesId="value.id"
            :activeKeys="activeKeys"
            :key="value.id"
            @change="bindAlarm"
          />
        </div>
        <div
          class="card-state"
          :style="{
            backgroundColor: getHexColor(statusNames[status]),
          }"
        >
          <div class="card-state-content">
            <JBadgeStatus
              :status="status"
              :text="statusText"
              :statusNames="statusNames"
            ></JBadgeStatus>
          </div>
        </div>
      </div>
      <div
        v-if="status === 'disable' && !isInvalid"
        class="card-mask mask-hover"
        :style="maskStyle"
      >
        <div class="mask-content">
          <slot name="mask">
            <div>{{ $t('components.CardBox.0214517-1') }}</div>
          </slot>
        </div>
      </div>
      <div
        v-if="isInvalid"
        class="card-mask mask-full"
        style="background-color: rgba(0, 0, 0, 0.2)"
      >
        <a-button style="font-size: 16px" type="link" @click="jumpView"
          >{{ $t('components.CardBox.0214517-2') }}</a-button
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" name="SceneCardBox">
import  colorMap ,{ getHexColor } from "@jetlinks-web/components/es/BadgeStatus/color";
import BranchesTabs from "./BranchesTabs.vue";
import { PropType } from "vue";
import {
  handleActiveBranches,
  handleGroupAndFilter,
  typeMap,
} from "../../Save/Scene/Save/utils";
import { useMenuStore } from "@/store/menu";
import { useI18n } from 'vue-i18n';
import { randomString } from "@jetlinks-web/utils";

const { t: $t } = useI18n();
type EmitProps = {
  (e: "click"): void;
  (e: "change", key: string, selected: boolean): void;
  (e: "reload"): void;
};

const emit = defineEmits<EmitProps>();

const props = defineProps({
  value: {
    type: Object as PropType<Record<string, any>>,
    default: () => ({}),
  },
  statusText: {
    type: String,
    default: '正常',
  },
  status: {
    type: [String, Number] as PropType<string | number>,
    default: "default",
  },
  statusNames: {
    type: Object as PropType<Record<any, any>>,
    default: () => ({
      started: "processing",
      disable: "error",
    }),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  alarmId: {
    type: String,
    default: undefined,
  },
  activeKeys: {
    // 后端返回已关联的执行动作
    type: Array,
    default: () => [],
  },
  showBranches: {
    type: Boolean,
    default: true,
  },
  showBindTags: {
    type: Boolean,
    default: false,
  },
  maskStyle: {
    type: Object,
    default: undefined,
  },
  selected: {
    type: Boolean,
    default: undefined,
  },
});

const isInvalid = ref(false);
const menuStory = useMenuStore();
const bgcColor = computed(() => {
  const key = props.statusNames[props.status];
  const _color = colorMap[key] || colorMap.default;
  return {
    background: `linear-gradient(
                  188.4deg,
                  rgba(${_color}, 0.03) 30%,
                  rgba(${_color}, 0) 80%
              )`,
  };
});

const itemType = computed(() => {
  return typeMap.get(props.value.triggerType) || {};
});

const branchesGroup = computed(() => {
  return handleGroupAndFilter(
    props.value.branches,
    props.value.options?.when || []
  );
});

const activeBranches = computed(() => {
  const { data, invalid } = handleActiveBranches(
    branchesGroup.value,
    props.activeKeys
  );

  isInvalid.value = invalid;
  console.log(isInvalid.value, "isInvalid");
  return data;
});

const bindAlarm = (key: string, selected: boolean) => {
  emit("change", key, selected);
};

const click = () => {
  emit("click");
};

const jumpView = () => {
  const url = menuStory.menus["rule-engine/Scene/Save"]?.path;
  const sourceId = `add_scene_${randomString()}`; // 唯一标识
  const tab: any = window.open(
    `${window.location.origin + window.location.pathname}#${url}?triggerType=${
      props.value.triggerType
    }&id=${props.value.id}&sourceId=${sourceId}`
  );
  tab.onTabSaveSuccess = (_sourceId: string, value: any) => {
    console.log("", value);
    if (sourceId === _sourceId) {
      if (value.success) {
        emit("reload");
      }
    }
  };
};
</script>

<style scoped lang="less">
.card {
  width: 100%;
  background-color: #fff;

  .checked-icon {
    position: absolute;
    right: -22px;
    bottom: -22px;
    z-index: 2;
    width: 44px;
    height: 44px;
    color: #fff;
    background-color: #2f54eb;
    transform: rotate(-45deg);

    > div {
      position: relative;
      height: 100%;
      transform: rotate(45deg);

      > span {
        position: absolute;
        top: 6px;
        left: 6px;
        font-size: 12px;
      }
    }
  }

  .card-warp {
    position: relative;
    border: 1px solid #e6e6e6;
    overflow: hidden;
    cursor: pointer;

    &.disabled {
      filter: grayscale(100%);
      cursor: not-allowed;
    }

    &.active {
      position: relative;
      border: 1px solid #2f54eb;
    }

    .card-type {
      position: absolute;
      top: 0;
      left: -15px;
      height: 32px;
      padding: 0 30px;
      color: rgba(0, 0, 0, 0.65);
      line-height: 32px;
      background-color: rgba(0, 0, 0, 0.06);
      transform: skewX(-45deg);

      .card-type-text {
        display: flex;
        align-items: center;
        justify-content: center;
        transform: skewX(45deg);
      }
    }

    .card-content {
      position: relative;
      padding: 30px 12px 30px 30px;
      overflow: hidden;
      .card-content-tabs {
        margin-top: 20px;
      }
      .card-item-avatar {
        margin-right: 16px;
        display: flex;
        align-items: center;
      }

      .card-item-body {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        width: 0;

        .ant-row {
          margin-top: 19px;
        }

        .condition-name {
          margin-top: 10px;
        }
      }

      .card-state {
        position: absolute;
        top: 30px;
        right: -12px;
        display: flex;
        justify-content: center;
        width: 100px;
        padding: 2px 0;
        background-color: rgba(#5995f5, 0.15);
        transform: skewX(45deg);

        &.success {
          background-color: @success-color-deprecated-bg;
        }

        &.warning {
          background-color: rgba(#ff9000, 0.1);
        }

        &.error {
          background-color: rgba(#e50012, 0.1);
        }

        .card-state-content {
          transform: skewX(-45deg);
        }
      }

      :deep(.card-item-content-title) {
        cursor: pointer;
        font-size: 16px;
        font-weight: 700;
        color: @primary-color;
        width: calc(100% - 100px);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      :deep(.card-item-heard-name) {
        font-weight: 700;
        font-size: 16px;
        margin-bottom: 12px;
      }

      :deep(.card-item-content-text) {
        color: rgba(0, 0, 0, 0.7);
        font-size: 12px;
      }
    }

    .card-content-top-line {
      &::before {
        position: absolute;
        top: 0;
        left: 30px + 10px;
        display: block;
        width: 15%;
        min-width: 64px;
        height: 2px;
        background-image: url("/images/rectangle.png");
        background-repeat: no-repeat;
        background-size: 100% 100%;
        content: " ";
      }
    }

    .card-content-bg-item {
      position: absolute;
      right: -5%;
      height: 100%;
      top: 0;
      background: linear-gradient(
        188.4deg,
        rgba(229, 0, 18, 0.03) 22.94%,
        rgba(229, 0, 18, 0) 94.62%
      );
      transform: skewX(-15deg);

      &.card-content-bg1 {
        width: 44.65%;
      }

      &.card-content-bg2 {
        width: calc(44.65% + 34px);
      }
    }

    .card-content-body {
      display: flex;
      position: relative;
      z-index: 99;
    }

    .card-mask {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 99;
      display: flex;
      justify-content: center;
      width: 100%;
      font-size: 16px;
      height: 136px;
      color: #fff;
      padding-top: 30px;
      background-color: rgba(#000, 0.45);
      cursor: pointer;
      transition: background-color 0.3s;

      &.mask-hover:hover {
        background-color: rgba(#000, 0.01);
        color: transparent;
      }

      &.mask-full {
        height: 100%;
      }

      .mask-content {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 24px !important;
        flex-direction: column;
      }
    }
  }

  &.item-active {
    position: relative;
    color: #2f54eb;

    .checked-icon {
      display: block;
    }

    .card-warp {
      border: 1px solid #2f54eb;
    }
  }

  .card-tools {
    display: flex;
    margin-top: 8px;

    .card-button {
      display: flex;
      flex-grow: 1;

      & > :deep(span, button) {
        width: 100%;
        border-radius: 0;
      }

      :deep(button) {
        width: 100%;
        border-radius: 0;
        background: #f6f6f6;
        border: 1px solid #e6e6e6;
        color: #2f54eb;

        &:hover {
          background-color: @primary-color-hover;
          border-color: @primary-color-hover;

          span {
            color: #fff !important;
          }
        }

        &:active {
          background-color: @primary-color-active;
          border-color: @primary-color-active;

          span {
            color: #fff !important;
          }
        }
      }

      &:not(:last-child) {
        margin-right: 8px;
      }

      &.delete {
        flex-basis: 60px;
        flex-grow: 0;

        :deep(button) {
          background: @error-color-deprecated-bg;
          border: 1px solid @error-color-outline;

          span {
            color: @error-color !important;
          }

          &:hover {
            background-color: @error-color-hover;

            span {
              color: #fff !important;
            }
          }

          &:active {
            background-color: @error-color-active;

            span {
              color: #fff !important;
            }
          }
        }
      }

      :deep(button[disabled]) {
        background: @disabled-bg;
        border-color: @disabled-color;

        span {
          color: @disabled-color !important;
        }

        &:hover {
          background-color: @disabled-active-bg;
        }

        &:active {
          background-color: @disabled-active-bg;
        }
      }

      // :deep(.ant-tooltip-disabled-compatible-wrapper) {
      //     width: 100%;
      // }
    }
  }
}
.selectedCard {
  border: 1px solid #2f54eb;
}
</style>
