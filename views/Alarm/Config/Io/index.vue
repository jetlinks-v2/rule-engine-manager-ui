<template>
  <div>
    <a-row :gutter="24">
      <a-col :span="14">
        <div class="alarmFlow-left">
          <a-card
            :head-style="{ borderBottom: 'none', height: '30px' }"
            :bordered="false"
          >
            <template #title>
              <div class="alarmTitle">
                <span>{{ $t('Io.index.945942-0') }}</span>
                <a-tooltip :title="$t('Io.index.945942-1')">
                  <AIcon
                    type="QuestionCircleOutlined"
                    style="margin-left: 6px; line-height: 35px"
                  />
                </a-tooltip>

                <j-permission-button
                  type="link"
                  @click="showOutput"
                  hasPermission="device/Instance:update"
                >
                  <template #icon><AIcon type="EditOutlined" /></template>
                </j-permission-button>
              </div>
            </template>
            <a-descriptions
              bordered
              :labelStyle="{ width: 112 + 'px' }"
              :contentStyle="{ minWidth: 100 + 'px' }"
              :column="2"
            >
              <a-descriptions-item
                :label="$t('Io.index.945942-2')"
                :content-style="{ minWidth: '200px' }"
                ><a-badge
                  :status="output?.running ? 'success' : 'error'"
                  :text="output?.data?.config?.config?.address || ''"
                ></a-badge
              ></a-descriptions-item>
              <a-descriptions-item label="topic">{{
                output?.data?.config?.config?.topic || ""
              }}</a-descriptions-item>
              <a-descriptions-item :label="$t('Io.index.945942-3')" :span="2"
                ><a-badge
                  :status="
                    output?.data?.state?.value === 'enabled'
                      ? 'success'
                      : 'error'
                  "
                  :text="output?.data?.state?.text || ''"
                ></a-badge
              ></a-descriptions-item>
            </a-descriptions>
          </a-card>
          <a-card
            :head-style="{ borderBottom: 'none', height: '30px' }"
            :bordered="false"
          >
            <template #title>
              <div class="alarmTitle">
                <span>{{ $t('Io.index.945942-4') }}</span>
                <a-tooltip :title="$t('Io.index.945942-5')">
                  <AIcon
                    type="QuestionCircleOutlined"
                    style="margin-left: 6px; line-height: 35px"
                  />
                </a-tooltip>
                <j-permission-button
                  type="link"
                  @click="showInput"
                  hasPermission="device/Instance:update"
                >
                  <template #icon><AIcon type="EditOutlined" /></template
                ></j-permission-button>
              </div>
            </template>
            <a-descriptions
              bordered
              :labelStyle="{ width: 112 + 'px' }"
              :contentStyle="{ minWidth: 150 + 'px' }"
              :column="2"
            >
              <a-descriptions-item :label="$t('Io.index.945942-2')"
                ><a-badge
                  :status="input?.running ? 'success' : 'error'"
                  :text="input?.data?.config?.config?.address || ''"
                ></a-badge
              ></a-descriptions-item>
              <a-descriptions-item label="topic">{{
                input?.data?.config?.config?.topic || ""
              }}</a-descriptions-item>
              <a-descriptions-item :label="$t('Io.index.945942-3')" :span="2"
                ><a-badge
                  :status="
                    input?.data?.state?.value === 'enabled'
                      ? 'success'
                      : 'error'
                  "
                  :text="input?.data?.state?.text || ''"
                ></a-badge
              ></a-descriptions-item>
            </a-descriptions>
          </a-card>
        </div>
      </a-col>
      <a-col :span="10">
        <div class="alarmFlow-right">
          <div class="doc">
            <h1>{{ $t('Io.index.945942-6') }}</h1>
            <div class="image">
              <a-image
                width="100%"
                :src="configImages.io"
              ></a-image>
            </div>
            <h1>{{ $t('Io.index.945942-7') }}</h1>
            <div>
              {{ $t('Io.index.945942-8') }}
            </div>
            <h2>{{ $t('Io.index.945942-9') }}</h2>
            <div>
              <a-table
                :dataSource="outputData"
                :pagination="false"
                :columns="outputColumns"
              ></a-table>
            </div>
            <h2>{{ $t('Io.index.945942-10') }}</h2>
            <div v-html="markdownOutputText" class="code"></div>
            <div>{{ $t('Io.index.945942-11') }}</div>
            <h2>{{ $t('Io.index.945942-12') }}</h2>
            <div>
              <a-table
                :dataSource="subData"
                :pagination="false"
                :columns="subColumns"
              ></a-table>
            </div>
            <h2>{{ $t('Io.index.945942-10') }}</h2>
            <div class="code" v-html="markdownSubText"></div>
          </div>
        </div>
      </a-col>
    </a-row>
    <InputSave
      :data="input"
      v-if="inputVisible"
      @closeModel="closeInput"
      @saveSuc="saveInput"
    />
    <OutputSave
      :data="output"
      v-if="outputVisible"
      @closeModel="closeOutput"
      @saveSuc="saveOutput"
    />
  </div>
