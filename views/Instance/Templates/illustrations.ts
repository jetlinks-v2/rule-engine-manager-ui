import forwardHttp from '../../../assets/rule-templates/forward-http.svg?raw'
import forwardMqtt from '../../../assets/rule-templates/forward-mqtt.svg?raw'
import forwardKafka from '../../../assets/rule-templates/forward-kafka.svg?raw'
import normalize from '../../../assets/rule-templates/normalize.svg?raw'
import transform from '../../../assets/rule-templates/transform.svg?raw'
import parallel from '../../../assets/rule-templates/parallel.svg?raw'
import query from '../../../assets/rule-templates/query.svg?raw'
import queryAll from '../../../assets/rule-templates/query-all.svg?raw'
import scheduledRead from '../../../assets/rule-templates/scheduled-read.svg?raw'
import eventAction from '../../../assets/rule-templates/event-action.svg?raw'
import thresholdNotify from '../../../assets/rule-templates/threshold-notify.svg?raw'
import manualTransform from '../../../assets/rule-templates/manual-transform.svg?raw'
import type { DeviceSource, TemplateId, TemplateParameters, Translate } from './types'

export interface TemplateIllustration {
  id: TemplateId
  target?: TemplateParameters['target']
  message?: DeviceSource['message']
}
const illustrations: Partial<Record<TemplateId, string>> = {
  'device-normalize': normalize, 'transform-response': transform, 'parallel-response': parallel,
  'device-query': query, 'device-query-all': queryAll, 'scheduled-read': scheduledRead,
  'event-action': eventAction, 'threshold-notify': thresholdNotify, 'manual-transform': manualTransform,
}
const forwarding = { 'http request': forwardHttp, 'mqtt out': forwardMqtt, 'kafka-producer': forwardKafka }
export function templateIllustrationSource(illustration: TemplateIllustration): string {
  return illustration.id === 'device-forward' || illustration.id === 'device-summary'
    ? forwarding[illustration.target || 'http request'] : illustrations[illustration.id] || ''
}
const xmlText = (text: string) => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]!)

/** Geometry and icons are exported assets; only trusted translation slots change at runtime. */
export function localizedTemplateIllustration(illustration: TemplateIllustration, t: Translate): string {
  return templateIllustrationSource(illustration).replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, key: string) => {
    const step = key === 'source' && illustration.message === 'event' ? 'eventSource' : key
    return xmlText(t(`RuleTemplates.steps.${step}`))
  })
}
