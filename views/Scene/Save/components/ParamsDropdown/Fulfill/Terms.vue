<script setup name="FulfillTerms">
import DropdownButton from "../../../components/DropdownButton";
import {useMouseEvent, useAggOptions, useColumnOptions, useFulfillData} from "./hooks";
import {useI18n} from "vue-i18n";
import {
  defaultTermsValue
} from "./util";
import ParamsDropdown, {ArrayParamsDropdown, DoubleParamsDropdown} from "../../../components/ParamsDropdown/index";
import {isArray, isObject} from "lodash-es";
import {Form} from "ant-design-vue";
import {arrayParamsKey, doubleParamsKey, timeTypeKeys} from "../../../components/Terms/util";
import {watch} from "vue";
import {getOption} from "../../../components/DropdownButton/util";

const props = defineProps({
  isLast: {
    type: Boolean,
    default: true,
  },
  isFirst: {
    type: Boolean,
    default: true,
  },
  value: {
    type: Object,
    default: () => ({}),
  },
  termIndex: {
    type: Number,
    default: 0
  },
  showDeleteBtn: {
    type: Boolean,
    default: true,
  },
  showAggregationOption: {
    type: Boolean,
    default: false,
  },
  showBuildIn: {
    type: Boolean,
    default: false
  },
  builtInOptions: {
    type: Array
  },
  whenIndex: {
    type: Number
  },
  index: {
    type: Number
  }
})

const _defaultValue = defaultTermsValue()

const emit = defineEmits(['update:value', 'add', 'delete'])
const formItemContext = Form.useInjectFormItemContext();
const {show, mouseover, mouseout} = useMouseEvent(toRefs(props).showDeleteBtn)
const { t: $t} = useI18n()
const columnOptions = useColumnOptions()
const aggregationOption = useAggOptions()
const fulFillData = useFulfillData()
const columnType = ref();
const termTypeOptions = ref([])
const valueOptions = ref([])
const tabsOptions = ref([
  { label: $t('Terms.ParamsItem.9093430-7'), key: "fixed", component: "string" },
]);

if (props.showBuildIn) {
  tabsOptions.value = tabsOptions.value.filter(item => item.key !== 'upper')
  tabsOptions.value.push({
    label: $t('variableItem.BuildIn.910899-1'),
    key: 'upper',
    component: 'tree'
  })
}

const paramsValue = reactive({
  column: props.value?.column,
  type: props.value?.type,
  termType: props.value?.termType,
  value: props.value?.value || _defaultValue.value,
  function: props.value.function,
  key: props.value.key || _defaultValue.key
})

const showDouble = computed(() => {
  return paramsValue.termType
    ? doubleParamsKey.includes(paramsValue.termType)
    : false;
});

const showArray = computed(() => {
  return paramsValue.termType
    ? arrayParamsKey.includes(paramsValue.termType)
    : false;
});

const handOptionByColumn = (option) => {
  if (option) {
    termTypeOptions.value = option.termTypes || [];
    tabsOptions.value[0].component = option.dataType;
    columnType.value = option.dataType;

    if (option.dataType === "boolean") {
      // 处理_options为Object时
      const _options = option.options || option.others;
      if (isObject(_options)) {
        const bool = _options.bool;
        valueOptions.value = [
          { label: bool.falseText, value: String(bool.falseValue) },
          { label: bool.trueText, value: String(bool.trueValue) },
        ];
      } else {
        valueOptions.value = option.options?.map((item) => ({
          ...item,
          label: item.name,
          value: item.id,
        })) || [
          { label: $t('Terms.ParamsItem.9093430-9'), value: "true" },
          { label: $t('Terms.ParamsItem.9093430-10'), value: "false" },
        ];
      }
    } else if (option.dataType === "enum") {
      valueOptions.value =
        option.options?.map((item) => ({
          ...item,
          label: item.name,
          value: item.id,
        })) || [];
    } else {
      valueOptions.value = (option.options || []).map((item) => ({
        ...item,
        label: item.name,
        value: item.id,
      }));
    }
  } else {
    termTypeOptions.value = [];
    valueOptions.value = [];
  }
}

const typeSelect = () => {
  valueSelect()
}

const termAdd = () => {
  emit('add')
}

const columnSelect = (option) => {
  const dataType = option.dataType;
  const hasTypeChange = dataType !== tabsOptions.value[0].component;
  let termTypeChange = false;
  // 如果参数类型未发生变化，则不修改操作符以及值
  const termTypes = option.termTypes;

  if (
    !termTypes.some((item) => paramsValue.termType === item.id)
  ) {
    // 修改操作符
    termTypeChange = true;
    paramsValue.termType = termTypes?.length ? termTypes[0].id : "eq";
  }
  if (
    hasTypeChange ||
    !tabsOptions.value.every((a) => a.key === paramsValue.value.source)
  ) {
    // 类型发生变化
    paramsValue.termType = termTypes?.length ? termTypes[0].id : "eq";
    paramsValue.value = {
      source: tabsOptions.value[0].key,
      value: undefined,
    };
  } else if (termTypeChange) {
    const _source = paramsValue.value?.source || tabsOptions.value[0].key;
    const oldValue = isArray(paramsValue.value.value)
      ? paramsValue.value.value[0]
  : paramsValue.value.value;
    const value = arrayParamsKey.includes(paramsValue.termType)
      ? [oldValue, undefined]
      : oldValue;
    paramsValue.value = {
      source: _source,
      value: value,
    };
  }

  handOptionByColumn(option);

  valueSelect()
}

