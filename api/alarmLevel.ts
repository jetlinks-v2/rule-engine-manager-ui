import { request } from '@jetlinks-web/core'
import { langKey } from '@jetlinks-web-core/utils/consts'

export type AlarmLevelTone = 'high' | 'med' | 'low'

export interface AlarmLevelConfig {
  level?: number | string
  title?: string
  name?: string
  i18nMessages?: Record<string, string>
  [key: string]: unknown
}

export interface AlarmLevelOption {
  level: number
  value: number
  label: string
  shortLabel: string
  tone: AlarmLevelTone
  raw: AlarmLevelConfig
}

interface AlarmLevelConfigResult {
  levels?: AlarmLevelConfig[]
}

type ApiResponse<T> = {
  result?: T
}

let cachedAlarmLevelOptions: AlarmLevelOption[] = []
let loadingPromise: Promise<AlarmLevelOption[]> | undefined

export const queryAlarmLevelConfig = (signal?: AbortSignal) =>
  request.get('/alarm/config/default/level', {}, signal ? { signal } : undefined) as Promise<
    ApiResponse<AlarmLevelConfigResult> | AlarmLevelConfigResult
  >

export async function queryAlarmLevelOptions(signal?: AbortSignal): Promise<AlarmLevelOption[]> {
  if (signal) {
    const response = await queryAlarmLevelConfig(signal)
    const result = unwrapResult<AlarmLevelConfigResult>(response) ?? {}
    return normalizeAlarmLevelOptions(result.levels ?? [])
  }
  if (loadingPromise) return loadingPromise
  const promise = queryAlarmLevelConfig()
    .then((response) => {
      const result = unwrapResult<AlarmLevelConfigResult>(response) ?? {}
      cachedAlarmLevelOptions = normalizeAlarmLevelOptions(result.levels ?? [])
      return cachedAlarmLevelOptions
    })
    .finally(() => {
      loadingPromise = undefined
    })
  loadingPromise = promise
  return promise
}

export function getCachedAlarmLevelOptions(): AlarmLevelOption[] {
  return cachedAlarmLevelOptions
}

export function normalizeAlarmLevelValue(value: unknown): number | undefined {
  const candidates = isPlainObject(value)
    ? [value.level, value.value, value.id]
    : [value]
  for (const candidate of candidates) {
    if (candidate == null || (typeof candidate === 'string' && !candidate.trim())) continue
    const level = Number(candidate)
    if (Number.isFinite(level)) return level
  }
  return undefined
}

export function formatAlarmLevelLabel(level: unknown, options = cachedAlarmLevelOptions): string {
  const value = normalizeAlarmLevelValue(level)
  if (value == null) return ''
  return options.find(option => option.level === value)?.label || ''
}

export function formatAlarmLevelShortLabel(level: unknown, options = cachedAlarmLevelOptions): string {
  const value = normalizeAlarmLevelValue(level)
  if (value == null) return ''
  return options.find(option => option.level === value)?.shortLabel || ''
}

export function resolveAlarmLevelTone(level: unknown): AlarmLevelTone {
  const value = normalizeAlarmLevelValue(level)
  if (value != null && value <= 2) return 'high'
  if (value === 3) return 'med'
  return 'low'
}

export function normalizeAlarmLevelOptions(levels: AlarmLevelConfig[]): AlarmLevelOption[] {
  return levels
    .map((item): AlarmLevelOption | undefined => {
      const level = normalizeAlarmLevelValue(item.level)
      if (level == null) return undefined
      const label = resolveLevelTitle(item)
      return {
        level,
        value: level,
        label,
        shortLabel: label,
        tone: resolveAlarmLevelTone(level),
        raw: item,
      }
    })
    .filter((item): item is AlarmLevelOption => Boolean(item))
    .sort((left, right) => left.level - right.level)
}

function resolveLevelTitle(item: AlarmLevelConfig): string {
  const language = localStorage.getItem(langKey) || 'zh'
  const messages = item.i18nMessages ?? {}
  const message = getLanguageKeys(language)
    .map(key => messages[key])
    .find(Boolean)
  return String(message || item.title || item.name || '').trim()
}

function getLanguageKeys(language: string): string[] {
  const normalized = language.replace('-', '_')
  const keys = [language, normalized]
  if (normalized.startsWith('zh')) keys.push('zh_CN', 'zh')
  if (normalized.startsWith('en')) keys.push('en_US', 'en')
  return Array.from(new Set(keys))
}

function unwrapResult<T>(response: ApiResponse<T> | T | undefined | null): T | undefined {
  if (response && typeof response === 'object' && 'result' in response) {
    return (response as ApiResponse<T>).result
  }
  return response as T | undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