</template>

<script lang="ts" setup>
import InputSave from "./Save/input.vue";
import OutputSave from "./Save/output.vue";
import { getDataExchange } from "../../../../api/config";
import { marked } from "marked";
import { configImages } from "../../../../assets/index";
import { useI18n } from 'vue-i18n';

const { t: $t } = useI18n();
let input = ref<any>();
let output = ref<any>();
const outputData = [
  {
    key: "alarmConfigName",
    name: $t('Io.index.945942-13'),
    type: "string",
    desc: $t('Io.index.945942-14'),
    example: $t('Io.index.945942-15'),
  },
  {
    key: "alarmConfigId",
    name: $t('Io.index.945942-16'),
    type: "string",
    desc: $t('Io.index.945942-17'),
    example: "1605111722418597888",
  },
  {
    key: "Id",
    name: $t('Io.index.945942-18'),
    type: "string",
    desc: $t('Io.index.945942-19'),
    example: "1515992841393119232",
  },
  {
    key: "alarmRecordId",
    name: $t('Io.index.945942-20'),
    type: "string",
    desc: $t('Io.index.945942-21'),
    example: "ba33a59ca5ebe3dccfcd75fd0575be4e",
  },
  {
    key: "targetType",
    name: $t('Io.index.945942-22'),
    type: "string",
    desc: $t('Io.index.945942-23'),
    example: $t('Io.index.945942-24'),
  },
  {
    key: "targetId",
    name: $t('Io.index.945942-25'),
    type: "string",
    desc: $t('Io.index.945942-26'),
    example: "1583300346713661440",
  },
  {
    key: "targetName",
    name: $t('Io.index.945942-27'),
    type: "string",
    desc: $t('Io.index.945942-28'),
    example: $t('Io.index.945942-29'),
  },
  {
    key: "alarmTime",
    name: $t('Io.index.945942-30'),
    type: "long",
    desc: $t('Io.index.945942-31'),
    example: "1651233650840",
  },
  {
    key: "sourceType",
    name: $t('Io.index.945942-32'),
    type: "string",
    desc: $t('Io.index.945942-33'),
    example: "device",
  },
  {
    key: "sourceId",
    name: $t('Io.index.945942-34'),
    type: "string",
    desc: $t('Io.index.945942-35'),
    example: "1605138218826821632",
  },
  {
    key: "sourceName",
    name: $t('Io.index.945942-36'),
    type: "string",
    desc: $t('Io.index.945942-37'),
    example: $t('Io.index.945942-38'),
  },
  {
    key: "level",
    name: $t('Io.index.945942-39'),
    type: "int",
    desc: $t('Io.index.945942-40'),
    example: 1,
  },
  {
    key: "description",
    name: $t('Io.index.945942-41'),
    type: "string",
    desc: $t('Io.index.945942-42'),
    example: $t('Io.index.945942-43'),
  },
];
const subData = [
  {
    key: "alarmRecordId",
    name: $t('Io.index.945942-20'),
    type: "string",
    require: $t('Io.index.945942-44'),
    desc: $t('Io.index.945942-21'),
    example: "ba33a59ca5ebe3dccfcd75fd0575be4e",
  },
  {
    key: "alarmConfigId",
    name: $t('Io.index.945942-16'),
    type: "string",
    require: $t('Io.index.945942-44'),
    desc: $t('Io.index.945942-17'),
    example: "1605111722418597888",
  },
  {
    key: "alarmTime",
    name: $t('Io.index.945942-30'),
    type: "long",
    require: $t('Io.index.945942-44'),
    desc: $t('Io.index.945942-31'),
    example: "1651233650840",
  },
  {
    key: "handleTime",
    name: $t('Io.index.945942-45'),
    type: "long",
    require: $t('Io.index.945942-44'),
    desc: $t('Io.index.945942-46'),
    example: "1651233650840",
  },
  {
    key: "describe",
    name: $t('Io.index.945942-47'),
    type: "string",
    require: $t('Io.index.945942-44'),
    desc: $t('Io.index.945942-48'),
    example: $t('Io.index.945942-49'),
  },
  {
    key: "type",
    name: $t('Io.index.945942-50'),
    type: "enum",
    require: $t('Io.index.945942-44'),
    desc: $t('Io.index.945942-51'),
    example: "user",
  },
  {
    key: "state",
    name: $t('Io.index.945942-52'),
    type: "enum",
    require: $t('Io.index.945942-44'),
    desc: "warning、normal",
    example: "normal",
  },
];
const outputColumns = [
  {
    title: $t('Io.index.945942-53'),
    dataIndex: "name",
    key: "name",
    ellipsis: true,
  },
  {
    title: $t('Io.index.945942-54'),
    dataIndex: "key",
    key: "key",
    ellipsis: true,
  },
  {
    title: $t('Io.index.945942-55'),
    dataIndex: "type",
    key: "type",
    ellipsis: true,
  },
  {
    title: $t('Io.index.945942-56'),
    dataIndex: "desc",
    key: "desc",
    width: 100,
    ellipsis: true,
  },
  {
    title: $t('Io.index.945942-57'),
    dataIndex: "example",
    key: "example",
    width: 100,
    ellipsis: true,
  },
];
const subColumns = [...outputColumns];
subColumns.splice(3, 0, {
  title: $t('Io.index.945942-58'),
  dataIndex: "require",
  key: "require",
  ellipsis: true,
});
const subText = `
  ~~~json
  {
    "alarmRecordId": "ba33a59ca5ebe3dccfcd75fd0575be4e",
    "alarmConfigId": "1605111722418597888",
    "alarmTime": "1651233650840",
    "handleTime": "1651233650841",
    "describe": $t('Io.index.945942-49'),
    "type": "user",
    "state": "normal"
  }
  ~~~
  `;
