<template>
  <article
    class="alarm-record"
    :class="[mode, { active: facts.state.value === 'warning', occurrence }]"
  >
    <template v-if="mode === 'list'">
      <span
        class="alarm-symbol"
        :title="severityTitle"
        tabindex="0"
      >
        <AlarmLevelIcon
          v-if="level"
          :level="level"
          :alt="severityTitle"
        />
        <AlertOutlined v-else />
      </span>
      <div class="alarm-content">
        <div class="alarm-title">
          <strong :title="grouped ? fullTime : name">{{ grouped ? compactTime : name }}</strong>
          <a-tooltip
            v-if="grouped && durationText"
            :title="durationTitle(facts.duration)"
            :trigger="['hover', 'focus']"
          >
            <span
              class="alarm-duration"
              tabindex="0"
            >
              <ClockCircleOutlined />
              {{ durationText }}
            </span>
          </a-tooltip>
          <RightOutlined
            v-if="!grouped"
            :rotate="expanded ? 90 : 0"
          />
        </div>
        <div
          v-if="!grouped"
          class="alarm-meta"
        >
          <MetaChip
            v-if="facts.state.text"
            :label="facts.state.text"
            :tone="facts.state.value === 'warning' ? 'danger' : 'default'"
          />
          <a-tooltip
            v-if="durationText"
            :title="durationTitle(facts.duration)"
            :trigger="['hover', 'focus']"
          >
            <span
              class="alarm-duration"
              tabindex="0"
            >
              <ClockCircleOutlined />
              {{ durationText }}
            </span>
          </a-tooltip>
          <time :title="fullTime">{{ compactTime }}</time>
        </div>
        <p
          class="alarm-cause"
          :title="description"
        >
          {{ description || '—' }}
        </p>
      </div>
    </template>
    <template v-else-if="mode === 'expanded'">
      <time>{{ fullTime }}</time>
      <p class="expanded-cause">{{ description || '—' }}</p>
      <p
        v-if="conclusion"
        class="alarm-conclusion"
      >
        {{ conclusion }}
      </p>
    </template>
    <template v-else>
      <header class="alarm-title">
        <span
          class="alarm-symbol"
          :title="severityTitle"
          tabindex="0"
        >
          <AlarmLevelIcon
            v-if="level"
            :level="level"
            :alt="severityTitle"
          />
          <AlertOutlined v-else />
        </span>
        <h3>{{ name }}</h3>
        <MetaChip
          v-if="facts.state.text"
          :label="facts.state.text"
          :tone="facts.state.value === 'warning' ? 'danger' : 'default'"
        />
      </header>
      <div
        v-if="record.targetName && (subject.typeId !== record.targetType || subject.id !== record.targetId)"
        class="alarm-context"
      >
        <span v-if="record.targetName && (subject.typeId !== record.targetType || subject.id !== record.targetId)">
          <HddOutlined />
          {{ record.targetName }}
        </span>
      </div>
      <div class="alarm-narrative">
        <p
          v-if="description"
          class="detail-cause"
        >
          {{ t(occurrence ? 'AlarmPresentation.triggerFact' : 'AlarmPresentation.latestFact', { description }) }}
        </p>
        <p
          v-if="conclusion"
          class="alarm-conclusion"
        >
          {{ conclusion }}
        </p>
      </div>
      <a-timeline
        v-if="timeline.length"
        class="alarm-timeline"
      >
        <a-timeline-item
          v-for="moment in timeline"
          :key="`${moment.kind}:${moment.at}`"
          :color="moment.color"
        >
          <template
            v-if="moment.kind === 'handled'"
            #dot
          >
            <CheckCircleOutlined />
          </template>
          <div class="alarm-moment">
            <time
              v-if="moment.time"
              :title="moment.fullTime"
            >
              {{ moment.time }}
            </time>
            <span>{{ moment.label }}</span>
            <a-tooltip
              v-if="moment.duration"
              :title="moment.durationTitle"
              :trigger="['hover', 'focus']"
            >
              <span
                class="alarm-duration"
                tabindex="0"
              >
                <ClockCircleOutlined />
                {{ moment.duration }}
              </span>
            </a-tooltip>
          </div>
        </a-timeline-item>
      </a-timeline>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  HddOutlined,
  RightOutlined
} from '@ant-design/icons-vue'
import MetaChip from '@jetlinks-web-core/components/MetaChip/index.vue'
import AlarmLevelIcon from '../../../../components/AlarmLevelIcon/index.vue'
import type { ObjectRecordPresentationProps } from '@jetlinks-web-core/types/object-presentation'
import { useAlarmRecordPresentation } from '../hooks/useAlarmRecordPresentation'

// The owner supplies business facts; the host retains authorized querying and navigation.
const props = defineProps<ObjectRecordPresentationProps>()
const level = computed(() => {
  const value = Number(props.record.level)
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : undefined
})
const severityTitle = computed(() =>
  props.record.level == null
    ? t('AlarmPresentation.alarm')
    : t('AlarmPresentation.level', { level: props.record.level })
)
const {
  t,
  occurrence,
  grouped,
  name,
  description,
  facts,
  conclusion,
  timeline,
  durationText,
  durationTitle,
  compactTime,
  fullTime
} = useAlarmRecordPresentation(props)
</script>

<style scoped src="./AlarmRecordPresentation.css"></style>
