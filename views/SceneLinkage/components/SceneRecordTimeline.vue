<template>
  <main class="scene-record-timeline">
    <header class="scene-record-timeline__header">
      <a-button type="text" @click="emit('back')"><AIcon type="LeftOutlined" /></a-button>
      <h2>{{ $t('IotSceneLinkage.title.recordsForScene', { name: scene.name }) }}</h2>
    </header>

    <a-spin :spinning="loading && !records.length">
      <a-empty v-if="!records.length" :description="$t('IotSceneLinkage.scope.empty')" />
      <article v-for="record in records" :key="record.id" class="scene-record-timeline__card">
        <header class="scene-record-timeline__card-header">
          <strong>{{ scene.name }}</strong>
          <span>{{ formatTime(record.createTime) }}</span>
          <j-badge-status
            :status="record.hasError ? 'error' : 'success'"
            :text="record.hasError ? $t('IotSceneLinkage.record.failed') : $t('IotSceneLinkage.record.success')"
          />
          <a-button
            type="link"
            :disabled="!record.contextId"
            @click="toggleRecord(record)"
          >
            {{ expandedContextId === record.contextId ? $t('IotSceneLinkage.action.collapse') : $t('IotSceneLinkage.action.viewDetail') }}
          </a-button>
        </header>

        <section v-if="expandedContextId === record.contextId" class="scene-record-timeline__details">
          <a-spin :spinning="detailLoading">
            <a-empty
              v-if="!detailLoading && !detailRecords.length"
              :description="$t('IotSceneLinkage.scope.empty')"
            />
            <div v-else class="scene-record-timeline__nodes">
              <section v-for="detail in detailRecords" :key="detail.id" class="scene-record-timeline__node">
                <i :class="detail.hasError ? 'scene-record-timeline__dot--error' : 'scene-record-timeline__dot--success'" />
                <div>
                  <header>
                    <b>{{ detail.nodeName || detail.action || $t('IotSceneLinkage.action.execute') }}</b>
                    <small>{{ formatTime(detail.createTime || detail.timestamp) }}</small>
                    <j-badge-status
                      :status="detail.hasError ? 'error' : 'success'"
                      :text="detail.hasError ? $t('IotSceneLinkage.record.failed') : $t('IotSceneLinkage.record.success')"
                    />
                  </header>
                  <p>{{ detail.errorDetail || $t('IotSceneLinkage.record.success') }}</p>
                </div>
              </section>
            </div>
          </a-spin>
        </section>
      </article>
      <div v-if="records.length < total" class="scene-record-timeline__more">
        <a-button :loading="loading" @click="loadMore">{{ $t('IotSceneLinkage.action.loadMore') }}</a-button>
      </div>
    </a-spin>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref, type PropType } from 'vue'
import dayjs from 'dayjs'
import { querySceneContextRecords, querySceneRecordsByScene } from '../../../api/scene-linkage'
import { normalizeResult } from '../utils'

interface SceneInfo {
  id: string
  name?: string
}

interface SceneRecord {
  id: string
  contextId?: string
  createTime?: number | string
  timestamp?: number | string
  nodeName?: string
  action?: string
  hasError?: boolean
  errorDetail?: string
}

const props = defineProps({
  scene: {
    type: Object as PropType<SceneInfo>,
    required: true,
  },
})

const emit = defineEmits(['back'])
const loading = ref(false)
const records = ref<SceneRecord[]>([])
const total = ref(0)
const pageIndex = ref(0)
const pageSize = 10
const expandedContextId = ref('')
const detailLoading = ref(false)
const detailRecords = ref<SceneRecord[]>([])
let detailRequestVersion = 0

function formatTime(value: unknown) {
  const time = Number(value)
  return Number.isFinite(time) ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : String(value || '-')
}

async function load() {
  loading.value = true
  try {
    const result = normalizeResult<SceneRecord>(await querySceneRecordsByScene(props.scene.id, {
      pageIndex: pageIndex.value,
      pageSize,
      sorts: [{ name: 'createTime', order: 'desc' }],
    }))
    records.value = pageIndex.value ? [...records.value, ...result.data] : result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function loadMore() {
  pageIndex.value += 1
  load()
}

async function toggleRecord(record: SceneRecord) {
  if (!record.contextId) return
  if (expandedContextId.value === record.contextId) {
    expandedContextId.value = ''
    detailRecords.value = []
    return
  }

  const requestVersion = ++detailRequestVersion
  expandedContextId.value = record.contextId
  detailLoading.value = true
  detailRecords.value = []
  try {
    const result = normalizeResult<SceneRecord>(await querySceneContextRecords(props.scene.id, record.contextId, {
      paging: false,
      sorts: [{ name: 'createTime', order: 'asc' }],
    }))
    // 快速切换执行实例时，仅渲染最后一次展开操作对应的节点记录。
    if (requestVersion === detailRequestVersion) detailRecords.value = result.data
  } finally {
    if (requestVersion === detailRequestVersion) detailLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.scene-record-timeline { width: min(100%, 980px); margin: 0 auto; padding: 24px; }
.scene-record-timeline__header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.scene-record-timeline__header h2 { margin: 0; }
.scene-record-timeline__card { padding: 18px 20px; margin-bottom: 14px; background: #fff; border: 1px solid #e5e6eb; border-radius: 8px; }
.scene-record-timeline__card-header { display: flex; align-items: center; gap: 12px; }
.scene-record-timeline__card-header .ant-btn { margin-left: auto; }
.scene-record-timeline__card-header > span,
.scene-record-timeline__node small { color: var(--ant-color-text-tertiary); font-size: 12px; }
.scene-record-timeline__details { padding-top: 18px; margin-top: 16px; border-top: 1px solid #f0f0f0; }
.scene-record-timeline__nodes { display: grid; gap: 14px; }
.scene-record-timeline__node { position: relative; display: flex; gap: 14px; }
.scene-record-timeline__node:not(:last-child)::before { position: absolute; top: 18px; bottom: -14px; left: 8px; border-left: 1px solid #e5e6eb; content: ''; }
.scene-record-timeline__node > i { z-index: 1; flex: none; width: 16px; height: 16px; background: #00b578; border-radius: 50%; box-shadow: 0 0 0 4px #e8ffea; }
.scene-record-timeline__node > i.scene-record-timeline__dot--error { background: #f53f3f; box-shadow: 0 0 0 4px #ffece8; }
.scene-record-timeline__node > div { display: grid; gap: 6px; min-width: 0; }
.scene-record-timeline__node header { display: flex; align-items: center; gap: 8px; }
.scene-record-timeline__node p { width: max-content; max-width: 640px; padding: 6px 8px; margin: 0; background: #f7f8fa; border-radius: 4px; }
.scene-record-timeline__more { padding: 8px; text-align: center; }
</style>
