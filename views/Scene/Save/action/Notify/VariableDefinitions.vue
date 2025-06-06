<template>
    <a-form
        v-if="variableDefinitions.length"
        :layout="'vertical'"
        ref="formRef"
        :model="modelRef"
    >
        <a-form-item
            :name="`${item?.id}`"
            :label="item?.name"
            v-for="(item, index) in variableDefinitions"
            :key="item.id"
            :required="
                !['file', 'user', 'org', 'tag'].includes(getType(item)) ||
                item.id === 'calledNumber'
                    ? true
                    : false
            "
            :rules="[
                {
                    validator: (_rule, value) => checkValue(_rule, value, item),
                    trigger: ['blur', 'change'],
                },
            ]"
        >
            <User
                :notify="notify"
                v-if="getType(item) === 'user'"
                v-model:value="modelRef[item.id]"
                @change="(val) => onChange(val, 'user', index)"
            />
            <Org
                :notify="notify"
                v-else-if="getType(item) === 'org'"
                v-model:value="modelRef[item.id]"
                @change="(val) => onChange(val, 'org', index)"
            />
            <Tag
                :notify="notify"
                v-else-if="getType(item) === 'tag'"
                v-model:value="modelRef[item.id]"
                @change="(val) => onChange(val, 'tag', index)"
            />
            <InputFile
                v-else-if="getType(item) === 'file'"
                v-model:value="modelRef[item.id]"
            />
            <a-input
                v-else-if="getType(item) === 'link'"
                v-model:value="modelRef[item.id]"
            />
            <BuildIn
                v-else
                :item="item"
                :name="name"
                :thenName="thenName"
                :branchesName="branchesName"
                v-model:value="modelRef[item.id]"
                @change="
                    (val, _options) =>
                        onChange(val, 'build-in', index, _options)
                "
            />
        </a-form-item>
    </a-form>
    <a-empty v-else style="margin: 20px 0" :description="$t('Notify.VariableDefinitions.966776-0')" />
</template>

<script lang="ts" setup>
import BuildIn from './variableItem/BuildIn.vue';
import Org from './variableItem/Org.vue';
import Tag from './variableItem/Tag.vue';
import InputFile from './variableItem/InputFile.vue';
import User from './variableItem/User.vue';
import { PropType } from 'vue';
import { onlyMessage } from '@jetlinks-web/utils';
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
    variableDefinitions: {
        type: Array as PropType<any>,
        default: () => [],
    },
    value: {
        type: Object,
        default: () => ({}),
    },
    notify: {
        type: Object,
        default: () => ({}),
    },
    template: {
        type: Object,
        default: () => ({}),
    },
    options: {
        type: Object,
        default: () => ({}),
    },
    branchesName: {
      type: Number,
      default: 0,
    },
    thenName: {
      type: Number,
      default: 0,
    },
    name: {
      type: Number,
      default: 0,
    },
});

const emit = defineEmits(['update:value', 'change']);

const formRef = ref();

const modelRef = reactive({});
const otherColumns = ref<(string | undefined)[]>(
    props.options?.otherColumns || [],
);

watchEffect(() => {
    Object.assign(modelRef, props?.value);
});

watchEffect(() => {
    if (
        props?.template?.template?.sendTo &&
        Array.isArray(props?.template?.template?.sendTo) &&
        props?.template?.template?.sendTo?.length
    ) {
        emit('change', {
            sendTo: props?.template?.template?.sendTo?.join(' '),
        });
    }
});

const getType = (item: any) => {
    return item.expands?.businessType || item.type;
};

