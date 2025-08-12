<template>
  <div :class="{ 'box-flex': showBuiltIn }" class="dropdown-button-box">
    <div v-if="showBuiltIn">
      <a-dropdown>
        <div class="type">
          <span style="padding-right: 12px">
              {{ $t(source === 'upper' ? 'MultiDevice.index-07221552-7' : 'MultiDevice.index-07221552-6') }}
            </span>
          <AIcon type="DownOutlined"/>
        </div>
        <template #overlay>
          <a-menu :selectedKeys="typeSelectKeys" style="width: 100%" @click="onTypeChange">
            <a-menu-item key="fixed">
              {{ $t('MultiDevice.index-07221552-6') }}
            </a-menu-item>
            <a-menu-item key="upper">
              {{ $t('MultiDevice.index-07221552-7') }}
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
    <a-dropdown
      v-model:visible="visible"
      class="scene-select-value"
      trigger="click"
      @visibleChange="visibleChange"
    >
      <div @click.prevent="visible = true">
        <slot :label="label">
          <div :class="{ 'dropdown-button': !showBuiltIn}" class="value">
            <AIcon v-if="!!icon" :type="icon"/>
            <j-ellipsis style="max-width: 220px">
              {{ label }}
            </j-ellipsis>
          </div>
        </slot>
      </div>
      <template #overlay>
        <div class="scene-select-content">
          <a-tabs v-if="(showBuiltIn && typeSelectKeys[0] === 'fixed') || (!showBuiltIn)" v-model:activeKey="mySource" @change="tabsChange">
            <a-tab-pane
              v-for="item in tabsOptions"
              :key="item.key"
              :tab="item.label"
            >
              <div class="select-box-content">
                <DropdownTimePicker
                  v-if="['time', 'date'].includes(item.component)"
                  v-model:value="myValue"
                  type="time"
                  @change="timeChange"
                />
                <template
                  v-else-if="
                    ['select', 'enum', 'boolean'].includes(item.component)
                  "
                >
                  <DropdownMenusMultiple
                    v-if="multiple"
                    :extra="props"
                    :fieldNames="{label: 'name', value: 'id'}"
                    :options="item.key === 'upper' ? metricOptions : options"
                    :value="myValue"
                    style="width: 100%"
                    @change="multipleChange"
                  />
                  <DropdownMenus
                    v-else-if="
                      (['metric', 'upper'].includes(item.key)
                        ? metricOptions
                        : options
                      ).length
                    "
                    :options="
                      ['metric', 'upper'].includes(item.key)
                        ? metricOptions
                        : options
                    "
                    :value="myValue"
                    :valueName="props.source === 'metric' ? 'id' : valueName"
                    @click="onSelect"
                  />
                  <div v-else class="scene-select-empty">
                    <a-empty/>
                  </div>
                </template>
                <template v-else-if="item.component === 'tree'">
                  <div
                    v-if="(item.key === 'upper' ? metricOptions : options).length"
                    style="padding: 0 10px"
                  >
                    <a-tree
                      v-model:expandedKeys="treeOpenKeys"
                      :fieldNames="{ key: treeKey }"
                      :height="350"
                      :selectedKeys="myValue ? [myValue] : []"
                      :treeData="item.key === 'upper' ? metricOptions : options"
                      style="width: auto;overflow-x: auto"
                      @select="treeSelect"
                    >
                      <template #title="{ name, description }">
                        <a-space>
                          <div class="no-warp">{{ name }}</div>
                          <div
                            v-if="description"
                            class="tree-title-description no-warp"
                          >
                            {{ description }}
                          </div>
                        </a-space>
                      </template>
                    </a-tree>
                    <!--                  </j-scrollbar>-->
                  </div>
                  <div v-else class="scene-select-empty">
                    <a-empty/>
                  </div>
                </template>

                <j-value-item
                  v-else-if="item.component === 'array'"
                  v-model:modelValue="myValue"
                  :extra="props"
                  :itemType="item.component"
                  :options="item.key === 'upper' ? metricOptions : options"
                  style="width: 100%"
                  @change="valueItemChange"
                />
                <j-value-item
                  v-else
                  v-model:modelValue="myValue"
                  :extraProps="props"
                  :itemType="itemType(item.component)"
                  :options="item.key === 'upper' ? metricOptions : options"
                  style="width: 100%"
                  @change="valueItemChange"
                />
              </div>
            </a-tab-pane>
          </a-tabs>
          <template v-else>
            <div style="width: 350px">
              <a-input :placeholder="$t('MultiDevice.index-07221552-5')" allow-clear @change="onSearchChange">
                <template #suffix>
                  <AIcon type="SearchOutlined"/>
                </template>
              </a-input>
              <a-tabs @change="sourceChange">
                <a-tab-pane
                  v-for="sItem in searchSources"
                  :key="sItem.value"
                  :tab="sItem.name"></a-tab-pane>
              </a-tabs>

              <a-tree
                ref="treeRef"
                v-model:expandedKeys="treeOpenKeys"
                :fieldNames="{ key: 'column' }"
                :height="350"
                :selectedKeys="myValue ? [myValue] : []"
                :treeData="searchOptions"
                :virtual="true"
                @select="(v, o) => treeSelect(v, o, 'column')"
              >
                <template #title="{ column, name, fullName, description, multiTag }">
                  <template v-if="multiTag">
                    <AIcon style="padding-right: 8px" type="icon-shebei"/>
                  </template>
                  <a-space>
                    {{ name || fullName }}
                    <span v-if="description" class="tree-title-description">{{
                        description
                      }}</span>
                  </a-space>
                </template>
              </a-tree>
            </div>
          </template>
        </div>
      </template>
    </a-dropdown>
  </div>
