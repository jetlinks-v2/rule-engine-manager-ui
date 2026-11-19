import type {
  AiVisualAlarmTaskOption,
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

export function createAiVisualAlarmTaskResourceOption(
  task: AiVisualAlarmTaskOption,
  alarmLevels: Record<string, string>,
  t: Translate,
): AiEventResourceOption {
  return {
    label: task.name || task.id,
    value: task.id,
    description: [
      formatAlarmLevel(task.alarmLevel, alarmLevels, t),
      t('IotSceneLinkage.aiEvent.option.videoCount', { count: task.sourceCount || 0 }),
      formatActivePeriod(task.timerPeriodSpec, t),
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

function formatActivePeriod(value: unknown, t: Translate) {
  const periods = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).periods : undefined
  return t(Array.isArray(periods) && periods.length
    ? 'IotSceneLinkage.aiEvent.option.activeCustom'
    : 'IotSceneLinkage.aiEvent.option.activeAllDay')
}
