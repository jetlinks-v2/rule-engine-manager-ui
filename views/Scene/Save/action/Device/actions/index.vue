<template>
    <div>
        <a-form :layout="'vertical'" ref="formRef" :model="modelRef">
            <a-form-item
                :name="['message', 'messageType']"
                :label="$t('actions.index.9667837-0')"
                :rules="[{ required: true, message: $t('actions.index.9667837-1') }]"
            >
                <a-select v-if="compact" v-model:value="modelRef.message.messageType" :options="actionTypeOptions" popup-class-name="scene-editor__resource-dropdown scene-editor__device-trigger-dropdown" :dropdown-match-select-width="false" @change="onMessageTypeChange">
                    <template #option="option"><div class="scene-editor__device-trigger-option"><span><AIcon :type="optionValue(option).icon" /></span><div><b>{{ optionValue(option).label }}</b><small>{{ optionValue(option).description }}</small></div></div></template>
                </a-select>
                <TopCard v-else
                    :typeList="TypeList"
                    v-model:value="modelRef.message.messageType"
                    @change="onMessageTypeChange"
                />
            </a-form-item>
            <template v-if="deviceMessageType === 'INVOKE_FUNCTION'">
                <a-form-item
                    :name="['message', 'functionId']"
                    :label="$t('actions.index.9667837-2')"
                    :rules="[{ required: true, message: $t('actions.index.9667837-3') }]"
                >
                    <ThingModelSelect
                        v-model="modelRef.message.functionId" :options="functionOptions"
                        :placeholder="$t('actions.index.9667837-3')" @change="functionSelect"
                    />
                </a-form-item>
                <EditTable
                    ref="functionRef"
                    v-model:value="modelRef.message.inputs"
                    v-model:columnMap="columnMap"
                    :functions="functions"
                    :builtInList="builtInList"
                />
            </template>
            <template v-else-if="deviceMessageType === 'READ_PROPERTY'">
                <a-form-item
                    :name="['message', 'properties']"
                    :label="$t('actions.index.9667837-4')"
                    :rules="[{ required: true, message: $t('actions.index.9667837-5') }]"
                >
                    <ThingModelSelect
                        v-model="modelRef.message.properties[0]" :options="readOptions"
                        :placeholder="$t('actions.index.9667837-6')" @change="propertySelect"
                    />
                </a-form-item>
            </template>
            <template v-else-if="deviceMessageType === 'WRITE_PROPERTY'">
                <WriteProperty
                    ref="writeFormRef"
                    v-model:value="modelRef.message.properties"
                    v-model:columnMap="columnMap"
                    :metadata="metadata"
                    :builtInList="builtInList"
                    @change="onWriteChange"
                />
            </template>
        </a-form>
    </div>
</template>

<script lang="ts" setup>
import ThingModelSelect from '../../../../../SceneLinkage/editor/components/ThingModelSelect.vue'
import TopCard from '../device/TopCard.vue';
import EditTable from './EditTable.vue';
import WriteProperty from './WriteProperty.vue';
import { useDeviceActions } from './useDeviceActions'

defineOptions({ name: 'ActionDeviceActions' })
const props = defineProps({
    compact: { type: Boolean, default: false },
    values: {
        type: Object,
        default: () => ({}),
    },
    name: {
        type: Number,
        default: 0,
    },
    thenName: {
        type: Number,
        default: 0,
    },
    branchesName: {
        type: Number,
        default: 0,
    },
    productDetail: {
        type: Object,
        default: () => ({}),
    },
    columnMap: {
        type: Object,
        default: () => ({}),
    },
});
const emit = defineEmits(['change']);
const { formRef, modelRef, actionTypeOptions, TypeList, optionValue, onMessageTypeChange, deviceMessageType, metadata, functionOptions, readOptions, functionSelect, propertySelect, functionRef, writeFormRef, functions, builtInList, columnMap, onWriteChange, onFormSave, getColumnMap } = useDeviceActions(props, emit)
defineExpose({ onFormSave, getColumnMap });
</script>
