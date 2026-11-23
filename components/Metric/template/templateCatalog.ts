import type { MetricTemplate, MetricTemplateCategory, MetricTemplateEntity, MetricTemplateStarter } from '@jetlinks-web-core/components/Metric/types'
import { localizedTemplate } from '@jetlinks-web-core/components/Metric/template/text'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import type { ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter/types'

export type TemplateCategory = MetricTemplateCategory
export type TemplateCatalogItem = { template: MetricTemplate; icon: string } & (
  { kind: 'template'; entity: MetricTemplateEntity } | { kind: 'starter'; starter: MetricTemplateStarter }
)
export interface TemplateCatalogGroup { id: string; label: string; items: TemplateCatalogItem[] }

/** 身份包含提供模块和版本；冲突时整批提示，避免按加载顺序悄悄替换参考。 */
export function mergeTemplateStarters(...sources:MetricTemplateStarter[][]):{items:MetricTemplateStarter[];conflicts:string[]} {
  const items = sources.flat(), seen = new Set<string>(), conflicts:string[] = []
  for (const item of items) {
    const identity = JSON.stringify([item.providerId || null,item.id,item.template.version])
    if (seen.has(identity)) conflicts.push([item.providerId,item.id,item.template.version].filter(Boolean).join(' / '))
    seen.add(identity)
  }
  return {items:conflicts.length ? [] : items,conflicts}
}

/** 管理员字典优先；模块分类只补目录展示，不写回或覆盖已有字典。 */
export function starterCategories(categories:TemplateCategory[], starters:MetricTemplateStarter[], locale:string):TemplateCategory[] {
  const result = [...categories]
  for (const item of starters) if (item.groupId && item.groupName && !result.some(group => group.value === item.groupId)) {
    result.push({value:item.groupId,label:i18nText(item.groupName,item.groupNameI18n,locale)})
  }
  return result
}

/** 首页只支持所声明的名称／分类／发布状态条件，不解释后端查询表达式。 */
export function filterTemplateCatalog(groups: TemplateCatalogGroup[], terms: ConditionFilterTerm[]): TemplateCatalogGroup[] {
  function matches(item: TemplateCatalogItem, category: string, conditions: ConditionFilterTerm[]): boolean {
    return conditions.reduce((result, term, index) => {
      let current: boolean
      if (term.terms) current = matches(item, category, term.terms)
      else {
        const value = term.column === 'name' ? item.template.name : term.column === 'category' ? category
          : term.column === 'released' && item.kind === 'template' ? String(Boolean(item.entity.released)) : undefined
        const expected = String(term.value ?? '')
        current = value !== undefined && (term.termType === 'like'
          ? value.toLocaleLowerCase().includes(expected.replace(/^%|%$/g, '').toLocaleLowerCase()) : term.termType === 'eq' && value === expected)
      }
      return index === 0 ? current : term.type === 'or' ? result || current : result && current
    }, true)
  }
  return groups.map(group => ({ ...group, items:group.items.filter(item => matches(item, group.id, terms)) })).filter(group => group.items.length)
}

/** 快捷分类与通用搜索共享条件；替换分类时保留其他字段与分组。 */
export function selectCatalogCategory(terms: ConditionFilterTerm[], category?: string): ConditionFilterTerm[] {
  // 保留节点的原始类型，分组子项仍遵循 ConditionFilter 的表达式契约。
  function removeCategory<T extends ConditionFilterTerm>(conditions: T[]): T[] {
    return conditions.flatMap(term => {
      if (term.terms) {
        const children = removeCategory(term.terms)
        return children.length ? [{ ...term, terms:children }] : []
      }
      return term.column === 'category' ? [] : [term]
    })
  }
  const remaining = removeCategory(terms)
  return category === undefined ? remaining : [...remaining, { column:'category', termType:'eq', value:category, type:'and' }]
}

/** 分类选项来自平台字典，不从模板名称、ID或内置场景显示名推断。 */
export function templateCatalog(entities: MetricTemplateEntity[], categories: TemplateCategory[], locale: string, other: string): TemplateCatalogGroup[] {
  const groups: TemplateCatalogGroup[] = [...categories.map(item => ({ id: item.value, label: item.label, items: [] as TemplateCatalogItem[] })), { id: '', label: other, items: [] }]
  for (const entity of entities) {
    const template = localizedTemplate(entity.template, locale)
    template.name ||= entity.name
    const group = groups.find(item => item.id === template.options?.category) || groups.at(-1)!
    group.items.push({ kind: 'template', entity, template, icon: typeof template.options?.icon === 'string' ? template.options.icon : 'FunctionOutlined' })
  }
  return groups.filter(group => group.items.length)
}

export function starterCatalog(starters: MetricTemplateStarter[], locale: string, categories: TemplateCategory[], other: string): TemplateCatalogGroup[] {
  const groups: TemplateCatalogGroup[] = [...starterCategories(categories,starters,locale).map(item => ({ id:item.value, label:item.label, items:[] as TemplateCatalogItem[] })), { id:'', label:other, items:[] }]
  for (const starter of starters) {
    const group = groups.find(item => item.id === starter.groupId) || groups.at(-1)!
    const template = localizedTemplate(starter.template, locale)
    const localized = {...starter,template,name:template.name,description:String(template.options?.description || starter.description),
      providerName:i18nText(starter.providerName,starter.providerNameI18n,locale),
      industries:starter.industries?.map(industry => ({...industry,name:i18nText(industry.name,industry.nameI18n,locale)}))}
    group.items.push({ kind: 'starter', starter:localized, template, icon: starter.icon || 'FunctionOutlined' })
  }
  return groups.filter(group => group.items.length)
}
