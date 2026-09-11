import type {
  AiAggregateTaskOption,
  AiSceneTreeOption,
  AiTaskTargetOption,
} from '../../../api/scene-linkage'
import type { AiEventResourceOption } from './components/AiEventResourceOption.vue'

type Translate = (key: string, values?: Record<string, unknown>) => string

export function createAiSceneResourceOption(
  scene: AiSceneTreeOption,
  t: Translate,
): AiEventResourceOption {
  const details = [
    scene.aliases,
    t('IotSceneLinkage.aiEvent.option.targetCount', { count: scene.children?.length || 0 }),
  ].filter(Boolean)

  return {
    label: scene.name || scene.id,
    value: scene.id,
    description: details.join(' · '),
    icon: 'scene',
  }
}

export function createAiTaskTargetResourceOption(target: AiTaskTargetOption): AiEventResourceOption {
  return {
    label: target.text || target.value,
    value: target.value,
    description: target.description,
    icon: 'AimOutlined',
  }
}

export function createAiAggregateTaskResourceOption(
  task: AiAggregateTaskOption,
  alarmLevels: Record<string, string>,
  t: Translate,
): AiEventResourceOption {
  return {
    label: task.name || task.id,
    value: task.id,
    description: [
      formatAlarmLevel(task.alarmLevel, alarmLevels, t),
      t('IotSceneLinkage.aiEvent.option.videoCount', { count: task.videoCount || 0 }),
      formatActivePeriod(task.timeInterval, t),
    ].join(' · '),
    icon: 'DeploymentUnitOutlined',
  }
}

function formatAlarmLevel(level: unknown, alarmLevels: Record<string, string>, t: Translate) {
  const value = Number(level)
  if (!Number.isInteger(value) || value <= 0) {
    return t('IotSceneLinkage.aiEvent.option.alarmLevel', {
      level: t('IotSceneLinkage.aiEvent.option.alarmLevelUnset'),
    })
  }
  return t('IotSceneLinkage.aiEvent.option.alarmLevel', {
    level: alarmLevels[String(value)] || t('IotSceneLinkage.aiEvent.option.alarmLevelUnset'),
  })
}

function formatActivePeriod(timeInterval: unknown, t: Translate) {
  const specs = getScheduleSpecs(timeInterval)
  // 聚合任务未保存时间计划时按全天执行；这是视觉告警任务保存时的既有语义。
  if (!specs.length || isAllDaySchedule(specs)) {
    return t('IotSceneLinkage.aiEvent.option.activeAllDay')
  }
  return t('IotSceneLinkage.aiEvent.option.activeCustom')
}

function getScheduleSpecs(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const multi = (value as Record<string, unknown>).multi
  if (!multi || typeof multi !== 'object' || Array.isArray(multi)) return []
  const specs = (multi as Record<string, unknown>).spec
  return Array.isArray(specs)
    ? specs.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

function isAllDaySchedule(specs: Array<Record<string, unknown>>) {
  if (specs.length !== 1) return false
  const [spec] = specs
  const periods = Array.isArray(spec.periods) ? spec.periods : []
  const weekdays = Array.isArray(spec.when) ? spec.when.map(Number).sort((left, right) => left - right) : []
  const allWeekdays = JSON.stringify(weekdays) === JSON.stringify([1, 2, 3, 4, 5, 6, 7])
    || JSON.stringify(weekdays) === JSON.stringify([0, 1, 2, 3, 4, 5, 6])
  if (!allWeekdays || periods.length !== 1) return false

  const period = periods[0]
  if (!period || typeof period !== 'object' || Array.isArray(period)) return false
  const { from, to } = period as Record<string, unknown>
  return from === '00:00' && (to === '23:59' || to === '24:00')
}
