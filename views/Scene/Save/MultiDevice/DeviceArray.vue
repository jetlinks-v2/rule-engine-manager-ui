<script setup name="DeviceArray">
import Title from '../components/Title.vue'
import AddModel from '../Device/AddModal.vue'
import AddButton from '../components/AddButton.vue'
import { EventEmitter, DeviceEmitterKey } from '../util';
import {randomString} from "@jetlinks-web/utils";
import {useI18n} from "vue-i18n";

const props = defineProps({
  data: { type: Array, default: () => [] },
})

const { t: $t } = useI18n()
const visible = ref(false);
const detailCache = ref({})
const indexCache = ref(0)
const type = ref('add')

const showModel = (record, index) => {
  type.value = record ? 'edit' : 'add'
  detailCache.value = record || {}
  indexCache.value = index
  visible.value = true;
}

const onSave = (record, options) => {
  record.options = options
  if (!record.options.sourceTrigger) {
    record.options.sourceTrigger = randomString(12)
  }

  if (type.value === 'add') {
    props.data.push(record)
  } else {
    props.data.splice(indexCache.value, 1, record)
  }

  visible.value = false
  EventEmitter.emit(DeviceEmitterKey, props.data)
}

const onDelete = (index) => {
  props.data.splice(index, 1)
  EventEmitter.emit(DeviceEmitterKey, props.data)
}

</script>

<template>
  <div >
    <AddButton
     style="width: 100%;overflow-x: auto;overflow-y: hidden;"
    >
      <template #button>
        <div class="device-overflow">
          <div class="device-buttons">
            <a-space>
              <div class="rule-button add-button add-circular" v-for='(item, index) in data' @click="() => showModel(item, index)">
                <div class="rule-title">{{$t("MultiDevice.index-07221552-3",[index+1])}}</div>
                <Title :options='item.options || []' />
                <ConfirmModal
                  :title="$t('ListItem.FilterGroup.9667710-2')"
                  :onConfirm="() => onDelete(index)"
                  className="remove-button"
                >
                  <AIcon type="CloseOutlined" />
                </ConfirmModal>
              </div>
              <div class="rule-button add-button add-circular" @click="() => showModel(null)">
                <Title :options='[]' />
              </div>
            </a-space>
          </div>
        </div>
      </template>
    </AddButton>
    <AddModel v-if='visible' @cancel='visible = false' @save='onSave' :value='detailCache' :options='detailCache.options?.trigger' />
  </div>
</template>

<style scoped lang="less">

.rule-button {
  display: inline-block;
  font-size: 14px;
  line-height: 22px;
  position: relative;
  min-width: max-content;
}

.add-circular {
  padding: 6px 20px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 22px;
}

.remove-button {
  position: absolute;
  border: none;
  border-radius: 50%;
  top: 0;
  right: 0;
  width: 20px;
  height: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  /* 初始状态：完全透明 (隐藏) */
  opacity: 0;
  /* 添加过渡效果，让显示/隐藏更平滑 */
  transition: opacity 0.3s ease-in-out;
  transform: translate(0, -50%);
  color: #999;
  line-height: 20px;
  text-align: center;
  background-color: #f1f1f1;

  &.show {
    display: block;
  }

  &:hover {
    background-color: #f3f3f3;
  }
}

.add-button {
  color: #777;

  &:hover,
  &:active {
    border-color: #d0d0d0;
  }

  /* 当鼠标悬停在 .item-container 上时，将其内部的 .remove-button 的 opacity 变为 1 (显示) */
  &:hover .remove-button {
    opacity: 1;
  }

  .rule-title {
    position: absolute;
    top: 0;
    left: 0;
    transform: translate(0, -50%);
    font-weight: bold;
    font-size: 13px;
  }
}

</style>
