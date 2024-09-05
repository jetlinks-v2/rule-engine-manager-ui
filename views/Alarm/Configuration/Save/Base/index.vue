<template>
  <FullPage>
    <div>
      <a-form layout="vertical" :rules="rule" :model="form" ref="formRef">
        <a-row :gutter="24">
          <a-col :span="12">
            <a-form-item label="名称" name="name">
              <a-input
                placeholder="请输入名称"
                v-model:value="form.name"
              ></a-input> </a-form-item
          ></a-col>
          <a-col :span="12">
            <a-form-item name="targetType">
              <template #label>
                <a-space>
                  类型
                  <a-tooltip>
                    <template #title>
                      <div>
                        产品：以产品维度告警，某产品下的多个设备异常仅发送一条告警。
                      </div>
                      <div>
                        设备：以设备维度告警，任何设备异常即发送一条告警。
                      </div>
                      <div>
                        组织：以组织维度告警，某组织下的多个设备异常仅发送一条告警。
                      </div>
                      <div>
                        其他：以场景联动维度告警，某场景下的多个设备异常仅发送一条告警。
                      </div>
                    </template>
                    <AIcon
                      type="QuestionCircleOutlined"
                      style="color: rgb(136, 136, 136); font-size: 12px"
                    />
                  </a-tooltip>
                </a-space>
              </template>
              <a-select
                :options="options"
                v-model:value="form.targetType"
                :disabled="selectDisable"
              ></a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="级别" name="level">
          <a-radio-group v-model:value="form.level" class="levelSelect">
            <a-radio-button
              v-for="(item, index) in levelOption"
              :key="index"
              :value="item.value"
            >
              <j-ellipsis
                style="
                  text-align: center;
                  margin-top: 10px;
                  font-size: 15px;
                  width: 90%;
                "
              >
                <img
                  :src="configImages.alarm[index]"
                  style="height: 40px"
                  alt=""
                />{{ item.label }}
              </j-ellipsis>
            </a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="说明" name="description">
          <a-textarea
            v-model:value="form.description"
            showCount
            :maxlength="200"
          ></a-textarea>
        </a-form-item>
        <j-permission-button
          type="primary"
          :loading="loading"
          @click="handleSave"
          :hasPermission="[
            'rule-engine/Alarm/Configuration:add',
            'rule-engine/Alarm/Configuration:update',
          ]"
          >保存</j-permission-button
        >
      </a-form>
    </div>
  </FullPage>
</template>

<script lang="ts" setup>
import {
  getTargetTypes,
  save,
  detail,
  update,
} from "../../../../../api/configuration";
import { queryLevel } from "../../../../../api/config";
import { query } from "../../../../../api/scene";
import { onlyMessage } from "@jetlinks-web/utils";
import { useMenuStore } from "@/store/menu";
import { useRoute } from "vue-router";
import { useAlarmConfigurationStore } from "../../../../../store/alarm";
import { storeToRefs } from "pinia";
import { configImages } from "../../../../../assets/index";
const route = useRoute();
let selectDisable = ref(false);
const alarmConfigurationStore = useAlarmConfigurationStore();
let { configurationData } = storeToRefs(alarmConfigurationStore);

const emit = defineEmits(["change"]);

const queryData = () => {
  if (route.query?.id) {
    detail(route.query?.id).then((res) => {
      if (res.status === 200) {
        emit("change", res?.result?.targetType);
        form.value = res?.result;
        // form.level = res?.result?.level;
        // form.name = res?.result?.name;
        // form.targetType = res?.result?.targetType;
        // form.description = res?.result?.description;
        configurationData.value.current = res.result;
        query({
          terms: [
            {
              terms: [
                {
                  column: "id",
                  termType: "alarm-bind-rule",
                  value: route.query?.id,
                },
              ],
              type: "and",
            },
          ],
          sorts: [
            {
              name: "createTime",
              order: "desc",
            },
          ],
        }).then((resq) => {
          if (resq.status === 200) {
            selectDisable.value = !!resq.result.data?.length;
          }
        });
      }
    });
  }
};
const rule = {
  name: [
    {
      required: true,
      message: "请输入名称",
    },
    {
      max: 64,
      message: "最多输入64个字符",
    },
  ],
  targetType: [
    {
      required: true,
      message: "请选择类型",
    },
  ],
  level: [
    {
      required: true,
      message: "请选择级别",
    },
  ],
  description: [
    {
      max: 200,
      message: "最多可输入200个字符",
    },
  ],
};
let form = ref({
  level: "",
  targetType: "",
  name: "",
  description: "",
});
let options = ref();
let levelOption = ref();
let loading = ref(false);
const formRef = ref();
const menuStory = useMenuStore();
const getSupports = async () => {
  let res = await getTargetTypes();
  if (res.status === 200) {
    options.value = res.result.map((item: { id: string; name: string }) => ({
      label: item.name,
      value: item.id,
    }));
  }
};
getSupports();
const getLevel = () => {
  queryLevel().then((res) => {
    if (res.status === 200) {
      levelOption.value = res.result?.levels
        ?.filter((i: any) => i?.level && i?.title)
        .map((item: { level: number; title: string }) => ({
          label: item.title,
          value: item.level,
        }));
    }
  });
};
getLevel();
const handleSave = async () => {
  loading.value = true;
  formRef.value
    .validate()
    .then(async () => {
      const res = route.query?.id
        ? await update(form.value)
        : await save(form.value);
      if (res.status === 200) {
        onlyMessage("操作成功,请配置关联的场景联动");
        loading.value = false;
        emit("change", form.value.targetType);
        if (res.result?.id) {
          menuStory.jumpPage(
            "rule-engine/Alarm/Configuration/Save",
            { query: { id: res.result?.id } }
          );
        }
        if (!route.query?.id) {
          configurationData.value.current = res.result;
        }
      }
    })
    .catch((error) => {
      loading.value = false;
      console.log(error);
    });
};
queryData();
watch(
  () => route.query?.id,
  () => {
    queryData();
  }
);
</script>
<style lang="less" scoped>
.ant-radio-button-wrapper {
  margin: 10px 15px 0 0;
  width: 20%;
  height: 100%;
}
.levelSelect {
  display: flex;
  width: 100%;
}
</style>