</template>

<script lang="ts" name="ParamsDropdown" setup>
import type {ValueType} from "./typings";
import {defaultSetting} from "./typings";
import {DropdownMenus, DropdownTimePicker, DropdownMenusMultiple} from "../DropdownButton";
import {getOption} from "../DropdownButton/util";
import {openKeysByTree} from "@ruleEngine/utils/comm";
import {useI18n} from 'vue-i18n'
import {debounce} from "lodash-es";

type Emit = {
  (e: "update:value", data: ValueType): void;
  (e: "valueBackups:value", data: ValueType): void;
  (e: "update:source", data: string): void;
  (
    e: "select",
    data: any,
    label?: string,
    labelObj?: Record<number, any>,
    option?: any,
    column?: string
  ): void;
  (e: "tabChange", data: any): void;
  (e: "sourceChange", data: string): void;
};

const props = defineProps({
  ...defaultSetting,
  showBuiltIn: {
    type: Boolean,
    default: false
  },
  metricOptions: {
    type: Array,
    default: () => []
  },
  columnOptions: {
    type: Array,
    default: () => []
  },
  sources: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits<Emit>();

const {t: $t} = useI18n()

const myValue = ref<ValueType>(props.valueBackups || props.value);
const mySource = ref<string>(props.source);
const label = ref<any>(props.placeholder);
const treeOpenKeys = ref<(string | number)[]>([]);
const visible = ref(false);

const searchValue = ref('')
const treeRef = ref()

const typeSelectKeys = ref(['fixed'])

const itemType = (type: string) => {
  if (['short', 'byte', 'word'].includes(type)) {
    return 'int'
  }

  if (type === 'file') {
    return 'string'
  }

  return type
}

const searchOptions = computed(() => {
  const filterTree = props.columnOptions.filter(item => item.others?.sourceTrigger || (item.column !== 'default' && item.multiTag))
  if (searchValue.value) {
    return filterTree.filter((option) => option.name.includes(searchValue.value) || option.multiTag);
  }
  return filterTree;
})

const searchSources = computed(() => {
  return props.sources.filter(item => item.value !== 'default')
})

const tabsChange = (e: string) => {
  mySource.value = e;
  myValue.value = undefined;
  emit("update:source", mySource.value);
  emit("update:value", undefined);
  emit("valueBackups:value", undefined);
  emit("tabChange", e);
  emit("select", {}, "", {0: undefined});
};

const treeSelect = (v: any, option: any, column?: string) => {
  const node = option.node;
  visible.value = false;
  label.value = node[props.labelName] || node.name || node.fullName;
  emit("update:value", node[props.valueName]);
  emit("valueBackups:value", node[props.valueName]);
  emit("select", node, label.value, {0: label.value}, undefined, column ? node[props.valueName] : undefined);
};

const valueItemChange = (e: string) => {
  label.value = e;
  emit("update:value", e);
  emit("valueBackups:value", e);
  emit("select", e, label.value, {0: label.value});
};

const multipleChange = (e: { fullName: string, value: any }[]) => {
  label.value = e.map(item => item.fullName);
  emit("update:value", e.map(item => item.value));
  emit("valueBackups:value", e.map(item => item.value));
  emit("select", e.map(item => item.value), label.value, {0: label.value});
};

const onSelect = (e: string, option: any) => {
  visible.value = false;
  label.value = option[props.labelName];
  emit("update:value", option[props.valueParamsName]);
  emit("valueBackups:value", e);
  emit("select", option[props.valueParamsName], label.value, {0: label.value}, option);
};

const timeChange = (e: any) => {
  label.value = e;
  visible.value = false;
  emit("update:value", e);
  emit("valueBackups:value", e);
  emit("select", e, label.value, {0: label.value});
};

const visibleChange = (v: boolean) => {
  visible.value = v;
};

const onTypeChange = (e) => {
  if (e.key !== typeSelectKeys.value[0]) {
    typeSelectKeys.value = [e.key]
    emit("update:source", e.key);
    emit("sourceChange", e.key);
    emit("update:value", undefined);
  }
}

const sourceChange = (e) => {
  treeRef.value?.scrollTo({key: e, align: 'top', offset: 12})
}

const onSearchChange = debounce((e) => {
  const {value} = e.target;
  searchValue.value = value;
}, 300)

nextTick(() => {
  mySource.value = props.source;
  myValue.value = props.source === "metric" ? props.metric : (props.valueBackups || props.value);
});

watch(() => [props.options, props.metricOptions, props.columnOptions], () => {
  // 1. 确定选项来源和值
  const isMetricSource = ["metric", "upper"].includes(props.source);
  const value = props.valueBackups || props.value;
  const isMetric = props.source === "metric";

  let options = props.options;

  if (isMetricSource) {
    options = props.columnOptions.length ? props.columnOptions : props.metricOptions;
  }

  // 2. 赋值
  myValue.value = isMetric ? props.metric : value || [];
  mySource.value = props.source;
  typeSelectKeys.value = [props.source === 'upper' ? 'upper' : 'fixed']

  // 3. 查找选项并更新标签
  const currentValue = isMetric ? props.metric : value;
  const valueName = isMetric ? "id" : props.valueName;

  const option = getOption(options, currentValue as string, valueName);

  if (option) {
    label.value = option[props.labelName] || option.name || option.fullName;
    treeOpenKeys.value = openKeysByTree(options, value, props.valueName);
  } else {
    // 如果没有找到选项，根据不同情况更新 label
    if (isMetric) {
      label.value = currentValue ?? props.placeholder;
    } else if (props.multiple && props.source === "fixed") {
      const selectedLabels = Array.isArray(value)
        ? value.map((item) => {
          const foundOption = options?.find((i) => i.value === item);
          return foundOption?.fullName || item;
        })
        : value;
      label.value = selectedLabels;
    } else {
      label.value = value ?? props.placeholder;
    }
  }
}, {immediate: true, flush: "post"})
</script>

<style lang="less" scoped>
@import "../DropdownButton/index.less";

.dropdown-button-box {
  cursor: pointer;

  &.box-flex {
    display: flex;
    background-color: rgba(188, 125, 238, 0.1);
    border: 1px solid #d9d9d9;
    border-radius: 8px;

    .value {
      background-color: transparent;
    }
  }

  .type, & .value {
    display: flex;
    padding: 0 8px;
    background-color: rgba(188, 125, 238, 0.1);
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .type {
    color: #692ca7;
    border-right: 1px solid #d9d9d9;
  }
}

.dropdown-button.value {
  padding: 6px 8px;
}

.select-box-content {
  overflow: auto;

  .no-warp {
    white-space: nowrap
  }
}

.manual-time-picker {
  position: absolute;
  top: -2px;
  left: 0;
  border: none;
  visibility: hidden;

  :deep(.ant-picker-input) {
    display: none;
  }
}
</style>
