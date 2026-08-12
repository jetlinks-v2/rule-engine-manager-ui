import type { AiSceneTreeItem } from './alarmData.types'
import { searchDomainAgentItems } from '@jetlinks-web-core/layout/components/AiChat/domainAgentTools'

export interface VisionAlarmSceneTarget {
  algorithmId: string
  name: string
  description?: string
}

export interface VisionAlarmScene {
  sceneId: string
  name: string
  description?: string
  targets: VisionAlarmSceneTarget[]
}

interface ScoredVisionAlarmScene {
  scene: VisionAlarmScene
  score: number
}

const normalizeText = (value: unknown) => String(value || '').trim()
const compactText = (value: unknown) => normalizeText(value)
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '')

const textUnits = (value: unknown) => (
  normalizeText(value).toLocaleLowerCase().match(/\p{Script=Han}|[\p{L}\p{N}]+/gu) || []
)

const bigrams = (value: string) => {
  const chars = [...value]
  if (chars.length < 2) return chars
  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`)
}

const overlapRatio = (queryUnits: string[], targetUnits: string[]) => {
  const querySet = new Set(queryUnits)
  if (!querySet.size) return 0
  const targetSet = new Set(targetUnits)
  const matched = [...querySet].filter(unit => targetSet.has(unit)).length
  return matched / querySet.size
}

const similarity = (query: string, value: string) => {
  const queryText = compactText(query)
  const valueText = compactText(value)
  if (!queryText || !valueText) return 0
  if (queryText === valueText) return 120
  if (valueText.includes(queryText)) return 100
  if (valueText.length > 1 && queryText.includes(valueText)) return 80

  const unitScore = overlapRatio(textUnits(query), textUnits(value)) * 50
  const bigramScore = overlapRatio(bigrams(queryText), bigrams(valueText)) * 40
  const charScore = overlapRatio([...queryText], [...valueText]) * 25
  return Math.max(unitScore, bigramScore, charScore)
}

const sceneScore = (scene: VisionAlarmScene, query: string) => Math.max(
  similarity(query, scene.name) * 1.2,
  similarity(query, scene.description || '') * 0.7,
  ...scene.targets.flatMap(target => [
    similarity(query, target.name) * 1.1,
    similarity(query, target.description || '') * 0.6,
  ]),
)

const normalizeTarget = (value: Record<string, unknown>): VisionAlarmSceneTarget | undefined => {
  const id = normalizeText(value.value)
  if (!id) return undefined
  return {
    algorithmId: id,
    name: normalizeText(value.text) || id,
    description: normalizeText(value.description) || undefined,
  }
}

export const normalizeVisionAlarmScenes = (scenes: AiSceneTreeItem[]): VisionAlarmScene[] => (
  scenes.flatMap((scene) => {
    const id = normalizeText(scene.id)
    if (!id) return []
    const targets = (scene.taskTargetDetails?.length ? scene.taskTargetDetails : scene.children || [])
      .map(item => normalizeTarget(item as Record<string, unknown>))
      .filter((item): item is VisionAlarmSceneTarget => Boolean(item))
    return [{
      sceneId: id,
      name: normalizeText(scene.name) || normalizeText(scene.category) || id,
      description: normalizeText(scene.description) || undefined,
      targets,
    }]
  })
)

export const searchVisionAlarmScenes = (
  scenes: VisionAlarmScene[],
  query: string,
): VisionAlarmScene[] => {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) return scenes

  const directMatches = searchDomainAgentItems(
    scenes,
    normalizedQuery,
    scene => [
      scene.sceneId,
      scene.name,
      scene.description,
      ...scene.targets.flatMap(target => [target.algorithmId, target.name, target.description]),
    ],
    scenes.length,
  ).data
  // 只按真实场景文本做通用相关度排序；低相关候选不进入模型上下文，也不维护业务同义词特调。
  const fuzzyMatches = scenes
    .map<ScoredVisionAlarmScene>(scene => ({ scene, score: sceneScore(scene, normalizedQuery) }))
    .filter(item => item.score >= 10)
    .sort((left, right) => right.score - left.score || left.scene.name.localeCompare(right.scene.name))
    .map(item => item.scene)
  return Array.from(new Map(
    [...directMatches, ...fuzzyMatches].map(scene => [scene.sceneId, scene]),
  ).values())
}
