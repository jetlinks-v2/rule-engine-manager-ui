<template>
    <pro-search
        :columns="columns"
        type="simple"
        target="action-notice-template"
        @search="handleSearch"
        class="action-search"
    />
    <div style="height: 400px; overflow-y: auto">
        <JProTable
            :columns="columns"
            :request="(e) => handleData(e)"
            mode="CARD"
            :bodyStyle="{
                padding: 0,
            }"
            ref="tableRef"
            :params="params"
            :gridColumns="[2]"
            :noPagination="true"
            :alertShow="false"
            :rowSelection="{
                selectedRowKeys: _selectedRowKeys,
                onChange: onSelectChange,
            }"
        >
            <template #card="slotProps">
                <CardBox
                    :showStatus="false"
                    :value="slotProps"
                    :showTool="false"
                    :actions="[]"
                    v-bind="slotProps"
                    @click="handleClick"
                    :active="_selectedRowKeys.includes(slotProps.id)"
                >
                    <template #img>
                        <slot name="img">
                            <img
                                :src="
                                    getLogo(slotProps.type, slotProps.provider)
                                "
                                class="notify-logo"
                            />
                        </slot>
                    </template>
                    <template #content>
                        <j-ellipsis style="width: calc(100% - 100px)">
                            <span style="font-size: 16px; font-weight: 600">
                                {{ slotProps.name }}
                            </span>
                        </j-ellipsis>
                        <a-row>
                            <a-col :span="12">
                                <div class="card-item-content-text">
                                    {{ $t('Notify.NotifyTemplate.966778-0') }}
                                </div>
                                <div>
                                    {{ getMethodTxt(slotProps.type) }}
                                </div>
                            </a-col>
                            <a-col :span="12">
                                <div class="card-item-content-text">{{ $t('Notify.NotifyTemplate.966778-1') }}</div>
                                <j-ellipsis>
                                    {{ slotProps.description }}
                                </j-ellipsis>
                            </a-col>
                        </a-row>
                    </template>
                </CardBox>
            </template>
        </JProTable>
    </div>
</template>

<script lang="ts" setup>
import { getUser , getDept , getTags , getListByConfigId} from '../../../../../api/others'
import { MSG_TYPE, NOTICE_METHOD } from '../../../../../utils/const';
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const props = defineProps({
    notifierId: {
        type: String,
        default: '',
    },
    value: {
        type: String,
        default: '',
    },
    notifyType: {
        type: String,
        default: '',
    },
});

const emit = defineEmits(['update:value', 'change', 'update:detail']);

const getLogo = (type: string, provider: string) => {
    return MSG_TYPE[type].find((f: any) => f.value === provider)?.logo;
};

const getMethodTxt = (type: string) => {
    return NOTICE_METHOD.find((f) => f.value === type)?.label;
};

const params = ref<Record<string, any>>({});
const _selectedRowKeys = ref<string[]>([]);
const tableRef = ref<any>();

const columns = [
    {
        title: $t('Notify.NotifyTemplate.966778-2'),
        dataIndex: 'name',
        key: 'name',
        search: {
            type: 'string',
        },
    },
    {
        title: 'ID',
        dataIndex: 'id',
        key: 'id',
        search: {
            type: 'string',
        },
    },
    {
        title: $t('Notify.NotifyTemplate.966778-1'),
        dataIndex: 'description',
        key: 'description',
        search: {
            type: 'string',
        },
    },
];

const handleSearch = (_params: any) => {
    params.value = _params;
};

const typeObj = {
    weixin: 'wechat',
    dingTalk: 'dingtalk',
};

const queryUserList = async (id: string) => {
    if (!(props.notifyType && props.notifierId)) return '';
    const resp = await getUser(
        typeObj[props.notifyType],
        props.notifierId,
    );
    if (resp.status === 200) {
        return resp.result?.find((item: any) => item.id === id)?.name;
    } else {
        return '';
    }
};

const queryOrgList = async (id: string) => {
    if (!(props.notifyType && props.notifierId)) return '';
    const resp = await getDept(
        typeObj[props.notifyType],
        props.notifierId,
    );
    if (resp.status === 200) {
        return resp.result?.find((item: any) => item.id === id)?.name;
    } else {
        return '';
    }
};

const queryTagList = async (id:string) =>{
    if (! props.notifierId) return '';
    const resp = await getTags(
        props.notifierId,
    );
    if (resp.status === 200) {
        return resp.result?.find((item: any) => item.id === id)?.name;
    } else {
        return '';
    }
}

const getOptions = async (dt: any) => {
    const obj = {};
    // 钉钉，微信
    if (props.notifyType === 'weixin') {
        if (dt?.template?.toParty) {
            obj['orgName'] = await queryOrgList(dt?.template?.toParty);
        }
        if (dt?.template?.toUser) {
            obj['sendTo'] = await queryUserList(dt?.template?.toUser);
        }
        if (dt?.template?.toTag) {
            obj['tagName'] = await queryTagList(dt?.template?.toTag);
        }
    }
    if (props.notifyType === 'dingTalk') {
        if (dt?.template?.departmentIdList) {
            obj['orgName'] = await queryOrgList(dt?.template?.departmentIdList);
        }
        if (dt?.template?.userIdList) {
            obj['sendTo'] = await queryUserList(dt?.template?.userIdList);
        }
    }
    return obj;
};

const handleClick = async (dt: any) => {
    console.log(dt,'dt')
    if (_selectedRowKeys.value.includes(dt.id)) {
        _selectedRowKeys.value = [];
        emit('update:value', undefined);
        emit('change', { templateName: undefined, orgName: undefined, sendTo: undefined ,tagName: undefined });
        emit('update:detail', undefined);
    } else {
        const obj = await getOptions(dt)
        _selectedRowKeys.value = [dt.id];
        emit('change', { templateName: dt?.name, ...obj });
        emit('update:value', dt.id);
        emit('update:detail', dt);
    }
};

const onSelectChange = (keys: string[]) => {
    _selectedRowKeys.value = [...keys];
};

const handleData = async (e: any) => {
    const sorts = [
        { name: 'id', value: props.value },
        { name: 'createTime', order: 'desc' },
    ];
    const resp = await getListByConfigId(props.notifierId, {
        ...e,
        sorts: sorts,
    });
    return {
        code: resp.message,
        result: {
            data: resp.result ? resp.result : [],
            pageIndex: 0,
            pageSize: resp.result.length,
            total: resp.result.length,
        },
        status: resp.status,
        success: resp.success
    };
};

watch(
    () => props.value,
    (newValue) => {
        if (newValue) {
            _selectedRowKeys.value = [newValue];
            // (tableRef.value?._dataSource || []).find()
        } else {
            _selectedRowKeys.value = [];
        }
    },
    {
        deep: true,
        immediate: true,
    },
);
</script>

<style lang="less">
.action-search {
    padding: 0;
}

.notify-logo {
    width: 88px;
    height: 88px;
}
</style>
