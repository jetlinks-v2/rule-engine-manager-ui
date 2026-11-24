import { computed, ref, type Ref } from 'vue'
import type { ConditionFilterField, ConditionFilterTerm } from '@jetlinks-web-core/components/ConditionFilter/types'
import { filterTemplateCatalog, selectCatalogCategory, type TemplateCatalogGroup } from './templateCatalog'

/** 已完整加载的模板目录原位筛选；打开编辑器不重建条件和目录。 */
export function useTemplateCatalog(groups: Ref<TemplateCatalogGroup[]>, t: (key: string) => string) {
  const terms = ref<ConditionFilterTerm[]>([])
  const visible = computed(() => filterTemplateCatalog(groups.value, terms.value))
  const category = computed(() => terms.value.find(term => term.column === 'category' && term.termType === 'eq' && term.type !== 'or')?.value)
  const fields = computed<ConditionFilterField[]>(() => [
    { title:t('templateName'), dataIndex:'name', search:{ type:'string', defaultTermType:'like', termTypeOptions:['like','eq'] } },
    { title:t('templateCategory'), dataIndex:'category', search:{ type:'select', termTypeOptions:['eq'], defaultTermType:'eq', options:groups.value.map(group => ({ value:group.id, label:group.label })) } },
    { title:t('publicationStatus'), dataIndex:'released', search:{ type:'select', termTypeOptions:['eq'], defaultTermType:'eq', options:[{ value:'true', label:t('published') }, { value:'false', label:t('draft') }] } },
  ])
  const selectCategory = (value?: string) => { terms.value = selectCatalogCategory(terms.value, value) }
  const clear = () => { terms.value = [] }
  return { terms, visible, fields, category, selectCategory, clear }
}