const termsTypeSelect = (e) => {
  const oldValue = isArray(paramsValue.value.value) ? paramsValue.value.value[0] : paramsValue.value.value;
  let value = arrayParamsKey.includes(e.key) ? [oldValue, undefined] : oldValue;

  // 如果上次的值 在 timeTypeKeys中 则不变
  if (columnType.value === "date") {
    if (timeTypeKeys.includes(e.key)) {
      if (tabsOptions.value[0].component !== "int") {
        value = undefined;
      }
      tabsOptions.value[0].component = "int";
    } else if (
      !timeTypeKeys.includes(e.key) && tabsOptions.value[0].component === "int"
    ) {
      value = undefined;
      tabsOptions.value[0].component = "date";
    }
  }

  const _source = paramsValue.value?.source || tabsOptions.value[0].key;
  const newValue = {
    source: _source,
    value: value,
  };
  if (["isnull", "notnull"].includes(e.key)) {
    newValue.value = 1;
    newValue.source = tabsOptions.value[0].key;
  }
  paramsValue.value = newValue;
  valueSelect()
}

const valueSelect = () => {
  if(props.showAggregationOption) {
    fulFillData.value.aggregation = [{...paramsValue}]
  } else {
    fulFillData.value.filter[props.whenIndex].terms[props.index] = {...paramsValue}
  }
  nextTick(() => {
    formItemContext.onFieldChange();
  })
}

const onDelete = () => {
  emit('delete')
}

watch(
  () => JSON.stringify(columnOptions.value),
  () => {

    if (paramsValue.column && columnOptions.value) {
      const option = getOption(
        columnOptions.value,
        paramsValue.column,
        "column"
      );
      const copyValue = props.value;
      if (option && Object.keys(option).length) {
        handOptionByColumn(option);
        if (copyValue.error) {
          copyValue.error = false;
          emit("update:value", copyValue);
          formItemContext.onFieldChange();
        }
      } else {
        copyValue.error = true;
        emit("update:value", copyValue);
        formItemContext.onFieldChange();
      }
      //数据类型为date时判断是选择还是手动输入
      if (option?.dataType === "date") {
        if (timeTypeKeys.includes(paramsValue.termType || "")) {
          if (tabsOptions.value[0].component !== "int") {
          }
          tabsOptions.value[0].component = "int";
        } else if (
          !timeTypeKeys.includes(paramsValue.termType || "") &&
          tabsOptions.value[0].component === "int"
        ) {
          tabsOptions.value[0].component = "date";
        }
      }
    }
  },
  { immediate: true }
);

// watch(() => JSON.stringify(paramsValue), () => {
//   if(props.showAggregationOption) {
//     emit('update:value', toRaw(paramsValue))
//   }
// })
</script>

<template>
  <div class="terms-params-item">
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
    <div class="params-item_button" @mouseover="mouseover" @mouseout="mouseout">
      <ConfirmModal
        :title="$t('Terms.WhenItem.9093425-2')"
        :onConfirm="onDelete"
        :show="show"
        className="terms-params-delete"
      >
        <AIcon type="CloseOutlined" />
      </ConfirmModal>
      <DropdownButton
        :options="columnOptions"
        icon="icon-zhihangdongzuoxie-1"
        type="column"
        value-name="column"
        label-name="fullName"
        :placeholder="$t('Terms.ParamsItem.9093430-2')"
        v-model:value="paramsValue.column"
        component="treeSelect"
        @select="columnSelect"
      />
      <DropdownButton
        v-if="showAggregationOption"
        :options="aggregationOption"
        type="termType"
        value-name="id"
        label-name="name"
        :placeholder="$t('FulFill.Terms-4029416-0')"
        v-model:value="paramsValue.function"
        @select="valueSelect"
      />
      <DropdownButton
        :options="termTypeOptions"
        type="termType"
        value-name="id"
        label-name="name"
        :placeholder="$t('FulFill.Terms-4029416-1')"
        v-model:value="paramsValue.termType"
        @select="termsTypeSelect"
      />
      <div
        v-if="!['notnull', 'isnull'].includes(paramsValue.termType)"
        style="display: flex"
      >
        <DoubleParamsDropdown
          v-if="showDouble"
          icon="icon-canshu"
          :placeholder="$t('Terms.ParamsItem.9093430-4')"
          :options="valueOptions"
          :tabsOptions="tabsOptions"
          :metricOptions="builtInOptions"
          v-model:value="paramsValue.value.value"
          v-model:source="paramsValue.value.source"
          @select="valueSelect"
        />
        <ArrayParamsDropdown
          v-else-if="showArray"
          icon="icon-canshu"
          :placeholder="$t('Terms.ParamsItem.9093430-4')"
          :options="valueOptions"
          :tabsOptions="tabsOptions"
          :metricOptions="builtInOptions"
          v-model:value="paramsValue.value.value"
          v-model:source="paramsValue.value.source"
          @select="valueSelect"
        />
        <ParamsDropdown
          v-else
          icon="icon-canshu"
          :placeholder="$t('Terms.ParamsItem.9093430-4')"
          :options="valueOptions"
          :tabsOptions="tabsOptions"
          :metricOptions="builtInOptions"
          v-model:value="paramsValue.value.value"
          v-model:source="paramsValue.value.source"
          @select="valueSelect"
        />
      </div>
    </div>
    <div class="term-add" @click.stop="termAdd" v-if="isLast">
      <div class="terms-content">
        <AIcon type="PlusOutlined" style="font-size: 12px" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">

</style>
