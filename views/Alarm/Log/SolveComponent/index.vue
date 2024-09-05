<template>
    <a-modal
        title="告警处理"
        okText="确定"
        cancelText="取消"
        visible
        @cancel="handleCancel"
        @ok="handleSave"
        destroyOnClose
        :confirmLoading="loading"
    >
        <a-form :rules="rules" layout="vertical" ref="formRef" :model="form">
            <a-form-item label="处理结果" name="describe">
                <a-textarea
                    :disabled="solveType === 'view'"
                    :rows="8"
                    :maxlength="200"
                    showCount
                    placeholder="请输入处理结果"
                    v-model:value="form.describe"
                ></a-textarea>
            </a-form-item>
        </a-form>
    </a-modal>
</template>

<script lang="ts" setup>
import { handleLog, handlePreconditioning } from '../../../../api/log';
import { onlyMessage } from '@jetlinks-web/utils';
const props = defineProps({
    data: {
        type: Object,
    },
    solveType: {
        type: String,
        default: 'handle',
    },
    handleDes: {
        type: String,
        default: '',
    },
    goal: {
        type: String,
        default: '',
    },
});
const loading = ref<boolean>(false);
const formRef = ref();
const rules = {
    describe: [
        {
            required: true,
            message: '请输入处理结果',
        },
    ],
};
const form = reactive({
    describe: '',
});
const emit = defineEmits(['closeSolve', 'refresh']);
const handleCancel = () => {
    emit('closeSolve');
};
const handleSave = () => {
    if (props.solveType === 'view') {
        emit('closeSolve');
        return;
    }
    loading.value = true;
    formRef.value
        .validate()
        .then(async () => {
            const params = {
                describe: form.describe,
                type: 'user',
                state: 'normal',
                alarmRecordId: props.data?.id || '',
                alarmConfigId: props.data?.alarmConfigId || '',
                alarmTime: props?.data?.alarmTime || '',
            };
            const res = props.goal
                ? await handlePreconditioning(params)
                : await handleLog(params);
            if (res.status === 200) {
                onlyMessage('操作成功！');
                emit('refresh');
            } else {
                onlyMessage('操作失败！', 'error');
            }
            loading.value = false;
        })
        .catch((error:any) => {
            console.log(error);
            loading.value = false;
        });
};
onMounted(() => {
    props.solveType === 'view' ? (form.describe = props.handleDes) : '';
});
</script>
<style lang="less" scoped></style>
