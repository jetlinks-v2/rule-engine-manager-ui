<template>
  <ParamsDropdown
    :options="handleOptions"
    :tabsOptions="tabOptions"
    :metricOptions="upperOptions"
    v-model:value="_value"
    v-model:source="_source"
    valueName="id"
    labelName="fullName"
    treeKey="id"
    @select="onChange"
  >
    <template v-slot="{ label }">
      <a-input :value="label" readonly :placeholder="$t('actions.FunctionItem.9667832-0')" />
    </template>
  </ParamsDropdown>
</template>

<script lang="ts" setup name="FunctionItem">
import { cloneDeep } from "lodash-es";
import ParamsDropdown from "../../../components/ParamsDropdown";
import { handleParamsData } from "./index";
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
  data: {
    type: Object,
    default: () => {},
  },
  builtInList: {
    type: Array,
    default: () => [],
  },
  value: {
    type: String,
  },
  upperKey: {
    type: String,
  },
  source: {
    type: String,
    default: "fixed",
  },
});

const emit = defineEmits([
  "update:value",
  "update:source",
  "update:upperKey",
  "change",
]);

const _value = ref();
const _source = ref();

const tabOptions = computed(() => {
  return [
    {
      label: $t('actions.FunctionItem.9667832-1'),
      component: props.data?.valueType?.type,
      key: "fixed",
    },
    {
      label: $t('actions.FunctionItem.9667832-2'),
      component: "tree",
      key: "upper",
    },
  ];
});

const handleOptions = computed(() => {
  const _item = props.data?.valueType || "int";
  const _type = _item?.type;
  if (_type === "boolean") {
    return [
      {
        label: _item.trueText || true,
        value: _item.trueValue || true,
        id: String(_item.trueValue || true),
      },
      {
        label: _item.falseText || false,
        value: _item.falseValue || false,
        id: String(_item.falseValue || false),
      },
    ];
  }
  if (_type === "enum") {
    return _item?.elements.map((i: any) => {
      return {
        label: i.text,
        value: i.value,
        id: i.value,
      };
    });
  }
  return [];
});

const filterParamsData = (type?: string, data?: any[]): any[] => {
  if (type && data) {
    const list = data.filter((item) => {
      if (item.children) {
        const _children = filterParamsData(type, item.children);
        item.children = _children;
        return _children.length ? true : false;
      } else if (item.type === type) {
        //   optionMap.current.set(item.id, item);
        return true;
      }
      return false;
    });
    return handleParamsData(list);
  }
  return data || [];
};

const upperOptions = computed(() => {
  return filterParamsData(
    props.data.valueType?.type,
    cloneDeep(props?.builtInList)
  );
});

const onChange = (e: any, label: string, option: any) => {
  const objValue: any = { source: _source.value, value: _value.value };
  if (_source.value === "upper") {
    objValue.upperKey = _value.value;
    emit("update:upperKey", _value.value);
  }
  emit("update:value", _value.value);
  emit("update:source", _source.value);
  emit("change", objValue, e, option, props.data);
};

watchEffect(() => {
  _value.value = props.value;
  _source.value = props.source || "fixed";
});
</script>
