import type { MetricOutputStorage, MetricTemplate, MetricTemplateOutput } from './types'

export function metricStorageMode(output:MetricTemplateOutput):MetricOutputStorage['mode'] {
  return output.persist === false || output.latestOnly ? 'latest' : output.history?.mode || 'all'
}

export function metricStorageOverride(output:MetricTemplateOutput):MetricOutputStorage {
  const mode = metricStorageMode(output)
  return mode === 'all' || mode === 'latest' ? { mode } : { ...output.history!, mode }
}

export function metricOutputWithStorage(output:MetricTemplateOutput, policy?:MetricOutputStorage):MetricTemplateOutput {
  if (!policy) return output
  return { ...output, persist:policy.mode !== 'latest', latestOnly:policy.mode === 'latest',
    history:policy.mode === 'all' || policy.mode === 'latest' ? undefined : { mode:policy.mode,
      deadband:policy.deadband || 0, intervalMillis:policy.intervalMillis || 0, maxIntervalMillis:policy.maxIntervalMillis || 0 } }
}

export function metricStoredOutputCount(template:MetricTemplate, overrides:Record<string,MetricOutputStorage> = {}) {
  return metricRecordingOutputIds(template.outputs,overrides).length
}

export function metricRecordingOutputIds(outputs:MetricTemplateOutput[], overrides:Record<string,MetricOutputStorage> = {}) {
  return outputs.filter(output => metricStorageMode(metricOutputWithStorage(output,overrides[output.metricId])) !== 'latest').map(output=>output.metricId)
}

export function metricOutputHasCompleteHistory(output:MetricTemplateOutput) { return metricStorageMode(output) === 'all' }

export function metricTemplateWithStorage(template:MetricTemplate, overrides:Record<string,MetricOutputStorage> = {}):MetricTemplate {
  return Object.keys(overrides).length ? { ...template,outputs:template.outputs.map(output=>metricOutputWithStorage(output,overrides[output.metricId])) } : template
}

export function metricStorageSummary(output:MetricTemplateOutput, t:(key:string, values?:Record<string,unknown>)=>string):string {
  const mode = metricStorageMode(output)
  if (mode === 'interval') return t('storageIntervalSummary',{ seconds:(output.history?.intervalMillis || 0) / 1000 })
  if (mode === 'onChange') return t('storageChangeSummary',{ value:output.history?.deadband || 0, unit:output.unit || '' })
  return t(mode === 'latest' ? 'configLatestOnly' : 'historyAllResults')
}
