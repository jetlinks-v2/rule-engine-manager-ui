<template>
  <a-dropdown
    class="scene-select"
    trigger="click"
    v-model:open="visible"
    @openChange="visibleChange"
  >
    <div @click.prevent="visible = true">
      <slot :label="label">
        <div :class="dropdownButtonClass">
          <AIcon v-if="!!icon" :type="icon" />
          <j-ellipsis style="max-width: 220px">
            {{ label }}
          </j-ellipsis>
        </div>
      </slot>
    </div>
    <template #overlay>
      <div class="scene-select-content">
        <DropdownTimePicker
          v-if="['date', 'time'].includes(component)"
          :type="component"
          @change="timeSelect"
        />
        <template v-else-if="options.length">
          <drop-menus
            v-if="component === 'select'"
            :value="selectValue"
            :options="options"
            :valueName="valueName"
            @click="menuSelect"
          />
          <div style="min-width: 400px" v-else>
            <a-input
              v-if="showSearch"
              v-model:value="treeSearchValue"
              allow-clear
              :placeholder="$t('DropdownButton.DropdownButton.20260414-0')"
              style="margin-bottom: 8px"
            >
              <template #suffix>
                <AIcon type="SearchOutlined" />
              </template>
            </a-input>
            <a-tree
              v-if="treeOptions.length"
              v-model:expandedKeys="treeOpenKeys"
              :selectedKeys="selectValue ? [selectValue] : []"
              :treeData="treeOptions"
              style="width: auto;  height: 350px;overflow: auto;"
              :virtual="true"
              :autoExpandParent="true"
              :fieldNames="{ key: valueName }"
              @select="treeSelect"
            >
              <template #title="{ column, name, fullName, description }">
                <template v-if="slots.includes('title')">
                  <slot name="title" :data="{column, name, fullName}"></slot>
                </template>
                <a-space v-else>
                  {{ name || fullName }}
                  <span v-if="description" class="tree-title-description">{{
                    description
                  }}</span>
                </a-space>
              </template>
            </a-tree>
            <a-empty v-else style="margin-top: 24px" />
          </div>
        </template>
        <div class="scene-select-empty" v-else>
          <a-empty />
        </div>
      </div>
    </template>
  </a-dropdown>
</template>

<script lang="ts" setup name="DropdownButton">
import type { PropType } from "vue";
import { cloneDeep } from "lodash-es";
import { useI18n } from "vue-i18n";
import DropMenus from "./Menus.vue";
import DropdownTimePicker from "./Time.vue";
import { getOption } from "./util";
import type { DropdownButtonOptions } from "./util";

type LabelType = string | number | boolean | undefined;

type Emit = {
  (e: "update:value", data: string | number): void;
  (e: "select", data: DropdownButtonOptions | string | undefined): void;
};

const props = defineProps({
  icon: {
    type: String,
    default: "",
  },
  placeholder: {
    type: String,
    default: undefined,
  },
  value: {
    type: [String, Number, Boolean],
    default: undefined,
  },
  valueName: {
    type: String,
    default: "value",
  },
  labelName: {
    type: String,
    default: "label",
  },
  options: {
    type: Array as PropType<Array<DropdownButtonOptions>>,
    default: () => [],
  },
  columnOptionsMap: {
    type: Object,
    default: () => new Map()
  },
  type: {
    type: String,
    default: "column", // 'column' | 'termType' | 'value' | 'type'
  },
  component: {
    type: String,
    default: "select", // 'select' | 'treeSelect'
  },
  showSearch: {
    type: Boolean,
    default: false,
  }
});

const emit = defineEmits<Emit>();
const { t: $t } = useI18n();
const slots = Object.keys(useSlots());

const label = ref<LabelType>(props.placeholder);
const selectValue = ref(props.value);
const visible = ref(false);
const treeSearchValue = ref("");
const treeOpenKeys = ref<(string | number)[]>([]);

const syncTreeOpenKeys = () => {
  if (!props.columnOptionsMap || !props.value) {
    treeOpenKeys.value = [];
    return;
  }

  let currentId = props.value;
  const openKeys: (string | number)[] = [];

  while (currentId) {
    openKeys.push(currentId);
    const currentItem = props.columnOptionsMap.get(currentId);
    currentId = currentItem?.pId;
  }

  treeOpenKeys.value = openKeys;
};

const visibleChange = (v: boolean) => {
  visible.value = v;
  if (!v) {
    treeSearchValue.value = "";
    syncTreeOpenKeys();
  }
};

const dropdownButtonClass = computed(() => ({
  "dropdown-button": true,
  [props.type]: true,
}));

const filterTreeOptions = (
  data: DropdownButtonOptions[],
  keyword: string,
): { treeData: DropdownButtonOptions[]; expandedKeys: (string | number)[] } => {
  const searchValue = keyword.trim().toLowerCase();

  if (!searchValue) {
    return {
      treeData: data,
      expandedKeys: [],
    };
  }

  const expandedKeys = new Set<string | number>();

  const loop = (nodes: DropdownButtonOptions[]): DropdownButtonOptions[] => {
    return nodes.reduce((result: DropdownButtonOptions[], node) => {
      const children = Array.isArray(node.children) ? loop(node.children) : [];
      const keywords = [
        node.name,
        node.fullName,
        node.description,
        node.label,
        node[props.labelName],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matched = keywords.includes(searchValue);

      if (matched || children.length) {
        expandedKeys.add(node[props.valueName]);
        result.push({
          ...node,
          children,
        });
      }

      return result;
    }, []);
  };

  return {
    treeData: loop(cloneDeep(data)),
    expandedKeys: Array.from(expandedKeys),
  };
};

const treeOptions = computed(() => {
  const { treeData } = filterTreeOptions(props.options, treeSearchValue.value);
  return treeData;
});

watch(treeSearchValue, (value) => {
  if (!value.trim()) {
    syncTreeOpenKeys();
    return;
  }

  const { expandedKeys } = filterTreeOptions(props.options, value);
  treeOpenKeys.value = expandedKeys;
});

const treeSelect = (v: any, option: any) => {
  const node = option.node;
  visible.value = false;
  label.value = node.fullName || node.name;
  selectValue.value = v[0];
  emit("update:value", node[props.valueName]);
  emit("select", node);
};

const timeSelect = (v: string) => {
  selectValue.value = v;
  visible.value = false;
  emit("update:value", v);
  emit("select", v);
};

const menuSelect = (v: string, option: any) => {
  selectValue.value = v;
  visible.value = false;
  emit("update:value", v);
  emit("select", option);
};

watchEffect(() => {
  let option

  if (!props.columnOptionsMap?.size) {
    option = getOption(props.options, props.value, props.valueName);
  } else {
    option = props.columnOptionsMap.get(props.value);
  }

  selectValue.value = props.value;
  if (option) {
    // 数据回显
    label.value = option[props.labelName] || option.name;

    if (props.columnOptionsMap) {
      syncTreeOpenKeys();
    }
  } else {
    label.value = props.value !== undefined ? props.value : props.placeholder;
  }
});
</script>

<style scoped lang="less">
@import "./index.less";
</style>