const outputText = `
  ~~~json
  {
    "alarmConfigId": "1605111722418597888",
    "id": "1515992841393119232",
    "alarmConfigId": "1586989804257853441",
    "alarmConfigName": $t('Io.index.945942-15'),
    "alarmRecordId": "ba33a59ca5ebe3dccfcd75fd0575be4e",
    "level": "3",
    "description": $t('Io.index.945942-59'),
    "alarmTime": "1667202964007",
    "sourceType": "device",
    "sourceId": "1605138218826821632",
    "sourceName": $t('Io.index.945942-38'),
    "targetType": "device",
    "targetName": $t('Io.index.945942-60'),
    "targetId": "1583300346713661440"
  }
  ~~~
  `;
const render = new marked.Renderer();
const markdownSubText = shallowRef(marked(subText));
const markdownOutputText = shallowRef(marked(outputText));
let inputVisible = ref(false);
let outputVisible = ref(false);
marked.setOptions({
  renderer: render,
  gfm: true,
  pedantic: false,
});
const handleOutputSearch = () => {
  getDataExchange("producer").then((res) => {
    if (res.status === 200) {
      output.value = res.result;
    }
  });
};
const handleInputSearch = () => {
  getDataExchange("consume").then((res) => {
    if (res.status === 200) {
      input.value = res.result;
    }
  });
};
handleInputSearch();
handleOutputSearch();
const showInput = () => {
  inputVisible.value = true;
};
const closeInput = () => {
  inputVisible.value = false;
};
const saveInput = () => {
  inputVisible.value = false;
  handleInputSearch();
};
const showOutput = () => {
  outputVisible.value = true;
};
const closeOutput = () => {
  outputVisible.value = false;
};
const saveOutput = () => {
  outputVisible.value = false;
  handleOutputSearch();
};
</script>
<style lang="less" scoped>
.alarmTitle {
  display: flex;
  position: relative;
  padding-left: 10px;
  color: rgba(0, 0, 0, 0.8);
  font-weight: 600;
  margin-bottom: 16px;
  line-height: 30px;
}
.alarmTitle::before {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background-color: @primary-color;
  border-radius: 0 3px 3px 0;
  content: " ";
}
.alarmFlow-left,
.alarmFlow-right {
  height: 780px;
  background-color: white;
}
.alarmFlow-right {
  margin-left: 20px;
  padding-bottom: 24px;
}
.doc {
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  color: rgba(#000, 0.8);
  font-size: 14px;
  background-color: #fff;

  .url {
    padding: 8px 16px;
    color: #2f54eb;
    background-color: rgba(#a7bdf7, 0.2);
  }

  h1 {
    margin: 16px 0;
    color: rgba(#000, 0.85);
    font-weight: bold;
    font-size: 14px;

    &:first-child {
      margin-top: 0;
    }
  }

  h2 {
    margin: 6px 10px;
    color: rgba(0, 0, 0, 0.8);
    font-weight: 400;
    font-size: 14px;
  }

  .image {
    margin: 16px 0;
  }

  .code {
    padding: 16px;
    background-color: #fafafa;
  }
}
</style>