const checkValue = (_rule: any, value: any, item: any) => {
    if (!value) {
        return Promise.resolve();
    }
    const type = item.expands?.businessType || item?.type;
    if (
        ['user', 'org', 'tag', 'userIdList', 'departmentIdList'].includes(type)
    ) {
        return Promise.resolve();
    }
    if (type === 'file') {
        return Promise.resolve();
    } else if (type === 'link') {
        if (!value) {
            return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-1') + item.name));
        } else if (value.length > 64) {
            return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-2')));
        }
    } else if (type === 'tag' && !value) {
        return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-3') + item.name));
    } else if (['date', 'org'].includes(type)) {
        if (!value) {
            return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-3') + item.name));
        } else {
            if (value?.source === 'upper') {
                if (!value?.upperKey) {
                    return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-3') + item.name));
                } else {
                    return Promise.resolve();
                }
            } else {
                if (!value?.value) {
                    return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-3') + item.name));
                } else {
                    return Promise.resolve();
                }
            }
        }
    } else if (value?.source === 'fixed' && !value?.value) {
        let tip = $t('Notify.VariableDefinitions.966776-1') + item.name;
        if (props.notify.notifyType === 'email') {
            tip = $t('Notify.VariableDefinitions.966776-4');
        }
        return Promise.reject(new Error(tip));
    } else if (
        value?.source === 'relation' &&
        !value?.value &&
        !value?.relation
    ) {
        return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-3') + item.name));
    } else if (value?.source === 'upper' && !value.upperKey) {
        return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-3') + item.name));
    } else if (type === 'user') {
        if (
            props.notify.notifyType === 'email' &&
            value?.source !== 'relation'
        ) {
            if (Array.isArray(value?.value)) {
                if (!value?.value.length) {
                    return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-4')));
                }
                const reg =
                    /^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/;
                const flag = value?.value.every((it: string) => {
                    return reg.test(it);
                });
                if (!flag) {
                    return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-5')));
                } else {
                    return Promise.resolve();
                }
            } else {
                return Promise.resolve();
            }
        }
        if (
            props.notify.notifyType &&
            ['sms', 'voice'].includes(props?.notify?.notifyType) &&
            value?.source !== 'relation' &&
            value?.value
        ) {
            const reg = /^[1][3-9]\d{9}$/;
            if (!reg.test(value?.value)) {
                return Promise.reject(new Error($t('Notify.VariableDefinitions.966776-6')));
            } else {
                return Promise.resolve();
            }
        }
    }
    return Promise.resolve();
};

const onChange = (val: any, type: any, index: number, options?: string) => {
    if (type === 'build-in') {
        otherColumns.value[index] = options;
    } else {
        otherColumns.value[index] = undefined;
    }

    if (type === 'org') {
        emit('change', { orgName: val.join(','), otherColumns: [] });
    } else if (type === 'tag') {
        emit('change', { tagName: val, otherColumns: [] });
    } else if (type === 'user') {
        emit('change', { sendTo: val, otherColumns: [] });
    } else {
        emit('change', { otherColumns: otherColumns.value });
    }
};

const onSave = () =>
    new Promise((resolve, reject) => {
        const filterData = props.variableDefinitions.filter((item) =>
            ['user', 'org', 'tag', 'userIdList', 'departmentIdList'].includes(
                getType(item),
            ),
        );
        const pass = filterData.length
            ? filterData.some((item) => {

                  if (
                      item.id === 'toUser' &&
                      modelRef[item.id]?.source === 'relation'
                  ) {

                      return (
                          modelRef[item.id].relation?.objectId ||
                          modelRef[item.id].relation?.related
                      );
                  } else if (item.id === 'userIdList') {
                      return (
                          modelRef[item.id]?.value ||
                          modelRef[item.id]?.relation?.objectId
                      );
                  } else {
                      return modelRef[item.id]?.value;
                  }
              })
            : true;
        if (!pass && props.notify.notifyType === 'weixin') {
            onlyMessage(
                $t('Notify.VariableDefinitions.966776-7'),
                'warning',
            );
            return reject(false);
        }
        if (!pass && props.notify.notifyType === 'dingTalk') {
            onlyMessage($t('Notify.VariableDefinitions.966776-8'), 'warning');
            return reject(false);
        }
        formRef.value
            ?.validate()
            .then((_data: any) => {
                resolve(_data);
            })
            .catch(() => {
                reject(false);
            });
    });

defineExpose({ onSave });
</script>
