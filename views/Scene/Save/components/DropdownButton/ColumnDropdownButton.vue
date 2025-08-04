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
        <div class="scene-select-options-content">
          <div class="content-left">
            <div
              v-for="item in group1"
              class="content-left-item"
              @click.stop="() => onGroupChange(item.value)"
            >
              <j-ellipsis>
                {{ item.fullName }}
              </j-ellipsis>
            </div>
          </div>
          <div class="content-right">
            <a-tabs v-if="tabsList.length" @change="sourceChange">
              <a-tab-pane
                v-for="sItem in tabsList"
                :key="sItem.column"
                :tab="sItem.name" ></a-tab-pane>
            </a-tabs>
            <a-tree
              v-model:expandedKeys="treeOpenKeys"
              ref="treeRef"
              :selectedKeys="selectValue ? [selectValue] : []"
              :treeData="dataSource"
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
        </div>
      </div>
    </template>
  </a-dropdown>
</template>

<script lang="ts" setup name="ColumnDropdownButton">
import type { PropType } from "vue";
import DropMenus from "./Menus.vue";
import DropdownTimePicker from "./Time.vue";
import { getOption } from "./util";
import type { DropdownButtonOptions } from "./util";
import { openKeysByTree } from "@ruleEngine/utils/comm";
import {debounce} from "lodash-es";
import {ParamsSourceKey} from "@ruleEngine/views/Scene/Save/components/Terms/util";
import {handleParamsGroupBySource} from "@ruleEngine/views/Scene/util";

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
});

const emit = defineEmits<Emit>();
const slots = Object.keys(useSlots());

const MultiDeviceSource = inject(ParamsSourceKey) // 多设备触发规则数组

const label = ref<LabelType>(props.placeholder);
const selectValue = ref(props.value);
const visible = ref(false);
const treeOpenKeys = ref<(string | number)[]>([]);
const treeRef = ref()

const group1 = ref([]) // 左侧菜单
const tabsList = ref([]) // 右侧顶部tabs
const dataSource = ref([]) // 右侧数据
const groupSourceMap = ref(new Map())

const searchValue = ref()

const searchOptions = computed(() => {
  if (searchValue.value) {
    return props.options.filter((option) => option.name.includes(searchValue.value) || option.multiTag);
  }
  return props.options;
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

const sourceChange = (e) => {
  console.log(e)
  treeRef.value?.scrollTo({ key: e, align: 'top', offset: 12 })
  treeOpenKeys.value = [e]
}

const onShowOverlay = () => {
  visible.value = true;
}

const onGroupChange = (v) => {
  const item = groupSourceMap.value.get(v);

  if (item.isMultiDevice) {
    tabsList.value = MultiDeviceSource.value
    const { data } = handleParamsGroupBySource(item.children, { sourceKey: 'options'})
    dataSource.value = data
  } else {
    const list: any[] = []
    if (item.children && item.children.length > 0) {
      item.children.forEach(child => {
        if (child.children && child.children.length > 0) {
          list.push({
            column: child.value,
            name: child.name,
          });
        }
      })
    }
    tabsList.value = list;
    dataSource.value = item.children
  }

  // TODO 创建provide 传入多设备标识，根据标识来使用ColumnDropdownButton 还是 DropdownButton
}

const handleGroupDataSource = () => {
  groupSourceMap.value.clear();
  let isMultiDeviceRule = false // 理论上来说只有一个数组是多设备规则
  const MultiDeviceSourceKeys = new Set(MultiDeviceSource.value.map(item => item.value))

  group1.value = props.options.map(item => {
    const _item: Record<string, any> = {
      children: item.children
    }
    if (!isMultiDeviceRule) {
      isMultiDeviceRule = !!item.children?.some(item => MultiDeviceSourceKeys.has(item.options?.sourceTrigger))
      if (isMultiDeviceRule) {
        _item.isMultiDevice = true
      }
    }
    groupSourceMap.value.set(item.column, _item)
    return {
      fullName: item.fullName,
      value: item.column
    }
  })
}

watch(() => MultiDeviceSource.value, (v) => {
  if (v.length > 0) {
    handleGroupDataSource()
  }
}, { immediate: true })

watch(() => props.options, () => {
  if (!props.options.length) return;
  handleGroupDataSource()
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
}, { immediate: true})

</script>

<style scoped lang="less">
@import "./index.less";
</style>
<style scoped lang="less">
.scene-select-content {

  .scene-select-options-content {
    display: flex;

    .content-left {
      width: 180px;
      border-right: 1px solid #f1f1f1;
      .content-left-item {
        padding: 4px 12px;
        cursor: pointer;

        &:hover {
          background-color: @primary-1;
        }

        &.selected {
          background-color: @primary-2;
        }
      }
    }

    .content-right {
      width: 600px;
      height: 414px;
    }
  }
}
</style>
