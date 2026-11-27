import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setParamsValue, useRouterParams } from '@jetlinks-web/hooks'
import { onlyMessage } from '@jetlinks-web/utils'
import { deleteRule, getRuleDetail, startRule, stopRule } from '../../api/instance'
import { useRuleEditorRouteState } from './useRuleEditorRouteState'
import type { RuleListItem } from './listTypes'
import type { CreatedTemplateRule } from './Templates/useRuleTemplateCreation'
import type { TemplateCreationRequest, TemplateInitialization } from './Templates/types'
import { getRuleTemplate } from './Templates/catalog'

export function useRuleInstanceActions(refresh: () => void) {
  const { t } = useI18n()
  const route = useRoute(), router = useRouter()
  const routerParams = useRouterParams()
  const visible = ref(false)
  const current = ref<Record<string, unknown>>()
  const pending = ref('')
  const templateInitialization = ref<TemplateInitialization>()
  const templateRequest = ref<TemplateCreationRequest>()
  const ruleEditor = reactive<{ visible: boolean; current?: Record<string, unknown> }>({ visible: false })
  const { openRuleEditor, closeRuleEditor } = useRuleEditorRouteState({ route, router, ruleEditor, t })

  async function open(item: RuleListItem) {
    if (pending.value) return
    pending.value = item.id
    try {
      const response = await getRuleDetail(item.id, true)
      if (response.status !== 200 || !response.result?.id) throw new Error('rule detail unavailable')
      templateInitialization.value = undefined
      // A projected list row must never become the full configuration sent to the editor or save action.
      openRuleEditor(response.result)
    } catch { onlyMessage(t('RuleEditor.index.restoreFailed'), 'error') }
    finally { pending.value = '' }
  }

  async function execute(item: RuleListItem, action: 'toggle' | 'delete') {
    if (pending.value) return
    pending.value = item.id
    try {
      const response = await (action === 'delete' ? deleteRule(item.id)
        : item.state?.value === 'started' ? stopRule(item.id) : startRule(item.id))
      if (response.status === 200) { onlyMessage(t('Instance.index.020452-11')); refresh() }
      else onlyMessage(t('Instance.index.020452-12'), 'error')
    } finally { pending.value = '' }
  }

  const add = () => { templateRequest.value=undefined;current.value = { name: '', description: '' }; visible.value = true }
  const created = (result: CreatedTemplateRule) => {
    visible.value = false
    templateInitialization.value = result.initialization
    // Query navigation may remount the page; retain the same initialization handoff used by agent creation.
    setParamsValue(route.name, {ruleTemplateInitialization:{ruleId:result.rule.id,initialization:result.initialization}})
    openRuleEditor(result.rule)
    refresh()
  }
  const updated = (rule: Record<string, unknown>) => { Object.assign(ruleEditor.current || {}, rule); refresh() }
  onMounted(() => { if (routerParams.params.value?.save && !routerParams.params.value?.ruleTemplate) add() })
  watch(()=>routerParams.params.value?.ruleTemplate,request=>{
    if(!request || !getRuleTemplate(String(request.templateId)))return
    add();templateRequest.value=request as TemplateCreationRequest
  },{immediate:true})
  watch(()=>[routerParams.params.value?.ruleTemplateInitialization,route.query.editorId] as const,([value])=>{
    if(value?.ruleId && value.ruleId===route.query.editorId)templateInitialization.value=value.initialization
  },{immediate:true})
  return { visible, current, pending, ruleEditor, closeRuleEditor, templateInitialization, templateRequest, add, created, open, execute, updated }
}
