import type { SummaryTranslate } from './editor/summaryParts'

export type SceneSummaryPart = { keyword: string; value: string; kind: 'trigger' | 'condition' | 'action' | 'otherwise' | 'debounce' }

/** 持久化摘要沿用快速模式的“关键词 空格 正文”格式，连接标点不混入关键词后的正文。 */
export function formatSceneSummaryClauses(lines: Array<{ label?: string; value: string }>): string {
  return lines.map(line => [line.label, line.value].filter(Boolean).join(' ')).join('，')
}

/**
 * 同时读取旧快速摘要和详细模式曾保存的冒号、分号格式，无须重新保存已有场景。
 * 只拆分最外层的规则关键词，括号内的“且/或”仍属于同一个条件表达式。
 */
export function splitSceneSummaryParts(text: string, t: SummaryTranslate): SceneSummaryPart[] {
  const keywords: Array<[string, SceneSummaryPart['kind']]> = [
    [t('IotSceneLinkage.rule.when'), 'trigger'], [t('IotSceneLinkage.rule.and'), 'condition'],
    [t('IotSceneLinkage.rule.then'), 'action'], [t('IotSceneLinkage.summary.then'), 'action'],
    [t('IotSceneLinkage.detail.previewOtherwise'), 'otherwise'], [t('IotSceneLinkage.debounce.enable'), 'debounce'],
    ['当', 'trigger'], ['且', 'condition'], ['就', 'action'], ['则', 'action'], ['否则', 'otherwise'], ['开启防抖', 'debounce'],
  ]
  const kinds = new Map(keywords.map(([keyword, kind]) => [keyword.toLowerCase(), kind]))
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = [...new Set(keywords.map(([keyword]) => keyword))].sort((a, b) => b.length - a.length).map(escape).join('|')
  const matches = [...text.matchAll(new RegExp(`(^|[，,。;；\\s])(${pattern})(?=[:：\\s]|$)\\s*[:：]?\\s*`, 'gi'))]
  const boundaries: Array<{ start: number; body: number; keyword: string; kind: SceneSummaryPart['kind'] }> = []
  const brackets: string[] = []
  const closing: Record<string, string> = { '（': '）', '(': ')', '[': ']', '{': '}' }
  let cursor = 0
  for (const match of matches) {
    const start = match.index! + match[1].length
    while (cursor < start) {
      const char = text[cursor++]
      if (closing[char]) brackets.push(closing[char])
      else if (char === brackets.at(-1)) brackets.pop()
    }
    if (brackets.length) continue
    boundaries.push({ start: match.index!, body: match.index! + match[0].length, keyword: match[2], kind: kinds.get(match[2].toLowerCase())! })
  }
  if (!boundaries.length) return [{ keyword: t('IotSceneLinkage.rule.when'), value: text, kind: 'trigger' }]
  const prefix = text.slice(0, boundaries[0].start).trim()
  return [
    ...(prefix ? [{ keyword: t('IotSceneLinkage.rule.when'), value: prefix, kind: 'trigger' as const }] : []),
    ...boundaries.map((item, index) => ({
      keyword: item.keyword,
      value: text.slice(item.body, boundaries[index + 1]?.start).replace(/[，,。;；]\s*$/, '').trim(),
      kind: item.kind,
    })),
  ]
}
