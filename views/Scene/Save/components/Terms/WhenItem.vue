<template>
    <div class="terms-params">
        <div class="terms-params-warp">
            <div v-if="!isFirst" class="term-type-warp">
                <DropdownButton
                    :options="[
                        { label: $t('Terms.WhenItem.9093425-0'), value: 'and' },
                        { label: $t('Terms.WhenItem.9093425-1'), value: 'or' },
                    ]"
                    type="type"
                    v-model:value="formModel.branches[branchName].when[name].type"
                    @select="typeChange"
                />
            </div>
            <div
                class="terms-params-content"
                @mouseover="mouseover"
                @mouseout="mouseout"
            >
                <ConfirmModal
                    :title="$t('Terms.WhenItem.9093425-2')"
                    :onConfirm="onDelete"
                    :show="showDelete"
                    className="terms-params-delete"
                >
                    <AIcon type="CloseOutlined" />
                </ConfirmModal>
                <TermsItem
                    v-for="(item, index) in termsData"
                    :key="item.key"
                    :branchName="branchName"
                    :branches_Index="branches_Index"
                    :whenName="props.name"
                    :name="index"
                    :showDeleteBtn="termsData.length > 1"
                    :isFirst="index === 0"
                    :isLast="index === termsData.length - 1"
                    :data="item"
                />
            </div>
            <div class="terms-group-add" @click="addWhen" v-if="isLast">
                <div class="terms-content">
                    <AIcon type="PlusOutlined" />
                    <span>{{ $t('Terms.WhenItem.9093425-3') }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts" name="WhenItem">
import type { PropType } from 'vue';
import TermsItem from './TermsItem.vue';
import { TermsType } from '../../../typings';
import { useSceneStore } from '../../../../../store/scene';
import DropdownButton from '../DropdownButton';
import { storeToRefs } from 'pinia';
import { randomString } from '@jetlinks-web/utils';
import { useI18n } from 'vue-i18n'

const { t: $t } = useI18n()
const sceneStore = useSceneStore();
const { data: formModel } = storeToRefs(sceneStore);

const props = defineProps({
    isFirst: {
        type: Boolean,
        default: true,
    },
    data: {
        type: Object as PropType<TermsType>,
        default: () => ({
            when: [],
            shakeLimit: {},
            then: [],
        }),
    },
    showDeleteBtn: {
        type: Boolean,
        default: true,
    },
    class: {
        type: String,
        default: '',
    },
    name: {
        type: Number,
        default: 0,
    },
    branchName: {
        type: Number,
        default: 0,
    },
    branches_Index: {
        type: Number,
        default: 0,
    },
    isLast: {
        type: Boolean,
        default: true,
    },
});

const showDelete = ref(false);

const mouseover = () => {
    if (props.showDeleteBtn) {
        showDelete.value = true;
    }
};

const mouseout = () => {
    if (props.showDeleteBtn) {
        showDelete.value = false;
    }
};

const termsData = computed(() => {
    return props.data.terms;
});

const typeChange = (e: any) => {
    formModel.value.options!.when[props.name].terms[props.name].termType =
        e.label;
};

const onDelete = () => {
    formModel.value.branches?.[props.branchName]?.when?.splice(props.name, 1);
    formModel.value.options!.when[props.branches_Index].terms.splice(
        props.name,
        1,
    );
};

const addWhen = () => {
    const terms = {
        type: 'and',
        terms: [
            {
                column: undefined,
                value: {
                    source: 'manual',
                    value: undefined,
                },
                termType: undefined,
                key: `params_${randomString()}`,
                type: 'and',
            },
        ],
        key: `terms_${randomString()}`,
    };
    formModel.value.branches?.[props.branchName]?.when?.push(terms);
    if (!formModel.value.options!.when[props.branches_Index]) {
        formModel.value.options!.when[props.branches_Index] = {
            terms: [{ terms: [['', '', '', $t('Terms.WhenItem.9093425-0')]] }],
        };
    }
    formModel.value.options?.when?.[props.branches_Index]?.terms.push({
        termType: $t('Terms.WhenItem.9093425-0'),
        terms: [['', 'eq', '', 'and']],
    });
};
</script>

<style scoped></style>
