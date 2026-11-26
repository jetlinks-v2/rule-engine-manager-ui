<template>
    <a-form ref='writeForm' :model='formModel' layout='vertical' :colon='false'>
        <a-row :futter='[24, 24]'>
            <a-col :span='compact ? 24 : 10'>
                <a-form-item
                    name='reportKey'
                    :rules="[{ required: true, message: $t('Device.WriteProperty.372527-0-1') }]"
                >
                    <ThingModelSelect v-if="compact" :model-value="formModel.reportKey" :options="pointOptions" @change="selectPoint" />
                    <a-select v-else
                        showSearch
                        style='width: 100%'
                        :placeholder='$t("Collector.actions.index-6100078-2")'
                        v-model:value='formModel.reportKey'
                        :options='properties'
                        :filter-option='filterSelectNode'
                        optionFilterProp="label"
                        @change='change'
                    />
                </a-form-item>
            </a-col>
            <a-col v-if='!compact' :span='14'>
        <span style='line-height: 32px;padding-left: 24px'>
          {{ $t("Collector.actions.index-6100078-18") }}
        </span>
            </a-col>
            <a-col :span='24' v-if='showTable'>
              <a-form-item v-if="compact" name="reportValue" :label="$t('Collector.actions.index-6100078-5')" :rules="[{ required: true, message: $t('DeviceAccess.index.551011-12') }]">
                <ThingModelValueInput v-model="formModel.reportValue" :value-type="selectedPoint?.dataType" @update:model-value="updateWriteValue" />
              </a-form-item>
              <FunctionCall v-else
                ref="functionRef"
                :data='callDataOptions'
                :required="true"
                @change='callDataChange'
              />
            </a-col>
        </a-row>
    </a-form>
</template>

<script setup lang='ts'>
import { filterSelectNode } from '@jetlinks-web-core/utils/comm'
import FunctionCall from '../components/FunctionCall/FunctionCall.vue'
import ThingModelValueInput from '../../../SceneLinkage/editor/components/ThingModelValueInput.vue'
import ThingModelSelect from '../../../SceneLinkage/editor/components/ThingModelSelect.vue'
import type { PropType } from 'vue'
import { defineExpose } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'WriteProperties' })

type Emit = {
    (e: 'update:value', data: Record<string, any>): void
    (e: 'update:action', data: string): void
}

const props = defineProps({
    compact: { type: Boolean, default: false },
    value: {
        type: Object as PropType<Record<string, any>>,
        default: () => []
    },
    action: {
        type: String,
        default: ''
    },
    properties: {
        type: Array,
        default: () => []
    }
})

const emit = defineEmits<Emit>()
const { t: $t } = useI18n()
const functionRef = ref()
const formModel = reactive<{ reportKey: string | undefined, data: any[]; reportValue: any }>({
    reportKey: undefined,
    reportValue: undefined,
    data: Object.keys(props.value).map(key => ({ name: key, value: props.value[key] })) || []
})

const callData = ref<Array<{ id: string, value: string | undefined }>>()
const writeForm = ref()

const handleOptions = (item: any, type: string) => {
    if (type === 'enum') {
        return item.dataType.elements?.map((a: any) => ({ ...a, label: a.text }))
    } else if (type === 'boolean') {
        return [
            { label: item.dataType.trueText, value: item.dataType.trueValue },
            { label: item.dataType.falseText, value: item.dataType.falseValue },
        ]
    }
    return undefined
}

const callDataOptions = computed(() => {
    const _valueKeys = Object.keys(props.value)
    if (_valueKeys.length) {
        return _valueKeys.map(key => {
            const item: any = props.properties.find((p: any) => p.id === key)
            if (item) {
                const _options = handleOptions(item, item.dataType?.type)
                return {
                    id: item.id,
                    name: item.name,
                    type: item.dataType ? item.dataType.type : '-',
                    format: item.dataType ? item.dataType.format : undefined,
                    options: _options,
                    value: props.value[key]
                }
            }
            return {
                id: key,
                name: key,
                type: '',
                format: undefined,
                options: undefined,
                value: undefined
            }
        })
    }
    return []
})

nextTick(() => {
    formModel.reportKey = Object.keys(props.value)[0]
})

const showTable = computed(() => {
    return !!formModel.reportKey
})

const pointOptions = computed(() => props.properties.map((point: any) => ({ label: point.name, value: point.id, valueType: point.dataType })))
function selectPoint(id: string) {
    formModel.reportKey = id
    change(id, props.properties.find((point: any) => point.id === id))
}
const selectedPoint = computed(() => props.properties.find((point: any) => point.id === formModel.reportKey) as any)
watch(() => props.value, value => {
    formModel.reportKey = Object.keys(value)[0]
    formModel.reportValue = value[formModel.reportKey!]
}, { deep: true, immediate: true })
function updateWriteValue(value: unknown) {
    if (formModel.reportKey) emit('update:value', { [formModel.reportKey]: value })
}
const change = (v: string, option: any) => {
    const _data = {
        [v]: undefined
    }
    callData.value = [{ id: v, value: undefined }]
    emit('update:value', _data)
    emit('update:action', $t('Device.WriteProperty.372527-3', [option?.name || v]))
}

const callDataChange = (v: any[]) => {
    emit('update:value', {
        [formModel.reportKey!]: v[0]?.value
    })
}

defineExpose({
    validateFields: async () => {
        const data = await writeForm.value?.validateFields()
        if (props.compact) return { ...data, data: { [formModel.reportKey!]: formModel.reportValue } }
        const data2 = await functionRef.value?.validate()
        const item = data2?.[0]
        return { ...data, data: item ? { [item.id]: item.value } : undefined }
    }
})

</script>

<style scoped>

</style>
