<template>
  <div class="ai-event-media-channel-grid">
    <a-spin :spinning="loading">
      <div v-if="channels.length" class="ai-event-media-channel-grid__items">
        <VirtualScroll
          class="ai-event-media-channel-grid__scroll"
          :data="channelRows"
          :item-height="CHANNEL_ROW_HEIGHT"
          @reach-bottom="loadMore"
        >
          <template #renderItem="row">
            <div class="ai-event-media-channel-grid__row">
              <article
                v-for="channel in row.channels"
                :key="channel.id"
                class="ai-event-media-channel-grid__item"
                :class="{
                  'is-selected': selectedKeys.includes(channelKey(channel)),
                  'is-active': activeKey === channelKey(channel),
                }"
              >
                <button
                  class="ai-event-media-channel-grid__select"
                  type="button"
                  role="checkbox"
                  :aria-checked="selectedKeys.includes(channelKey(channel))"
                  :aria-label="channel.name || channel.channelId"
                  @click="toggle(channel)"
                >
                  <AIcon v-if="selectedKeys.includes(channelKey(channel))" type="CheckOutlined" />
                </button>
                <button class="ai-event-media-channel-grid__content" type="button" @click="select(channel)">
                  <span class="ai-event-media-channel-grid__image">
                    <img v-if="channelImage(channel)" :src="channelImage(channel)" :alt="channel.name || channel.channelId">
                    <span v-else class="ai-event-media-channel-grid__image-empty"><AIcon type="VideoCameraOutlined" /></span>
                    <em class="ai-event-media-channel-grid__status">{{ channelStatus(channel) }}</em>
                  </span>
                </button>
                <div class="ai-event-media-channel-grid__meta">
                  <button class="ai-event-media-channel-grid__title" type="button" @click="select(channel)">
                    <strong>{{ channel.name || channel.channelId }}</strong>
                  </button>
                  <a-button type="link" size="small" @click.stop="preview(channel)">{{ $t('IotSceneLinkage.action.preview') }}</a-button>
                </div>
              </article>
            </div>
          </template>
        </VirtualScroll>
        <div v-if="loadingMore" class="ai-event-media-channel-grid__loading-more"><a-spin size="small" /></div>
      </div>
      <a-empty v-else :description="$t('IotSceneLinkage.aiEvent.noCameras')" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import type { AiEventMediaChannel } from '../../../../api/scene-linkage'

const props = defineProps<{
  channels: AiEventMediaChannel[]
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  selectedKeys: string[]
  activeKey?: string
}>()

const emit = defineEmits<{
  (event: 'toggle', channel: AiEventMediaChannel): void
  (event: 'select', channel: AiEventMediaChannel): void
  (event: 'preview', channel: AiEventMediaChannel): void
  (event: 'load-more'): void
}>()

const { t: $t } = useI18n()
const CHANNELS_PER_ROW = 3
const CHANNEL_ROW_HEIGHT = 172
const channelRows = computed(() => {
  const rows: Array<{ id: string; channels: AiEventMediaChannel[] }> = []
  for (let index = 0; index < props.channels.length; index += CHANNELS_PER_ROW) {
    rows.push({
      id: props.channels.slice(index, index + CHANNELS_PER_ROW).map(channelKey).join('|'),
      channels: props.channels.slice(index, index + CHANNELS_PER_ROW),
    })
  }
  return rows
})

function channelKey(channel: AiEventMediaChannel) {
  return `${channel.deviceId}:${channel.channelId}`
}

function channelImage(channel: AiEventMediaChannel) {
  return channel.image || channel.others?.playerScreenshotCover || ''
}

function channelStatus(channel: AiEventMediaChannel) {
  return channel.status?.text || channel.status?.value || $t('IotSceneLinkage.aiEvent.statusUnknown')
}

function toggle(channel: AiEventMediaChannel) {
  emit('toggle', channel)
}

