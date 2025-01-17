<script setup name="When">
import DropdownButton from "../../DropdownButton";
import {useMouseEvent,} from "./hooks";
import {useI18n} from "vue-i18n";
import TermsItem from './Terms.vue'
import {
  defaultTermsValue
} from "./util";

const props = defineProps({
  isLast: {
    type: Boolean,
    default: true,
  },
  isFirst: {
    type: Boolean,
    default: true,
  },
  data: {
    type: Object,
    default: () => ({
      column: undefined,
      termType: 'eq',
      value: undefined,
    }),
  },
  whenIndex: {
    type: Number,
    default: 0
  },
  showDeleteBtn: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:data', 'add'])
const {show, mouseover, mouseout} = useMouseEvent(props.showDeleteBtn)
const { t: $t} = useI18n()
const termsData = computed(() => props.data.terms)

const paramsValue = reactive({
  type: 'and'
})

const typeSelect = () => {

}

const addWhen = () => {
  emit('add')
}

const onDelete = () => {

}

const termsItemAdd = () => {
  props.data.terms.push(defaultTermsValue)
  emit('update:data', toRaw(props.data))
}

</script>

<template>
  <div class="terms-params">
    <div class="terms-params-warp">
      <div v-if="!isFirst" class="term-type-warp">
      <DropdownButton
        :options="[
                  { label: $t('Terms.ParamsItem.9093430-0'), value: 'and' },
                  { label: $t('Terms.ParamsItem.9093430-1'), value: 'or' },
                ]"
        type="type"
        v-model:value="paramsValue.type"
        @select="typeSelect"
      />
      </div>
      <div
        class="terms-params-content"
        @mouseover="mouseover"
        @mouseout="mouseout"
      >
        <ConfirmModal
          :title="$t('Terms.WhenItem.9093425-2')"
          :onConfirm="onDelete"
          :show="show"
          className="terms-params-delete"
        >
          <AIcon type="CloseOutlined" />
        </ConfirmModal>
        <a-form-item v-for="(item, index) in termsData">
          <TermsItem
            :value="item"
            :isFirst="index === 0"
            :isLast="termsData.length - 1 === index"
            :whenIndex="whenIndex"
            :index="index"
            @add="termsItemAdd"
          />
        </a-form-item>
      </div>
      <div class="terms-group-add" @click="addWhen" v-if="isLast">
        <div class="terms-content">
          <AIcon type="PlusOutlined" />
          <span>{{ $t('Terms.WhenItem.9093425-3') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">

</style>
