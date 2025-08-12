<template>
  <a-dropdown
    class="scene-select"
    trigger="click"
    v-model:visible="visible"
    @visibleChange="visibleChange"
  >
    <div @click.prevent="onShowOverlay">
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
            <a-input v-if="showSearch" allow-clear :placeholder="$t('MultiDevice.index-07221552-5')" @change="onSearchChange" >
              <template #suffix>
                <AIcon type="SearchOutlined" />
              </template>
            </a-input>
            <a-tabs @change="sourceChange">
              <a-tab-pane
                v-for="sItem in sources"
                :key="sItem.value"
                :tab="sItem.name" ></a-tab-pane>
            </a-tabs>

            <a-tree
              v-model:expandedKeys="treeOpenKeys"
              ref="treeRef"
              :selectedKeys="selectValue ? [selectValue] : []"
              :treeData="searchOptions"
              :virtual="true"
              :height="350"
              :fieldNames="{ key: valueName }"
              @select="treeSelect"
            >
              <template #title="{ column, name, fullName, description, multiTag }">
                <template v-if="multiTag" >
                  <AIcon type="icon-shebei" style="padding-right: 8px" />
                </template>
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
import DropMenus from "./Menus.vue";
import DropdownTimePicker from "./Time.vue";
import { getOption } from "./util";
import type { DropdownButtonOptions } from "./util";
import { openKeysByTree } from "@ruleEngine/utils/comm";
import {debounce} from "lodash-es";
import {useTreeSearch} from "@ruleEngine/views/Scene/Save/hooks";

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
  type: {
    type: String,
    default: "column", // 'column' | 'termType' | 'value' | 'type'
  },
  component: {
    type: String,
    default: "select", // 'select' | 'treeSelect'
  },
  sources: {
    type: Array,
    default: () => []
  },
  showSearch: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits<Emit>();
const slots = Object.keys(useSlots());

const label = ref<LabelType>(props.placeholder);
const selectValue = ref(props.value);
const visible = ref(false);
const treeOpenKeys = ref<(string | number)[]>([]);
const treeRef = ref()
const propsRef = toRefs(props);

const { searchValue, searchOptions } = useTreeSearch(propsRef.options, {
  labelName: 'name',
  valueName: props.valueName,
  onEnd: (selectedKeys) => {
    treeOpenKeys.value = selectedKeys
  }
})

const visibleChange = (v: boolean) => {
  visible.value = v;
};

const dropdownButtonClass = computed(() => ({
  "dropdown-button": true,
  [props.type]: true,
}));

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

const sourceChange = (e) => {
  treeRef.value?.scrollTo({ key: e, align: 'top', offset: 12 })
  const setKeys = new Set(treeOpenKeys.value)
  if (!setKeys.has(e)) {
    setKeys.add(e)
    treeOpenKeys.value = [...setKeys.values()]
  }
}

const onShowOverlay = () => {
  visible.value = true;
}

const onSearchChange = debounce((e) => {
  const { value } = e.target;
  searchValue.value = value;
},300)

watchEffect(() => {
  const option = getOption(props.options, props.value, props.valueName);
  selectValue.value = props.value;
  if (option) {
    // 数据回显
    label.value = option[props.labelName] || option.name;
    treeOpenKeys.value = openKeysByTree(
      props.options,
      props.value,
      props.valueName,
      props.valueName
    );
  } else {
    label.value = props.value !== undefined ? props.value : props.placeholder;
  }
});
</script>

<style scoped lang="less">
@import "./index.less";
</style>
