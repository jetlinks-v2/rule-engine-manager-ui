<template>
  <a-dropdown
    class="scene-select-value"
    trigger="click"
    v-model:visible="visible"
    :overlayStyle="{
      maxWidth: '300px',
    }"
    @visibleChange="visibleChange"
  >
    <div @click.prevent="visible = true">
      <slot :label="label">
        <div class="dropdown-button value">
          <AIcon v-if="!!icon" :type="icon" />
          <j-ellipsis style="max-width: 220px">
            {{ label }}
          </j-ellipsis>
        </div>
      </slot>
    </div>
    <template #overlay>
      <div class="scene-select-content">
        <a-tabs @change="tabsChange" v-model:activeKey="mySource">
          <a-tab-pane
            v-for="item in tabsOptions"
            :tab="item.label"
            :key="item.key"
          >
            <div class="select-box-content">
              <DropdownTimePicker
                v-if="['time', 'date'].includes(item.component)"
                type="time"
                v-model:value="myValue"
                @change="timeChange"
              />
              <template
                v-else-if="
                  ['select', 'enum', 'boolean'].includes(item.component)
                "
              >
                <DropdownMenus
                  v-if="
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
                <div class="scene-select-empty" v-else>
                  <a-empty />
                </div>
              </template>
              <template v-else-if="item.component === 'tree'">
                <div
                  style="min-width: 400px"
                  v-if="(item.key === 'upper' ? metricOptions : options).length"
                >
                  <a-tree
                    v-model:expandedKeys="treeOpenKeys"
                    :selectedKeys="myValue ? [myValue] : []"
                    :treeData="item.key === 'upper' ? metricOptions : options"
                    :height="450"
                    :virtual="true"
                    :fieldNames="{ key: treeKey }"
                    @select="treeSelect"
                  >
                    <template #title="{ name, description }">
                      <a-space>
                        {{ name }}
                        <span
                          v-if="description"
                          class="tree-title-description"
                          >{{ description }}</span
                        >
                      </a-space>
                    </template>
                  </a-tree>
                </div>
                <div class="scene-select-empty" v-else>
                  <a-empty />
                </div>
              </template>

              <j-value-item
                v-else
                v-model:modelValue="myValue"
                :itemType="item.component"
                :options="item.key === 'upper' ? metricOptions : options"
                :extraProps="props"
                @change="valueItemChange"
              />
            </div>
          </a-tab-pane>
        </a-tabs>
      </div>
    </template>
  </a-dropdown>
</template>

<script lang="ts" setup name="ParamsDropdown">
import type { ValueType } from "./typings";
import { defaultSetting } from "./typings";
import { DropdownMenus, DropdownTimePicker } from "../DropdownButton";
import { getOption } from "../DropdownButton/util";
import { openKeysByTree } from "../../../../../utils/comm";

type Emit = {
  (e: "update:value", data: ValueType): void;
  (e: "update:source", data: string): void;
  (
    e: "select",
    data: any,
    label?: string,
    labelObj?: Record<number, any>,
    option?: any
  ): void;
  (e: "tabChange", data: any): void;
};

const props = defineProps({
  ...defaultSetting,
});

const emit = defineEmits<Emit>();

const myValue = ref<ValueType>(props.value);
const mySource = ref<string>(props.source);
const label = ref<any>(props.placeholder);
const treeOpenKeys = ref<(string | number)[]>([]);
const visible = ref(false);

nextTick(() => {
  mySource.value = props.source;
  myValue.value = props.source === "metric" ? props.metric : props.value;
});

const tabsChange = (e: string) => {
  mySource.value = e;
  myValue.value = undefined;
  emit("update:source", mySource.value);
  emit("update:value", undefined);
  emit("tabChange", e);
  emit("select", {}, "", { 0: undefined });
};

const treeSelect = (v: any, option: any) => {
  const node = option.node;
  visible.value = false;
  label.value = node[props.labelName] || node.name || node.fullName;
  emit("update:value", node[props.valueName]);
  emit("select", node, label.value, { 0: label.value });
};

const valueItemChange = (e: string) => {
  label.value = e;
  emit("update:value", e);
  emit("select", e, label.value, { 0: label.value });
};

const onSelect = (e: string, option: any) => {
  visible.value = false;
  label.value = option[props.labelName];
  emit("update:value", e);
  emit("select", e, label.value, { 0: label.value }, option);
};

const timeChange = (e: any) => {
  label.value = e;
  visible.value = false;
  emit("update:value", e);
  emit("select", e, label.value, { 0: label.value });
};

const visibleChange = (v: boolean) => {
  visible.value = v;
};

watchEffect(() => {
  const _options = ["metric", "upper"].includes(props.source)
    ? props.metricOptions
    : props.options;
  const isMetric = props.source === "metric"; // 是否为指标值
  const _value = isMetric ? props.metric : props.value;
  const _valueName = isMetric ? "id" : props.valueName;
  const option = getOption(_options, _value as string, _valueName); // 回显label值
  myValue.value = isMetric ? props.metric : props.value;
  mySource.value = props.source;

  if (option) {
    label.value = option[props.labelName] || option.name || option.fullName;
    treeOpenKeys.value = openKeysByTree(_options, props.value, props.valueName);
  } else {
    if (isMetric) {
      // 处理指标值回显
      label.value =
        props.metric !== undefined
          ? props.value || props.placeholder
          : props.placeholder;
    } else {
      label.value = props.value !== undefined ? props.value : props.placeholder;
    }
  }
});
</script>

<style scoped lang="less">
@import "../DropdownButton/index.less";
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