function select(channel: AiEventMediaChannel) {
  emit('select', channel)
}

function preview(channel: AiEventMediaChannel) {
  emit('preview', channel)
}

function loadMore() {
  if (props.hasMore && !props.loadingMore) emit('load-more')
}

</script>

<style scoped>
.ai-event-media-channel-grid { min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
.ai-event-media-channel-grid :deep(.ant-spin-nested-loading), .ai-event-media-channel-grid :deep(.ant-spin-container), .ai-event-media-channel-grid__items { height: 100%; min-height: 0; }
.ai-event-media-channel-grid__items { position: relative; }
.ai-event-media-channel-grid__scroll { height: 100%; }
.ai-event-media-channel-grid__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); height: calc(100% - .625rem); gap: .625rem; }
.ai-event-media-channel-grid__item { position: relative; min-width: 0; overflow: hidden; border: .0625rem solid var(--line, #e5e7eb); border-radius: var(--r-2, .5rem); background: var(--bg, #fff); transition: border-color .15s ease, box-shadow .15s ease; }
.ai-event-media-channel-grid__item:hover { border-color: color-mix(in srgb, var(--accent, #1677ff) 42%, var(--line, #e5e7eb)); }
.ai-event-media-channel-grid__item.is-selected { border-color: color-mix(in srgb, var(--accent, #1677ff) 60%, var(--line, #e5e7eb)); }
.ai-event-media-channel-grid__item.is-active { border-color: var(--accent, #1677ff); box-shadow: 0 0 0 .0625rem var(--accent, #1677ff); }
.ai-event-media-channel-grid__content { display: block; width: 100%; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.ai-event-media-channel-grid__content:focus-visible, .ai-event-media-channel-grid__title:focus-visible, .ai-event-media-channel-grid__select:focus-visible { outline: .125rem solid var(--jet-theme-primary-3, #91caff); outline-offset: -.125rem; }
.ai-event-media-channel-grid__image { position: relative; display: block; aspect-ratio: 1.7; overflow: hidden; background: var(--canvas, #f5f5f5); }
.ai-event-media-channel-grid__image img { width: 100%; height: 100%; object-fit: cover; }
.ai-event-media-channel-grid__image-empty { display: grid; width: 100%; height: 100%; place-items: center; color: var(--ink-4, #9ca3af); font-size: 2rem; }
.ai-event-media-channel-grid__status { position: absolute; top: .5rem; left: .5rem; padding: .1875rem .4375rem; border-radius: 1rem; color: #fff; background: rgb(15 23 42 / 58%); font-size: .625rem; font-style: normal; }
.ai-event-media-channel-grid__select { position: absolute; z-index: 1; top: .5rem; right: .5rem; display: grid; width: 1.125rem; height: 1.125rem; place-items: center; padding: 0; border: .125rem solid #fff; border-radius: .1875rem; color: #fff; background: rgb(15 23 42 / 36%); cursor: pointer; font-size: .625rem; }
.ai-event-media-channel-grid__item.is-selected .ai-event-media-channel-grid__select { border-color: var(--accent, #1677ff); background: var(--accent, #1677ff); }
.ai-event-media-channel-grid__meta { display: flex; align-items: center; min-width: 0; padding: .375rem .5rem; }
.ai-event-media-channel-grid__title { flex: 1; min-width: 0; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.ai-event-media-channel-grid__title > strong { display: block; overflow: hidden; color: var(--ink-1, #1f2937); font-size: var(--fs-12, .75rem); text-overflow: ellipsis; white-space: nowrap; }
.ai-event-media-channel-grid__meta :deep(.ant-btn-link) { flex: none; padding: 0; }
.ai-event-media-channel-grid__loading-more { position: absolute; right: .5rem; bottom: .5rem; }
.ai-event-media-channel-grid :deep(.ant-empty) { display: grid; min-height: 100%; place-content: center; }
</style>
