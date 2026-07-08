<template>
  <header class="rule-editor-shell__header">
    <div class="rule-editor-shell__title">
      <span class="rule-editor-shell__icon">
        <AIcon type="BranchesOutlined" />
      </span>
      <div class="rule-editor-shell__copy">
        <a-input
          v-if="nameEditing"
          ref="nameInputRef"
          v-model:value="nameDraft"
          class="rule-editor-shell__name-input"
          size="small"
          :maxlength="64"
          :placeholder="$t('RuleEditor.index.renamePlaceholder')"
          @blur="commitNameEdit"
          @pressEnter="commitNameEdit"
          @keyup.esc="cancelNameEdit"
        />
        <button
          v-else
          class="rule-editor-shell__name"
          type="button"
          :disabled="renameLoading"
          :title="$t('RuleEditor.index.renameRule')"
          @click="startNameEdit"
        >
          <span>{{ ruleName }}</span>
          <AIcon :type="renameLoading ? 'LoadingOutlined' : 'EditOutlined'" />
        </button>
        <div class="rule-editor-shell__meta">
          <span class="rule-editor-shell__id">{{ $t('RuleEditor.index.ruleId', [ruleId]) }}</span>
          <span class="rule-editor-shell__meta-separator" />
          <button
            class="rule-editor-shell__description"
            :class="{ 'rule-editor-shell__description--empty': !ruleDescription }"
            type="button"
            :disabled="descriptionLoading"
            :title="$t('RuleEditor.index.editDescription')"
            @click="startDescriptionEdit"
          >
            <span>{{ ruleDescription || $t('RuleEditor.index.descriptionEmpty') }}</span>
            <AIcon :type="descriptionLoading ? 'LoadingOutlined' : 'EditOutlined'" />
          </button>
        </div>
      </div>
    </div>
    <a-space class="rule-editor-shell__actions" :size="10">
      <a-tooltip :title="statusText">
        <span class="rule-editor-shell__status" :class="`rule-editor-shell__status--${statusColor}`" />
      </a-tooltip>
      <a-button-group class="rule-editor-shell__action-group">
        <a-button
          class="rule-editor-shell__action rule-editor-shell__action--save"
          :loading="actioning === 'save'"
          :disabled="saveDisabled"
          :title="$t('RuleEditor.index.saveDescription')"
          @click="$emit('execute', 'save')"
        >
          <template #icon>
            <AIcon :type="actionDone === 'save' ? 'CheckOutlined' : 'SaveOutlined'" />
          </template>
          {{ $t('RuleEditor.index.save') }}
        </a-button>
        <a-button
          type="primary"
          class="rule-editor-shell__action rule-editor-shell__action--deploy"
          :loading="actioning === 'deploy'"
          :disabled="deployDisabled"
          :title="$t(deployDisabled ? 'RuleEditor.index.deployUnavailable' : 'RuleEditor.index.deploy')"
          @click="$emit('execute', 'deploy')"
        >
          <template #icon>
            <AIcon :type="actionDone === 'deploy' ? 'CheckOutlined' : 'CloudUploadOutlined'" />
          </template>
          {{ $t(actioning === 'deploy' ? 'RuleEditor.index.deploying' : 'RuleEditor.index.deploy') }}
        </a-button>
      </a-button-group>
      <a-button class="rule-editor-shell__close" type="text" :title="$t('RuleEditor.index.close')" @click="$emit('close')">
        <template #icon>
          <AIcon type="CloseOutlined" />
        </template>
      </a-button>
    </a-space>
    <a-modal
      :open="descriptionModalOpen"
      :title="$t('RuleEditor.index.editDescription')"
      :confirm-loading="descriptionLoading"
      :ok-text="$t('RuleEditor.index.descriptionSave')"
      @ok="commitDescriptionEdit"
      @cancel="cancelDescriptionEdit"
    >
      <a-textarea
        ref="descriptionInputRef"
        v-model:value="descriptionDraft"
        :maxlength="256"
        :show-count="true"
        :auto-size="{ minRows: 3, maxRows: 6 }"
        :placeholder="$t('RuleEditor.index.descriptionPlaceholder')"
      />
    </a-modal>
  </header>
</template>

<script setup lang="ts">
import { nextTick, ref, watch, type PropType } from 'vue';

const props = defineProps({
  ruleId: {
    type: String,
    required: true,
  },
  ruleName: {
    type: String,
    required: true,
  },
  ruleDescription: {
    type: String,
    default: '',
  },
  statusColor: {
    type: String as PropType<'success' | 'error' | 'processing'>,
    required: true,
  },
  statusText: {
    type: String,
    required: true,
  },
  actioning: {
    type: String as PropType<'deploy' | 'save' | ''>,
    default: '',
  },
  actionDone: {
    type: String as PropType<'deploy' | 'save' | ''>,
    default: '',
  },
  renameLoading: {
    type: Boolean,
    default: false,
  },
  descriptionLoading: {
    type: Boolean,
    default: false,
  },
  deployDisabled: {
    type: Boolean,
    default: false,
  },
  saveDisabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (e: 'execute', action: 'deploy' | 'save'): void;
  (e: 'rename', name: string): void;
  (e: 'descriptionChange', description: string): void;
  (e: 'close'): void;
}>();

const nameEditing = ref(false);
const nameDraft = ref('');
const nameInputRef = ref();
const descriptionModalOpen = ref(false);
const descriptionDraft = ref('');
const descriptionInputRef = ref();

const startNameEdit = async () => {
  if (props.renameLoading) {
    return;
  }
  nameDraft.value = props.ruleName;
  nameEditing.value = true;
  await nextTick();
  nameInputRef.value?.focus?.();
};

const cancelNameEdit = () => {
  nameDraft.value = props.ruleName;
  nameEditing.value = false;
};

const commitNameEdit = () => {
  if (!nameEditing.value) {
    return;
  }
  const nextName = nameDraft.value.trim();
  nameEditing.value = false;
  if (!nextName || nextName === props.ruleName) {
    nameDraft.value = props.ruleName;
    return;
  }
  emit('rename', nextName);
};

const startDescriptionEdit = async () => {
  if (props.descriptionLoading) {
    return;
  }
  descriptionDraft.value = props.ruleDescription;
  descriptionModalOpen.value = true;
  await nextTick();
  descriptionInputRef.value?.focus?.();
};

const cancelDescriptionEdit = () => {
  descriptionDraft.value = props.ruleDescription;
  descriptionModalOpen.value = false;
};

const commitDescriptionEdit = () => {
  if (!descriptionModalOpen.value) {
    return;
  }
  const nextDescription = descriptionDraft.value.trim();
  descriptionModalOpen.value = false;
  if (nextDescription === props.ruleDescription.trim()) {
    descriptionDraft.value = props.ruleDescription;
    return;
  }
  emit('descriptionChange', nextDescription);
};

watch(
  () => props.ruleName,
  (value) => {
    if (!nameEditing.value) {
      nameDraft.value = value;
    }
  },
  { immediate: true },
);

watch(
  () => props.ruleDescription,
  (value) => {
    if (!descriptionModalOpen.value) {
      descriptionDraft.value = value;
    }
  },
  { immediate: true },
);
</script>

<style src="./RuleEditorHeader.less" scoped lang="less" />
