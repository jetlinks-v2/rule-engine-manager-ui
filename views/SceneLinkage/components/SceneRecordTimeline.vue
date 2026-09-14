<template>
  <JlDrawerShell
    :open="open"
    :width="760"
    icon="HistoryOutlined"
    :title="$t('IotSceneLinkage.title.records')"
    :sub="scene.name"
    @update:open="emit('update:open', $event)"
  >
    <section class="scene-record-timeline">
      <a-spin :spinning="state.loading && !state.records.length">
        <a-result
          v-if="state.loadError && !state.records.length"
          status="error"
          :title="$t('IotSceneLinkage.record.loadFailed')"
        >
          <template #extra>
            <a-button type="primary" @click="emit('retry')">{{ $t('IotSceneLinkage.action.retry') }}</a-button>
          </template>
        </a-result>
        <a-empty
          v-else-if="!state.records.length"
          :description="$t('IotSceneLinkage.record.empty')"
        />
        <template v-else>
          <article
            v-for="record in state.records"
            :key="record.id"
            class="scene-record-timeline__card"
            :class="{ 'scene-record-timeline__card--expanded': state.expandedContextId === record.contextId }"
          >
            <header class="scene-record-timeline__card-header">
              <div class="scene-record-timeline__card-meta">
                <j-badge-status
                  :status="record.hasError ? 'error' : 'success'"
                  :text="record.hasError ? $t('IotSceneLinkage.record.failed') : $t('IotSceneLinkage.record.success')"
                />
                <time>{{ formatSceneExecutionTime(record.createTime) }}</time>
                <span class="scene-record-timeline__card-summary">{{ formatAction(record.action) }}</span>
                <span v-if="record.useNanos != null" class="scene-record-timeline__duration">
                  {{ $t('IotSceneLinkage.record.duration', { duration: formatSceneExecutionDuration(record.useNanos) }) }}
                </span>
              </div>
              <a-button
                type="link"
                :disabled="!record.contextId"
                @click="emit('toggle-record', record)"
              >
                {{ state.expandedContextId === record.contextId ? $t('IotSceneLinkage.action.collapse') : $t('IotSceneLinkage.action.viewDetail') }}
              </a-button>
            </header>

            <section v-if="state.expandedContextId === record.contextId" class="scene-record-timeline__details">
              <a-spin :spinning="state.detailLoading">
                <a-result
                  v-if="state.detailError"
                  status="error"
                  :title="$t('IotSceneLinkage.record.loadFailed')"
                >
                  <template #extra>
                    <a-button type="link" @click="emit('retry-detail')">{{ $t('IotSceneLinkage.action.retry') }}</a-button>
                  </template>
                </a-result>
                <a-empty
                  v-else-if="!state.detailLoading && !state.detailRecords.length"
                  :description="$t('IotSceneLinkage.record.empty')"
                />
                <div v-else class="scene-record-timeline__nodes">
                  <section v-for="detail in state.detailRecords" :key="detail.id" class="scene-record-timeline__node">
                    <i :class="detail.hasError ? 'scene-record-timeline__dot--error' : 'scene-record-timeline__dot--success'" />
                    <div>
                      <header>
                        <b>{{ detail.nodeName || formatAction(detail.action) }}</b>
                        <small>{{ formatSceneExecutionTime(detail.createTime || detail.timestamp) }}</small>
                        <span v-if="detail.useNanos != null" class="scene-record-timeline__duration">
                          {{ $t('IotSceneLinkage.record.duration', { duration: formatSceneExecutionDuration(detail.useNanos) }) }}
                        </span>
                        <j-badge-status
                          :status="detail.hasError ? 'error' : 'success'"
                          :text="detail.hasError ? $t('IotSceneLinkage.record.failed') : $t('IotSceneLinkage.record.success')"
                        />
                      </header>
                      <p class="scene-record-timeline__node-result">{{ detail.errorDetail || $t('IotSceneLinkage.record.success') }}</p>
                    </div>
                  </section>
                </div>
              </a-spin>
            </section>
          </article>
          <div v-if="state.records.length < state.total" class="scene-record-timeline__more">
            <a-button :loading="state.loading" @click="state.loadError ? emit('retry') : emit('load-more')">
              {{ state.loadError ? $t('IotSceneLinkage.action.retry') : $t('IotSceneLinkage.action.loadMore') }}
            </a-button>
          </div>
        </template>
      </a-spin>
    </section>
  </JlDrawerShell>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatSceneExecutionDuration, formatSceneExecutionTime, type SceneExecutionRecord, type SceneExecutionRecordState } from '../hooks/useSceneExecutionRecords'
