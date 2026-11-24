import type { MetricTemplate, MetricTemplateInput, MetricValue } from './types'

export interface MetricInputIssue { inputId:string; reason:string; required:boolean; participated:boolean; eventTime?:number }
const reasonKeys:Record<string,string> = {
  requiredInputMissing:'issueMissing', optionalInputMissing:'issueMissing', inputExpired:'issueExpired',
  inputInvalid:'issueUnavailable', inputUnitMissing:'issueUnitMissing', inputUnitConflict:'issueUnitConflict',
  calculationFailed:'issueCalculationFailed', estimatedInput:'issueEstimated', inputTimeSkew:'issueTimeMismatch',
  inputSamplesInsufficient:'inputSamplesInsufficient', inputGapExceeded:'inputGapExceeded', inputTimeUnknown:'inputTimeUnknown',
}
/** Read only bounded server facts. Unknown reason codes retain a neutral explanation; no source request or device-state inference. */
export function metricInputDiagnostics(value?:MetricValue) {
  const attributes = value?.quality?.attributes
  const raw = attributes?.inputIssues
  const issues:MetricInputIssue[] = Array.isArray(raw) ? raw.slice(0,8).filter((item):item is MetricInputIssue =>
    !!item && typeof item === 'object' && typeof item.inputId === 'string' && typeof item.reason === 'string') : []
  const count = attributes?.inputIssueCount
  return {issues,total:typeof count === 'number' && Number.isFinite(count) ? Math.max(issues.length,count) : issues.length}
}
/** Resolve aliases only inside the affected calculation; another rule may reuse the same alias. */
function issueTarget(issue:MetricInputIssue, template:MetricTemplate | undefined, metricId?:string) {
  const rule = template?.definitions?.find(item=>item.id === metricId)
  const inputs = Array.isArray(rule?.inputs) ? rule.inputs as MetricTemplateInput[] : []
  const binding = inputs.find(input=>input.id === issue.inputId)
  return binding && !binding.source && binding.metricId ? binding.metricId : issue.inputId
}

/** Direct inputs can be located in the binding editor; upstream calculations must not open an unrelated binding. */
export function metricIssueInputId(issue:MetricInputIssue, template:MetricTemplate | undefined, metricId?:string) {
  const id = issueTarget(issue,template,metricId)
  return template?.inputDefinitions.find(input=>input.id === id)?.id
}

export function metricIssueName(issue:MetricInputIssue, template:MetricTemplate | undefined, t:(key:string)=>string, metricId?:string) {
  const id = issueTarget(issue,template,metricId)
  const name = template?.inputDefinitions.find(input=>input.id === id)?.name
    || template?.definitions?.find(rule=>rule.id === id)?.name
    || template?.outputs?.find(output=>output.metricId === id)?.label
  return typeof name === 'string' && name.trim() ? name : t('issueSource')
}
export function metricIssueReason(reason:string, t:(key:string)=>string) { return t(reasonKeys[reason] || 'issueUnknown') }

/** Explain only the supplied reason; a generic invalid input does not prove a read failure or an offline device. */
export function metricIssueNextStep(reason:string, t:(key:string)=>string) {
  const key = reason === 'requiredInputMissing' || reason === 'optionalInputMissing' ? 'issueWaitForData'
    : reason === 'inputExpired' || reason === 'inputGapExceeded' ? 'issueCheckFreshness'
      : reason === 'inputSamplesInsufficient' ? 'issueNeedMoreSamples'
        : reason === 'calculationFailed' ? 'issueCheckCalculation'
          : reason === 'inputUnitMissing' || reason === 'inputUnitConflict' ? 'issueCheckUnits'
            : reason === 'inputInvalid' ? 'issueCheckSourceValue' : undefined
  return key ? t(key) : undefined
}
export function metricIssueCaption(value:MetricValue | undefined, template:MetricTemplate | undefined, t:(key:string)=>string) {
  const issue = metricInputDiagnostics(value).issues[0]
  return issue ? `${metricIssueName(issue,template,t,value?.metricId)}：${metricIssueReason(issue.reason,t)}` : undefined
}
