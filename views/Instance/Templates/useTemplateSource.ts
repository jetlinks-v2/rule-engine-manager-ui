import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'
import { i18nText } from '@jetlinks-web-core/components/I18n/text'
import { loadTemplateResource, loadTemplateThingModel, queryTemplateResources } from '../../../api/ruleTemplates'
import { compatibleThingModels, eventDefinitions } from './models'
import { isNumericProperty } from './buildFlow'
import { useResourceOptions } from './useResourceOptions'
import type { DeviceSource, ModelDefinition, TemplateId, ThingModel } from './types'

export function useTemplateSource(templateId:Ref<TemplateId>,locale:Ref<string>) {
  const productId=ref<string>(),deviceIds=ref<string[]>([]),scope=ref<'product'|'devices'>('product')
  const message=ref<'property'|'event'>('property'),propertyIds=ref<string[]>([]),eventId=ref<string>(),eventFieldIds=ref<string[]>([])
  const format=ref<DeviceSource['format']>('message'),includeMetadata=ref(false),model=ref<ThingModel>(),loading=ref(false),error=ref(false)
  let generation=0,prefillGeneration=0
  const prefilling=ref(false)
  const products=useResourceOptions((keyword,page)=>queryTemplateResources('product',keyword,page))
  const devices=useResourceOptions((keyword,page)=>queryTemplateResources('device',keyword,page,productId.value))
  const localize=(definition:ModelDefinition)=>({...definition,name:i18nText(definition.name || definition.id,definition.nameI18n,String(locale.value))})
  const numericOnly=computed(()=>['device-summary','threshold-notify'].includes(templateId.value))
  const needsModel=computed(()=>templateId.value!=='device-forward' || message.value==='event' || format.value!=='message')
  const properties=computed(()=> (model.value?.properties || []).filter(property=>
    (!numericOnly.value || isNumericProperty(property)) && (templateId.value!=='scheduled-read' || property.expands?.type?.includes('read'))).map(localize))
  const events=computed(()=>(model.value?.events || []).map(localize))
  const event=computed(()=>events.value.find(item=>item.id===eventId.value))
  const eventFields=computed(()=>eventDefinitions(event.value).map(localize))
  const clearFields=()=>{propertyIds.value=[];eventId.value=undefined;eventFieldIds.value=[];model.value=undefined}
  async function loadModel() {
    const token=++generation
    clearFields();loading.value=false;error.value=false
    if(!needsModel.value || !productId.value || (scope.value==='devices' && !deviceIds.value.length))return
    loading.value=true
    try {
      const values:ThingModel[]=[]
      if(scope.value==='product')values.push(await loadTemplateThingModel('product',productId.value))
      else {
        const ids=[...deviceIds.value]
        let cursor=0
        await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{
          while(cursor<ids.length && token===generation){const id=ids[cursor++];values.push(await loadTemplateThingModel('device',id))}
        }))
      }
      if(token===generation)model.value=compatibleThingModels(values)
    } catch {if(token===generation)error.value=true}
    finally {if(token===generation)loading.value=false}
  }
  watch(productId,()=>{if(prefilling.value)return;deviceIds.value=[];devices.clear();void loadModel()})
  watch([scope,()=>deviceIds.value.join('\0')],()=>{if(!prefilling.value)void loadModel()})
  watch(needsModel,()=>{if(!prefilling.value)void loadModel()})
  watch(eventId,()=>{eventFieldIds.value=[]})
  watch(message,()=>{propertyIds.value=[];eventId.value=undefined;eventFieldIds.value=[];if(message.value==='event' && format.value==='records')format.value='message'})
  watch(templateId,()=>{
    prefillGeneration++;prefilling.value=false
    generation++;productId.value=undefined;deviceIds.value=[];clearFields();error.value=false;loading.value=false
    devices.clear()
    scope.value=templateId.value==='scheduled-read' ? 'devices' : 'product'
    message.value=templateId.value==='event-action' ? 'event' : 'property'
    format.value=['device-normalize','device-summary','threshold-notify'].includes(templateId.value) ? 'records' : 'message'
    includeMetadata.value=false
  },{immediate:true})
  const source=computed<DeviceSource|undefined>(()=>{
    const product=productId.value ? products.find(productId.value) : undefined
    if(!product || (needsModel.value && (error.value || loading.value || !model.value)))return
    const chosen=deviceIds.value.map(id=>devices.find(id)).filter((item):item is NonNullable<typeof item>=>!!item)
    if(chosen.length!==deviceIds.value.length)return
    return {product,scope:scope.value,devices:chosen,message:message.value,
      properties:properties.value.filter(item=>propertyIds.value.includes(item.id)),event:event.value,eventFields:eventFields.value.filter(item=>eventFieldIds.value.includes(item.id)),format:format.value,includeMetadata:includeMetadata.value}
  })
  async function prefill(input:Record<string,unknown>) {
    const token=++prefillGeneration
    const ids=(value:unknown)=>Array.isArray(value) ? value.filter((item):item is string=>typeof item==='string') : []
    if(typeof input.productId!=='string')return
    prefilling.value=true;error.value=false
    try {
      const product=await loadTemplateResource('product',input.productId)
      const selected=await Promise.all(ids(input.deviceIds).map(id=>loadTemplateResource('device',id)))
      if(token!==prefillGeneration)return
      if(selected.some(device=>device.productId!==product.id))throw new Error('device scope mismatch')
      products.remember(product);selected.forEach(devices.remember)
      productId.value=product.id;deviceIds.value=selected.map(device=>device.id)
      scope.value=templateId.value==='scheduled-read' || input.scope==='devices' || selected.length ? 'devices' : 'product'
      if(input.message==='event' || input.message==='property')message.value=input.message
      if(['message','fields','records'].includes(String(input.format)))format.value=input.format as DeviceSource['format']
      else if(templateId.value==='device-forward' && ids(input.propertyIds).length)format.value='fields'
      includeMetadata.value=input.includeMetadata===true
      await nextTick()
      if(token!==prefillGeneration)return
      prefilling.value=false
      await loadModel()
      if(token!==prefillGeneration)return
      propertyIds.value=ids(input.propertyIds).filter(id=>properties.value.some(item=>item.id===id))
      eventId.value=events.value.find(item=>item.id===input.eventId)?.id
      await nextTick()
      eventFieldIds.value=ids(input.eventFieldIds).filter(id=>eventFields.value.some(item=>item.id===id))
    } catch {if(token===prefillGeneration)error.value=true}
    finally {if(token===prefillGeneration)prefilling.value=false}
  }
  onScopeDispose(()=>{generation++;prefillGeneration++})
  return {products,devices,productId,deviceIds,scope,message,propertyIds,eventId,eventFieldIds,format,includeMetadata,properties,events,eventFields,source,loading,error,loadModel,prefill,prefilling}
}