import { enumText } from '../utils'

interface SceneInfo {
  id: string
  name?: string
}

defineProps({
  open: {
    type: Boolean,
    required: true,
  },
  scene: {
    type: Object as PropType<SceneInfo>,
    required: true,
  },
  state: {
    type: Object as PropType<SceneExecutionRecordState>,
    required: true,
  },
})

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void
  (event: 'toggle-record', record: SceneExecutionRecord): void
  (event: 'load-more'): void
  (event: 'retry'): void
  (event: 'retry-detail'): void
}>()

const { t: $t } = useI18n()

function formatAction(value: SceneExecutionRecord['action']) {
  return enumText(value, $t('IotSceneLinkage.action.execute'))
}
</script>

<style scoped>
.scene-record-timeline {
  display: grid;
  gap: var(--space-3);
}

.scene-record-timeline__card {
  padding: var(--space-3) var(--space-4);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-2);
}

.scene-record-timeline__card--expanded {
  border-color: var(--ant-color-primary);
}

.scene-record-timeline__card-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  min-height: 2rem;
}

.scene-record-timeline__card-header > .ant-btn {
  margin-left: auto;
}

.scene-record-timeline__card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}

.scene-record-timeline__card-meta time,
.scene-record-timeline__node small,
.scene-record-timeline__duration {
  color: var(--ant-color-text-tertiary);
  font-size: var(--fs-12);
}

.scene-record-timeline__card-summary {
  flex: 0 0 4.5rem;
  max-width: 4.5rem;
  overflow: hidden;
  color: var(--ant-color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-record-timeline__card-meta > .scene-record-timeline__duration {
  flex: 0 0 5rem;
}

.scene-record-timeline__details {
  padding-top: var(--space-4);
  margin-top: var(--space-4);
  border-top: 1px solid var(--line);
}

.scene-record-timeline__nodes {
  display: grid;
  gap: var(--space-4);
}

.scene-record-timeline__node {
  position: relative;
  display: flex;
  gap: var(--space-3);
}

.scene-record-timeline__node:not(:last-child)::before {
  position: absolute;
  top: 1rem;
  bottom: calc(-1 * var(--space-4));
  left: 0.5rem;
  border-left: 1px solid var(--line);
  content: '';
}

.scene-record-timeline__node > i {
  z-index: 1;
  flex: none;
  width: 1rem;
  height: 1rem;
  background: var(--ant-color-success);
  border-radius: 50%;
  box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--ant-color-success) 12%, transparent);
}

.scene-record-timeline__node > i.scene-record-timeline__dot--error {
  background: var(--ant-color-error);
  box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--ant-color-error) 12%, transparent);
}

.scene-record-timeline__node > div {
  display: grid;
  flex: 1;
  gap: var(--space-2);
  min-width: 0;
}

.scene-record-timeline__node header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.scene-record-timeline__node-result {
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ant-color-text-secondary);
  background: var(--bg-sunken);
  border-radius: var(--r-2);
}

.scene-record-timeline__more {
  padding-top: var(--space-1);
  text-align: center;
}

@media (max-width: 640px) {
  .scene-record-timeline__card-summary {
    max-width: 100%;
  }
}
</style>
