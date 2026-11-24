import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetricLoader } from './helpers/metricRuntime.mjs'
const { createMetricResultStreams } = createMetricLoader()('components/Metric/resultStreams.ts')
const tick = () => new Promise(resolve => queueMicrotask(resolve))
const query = { outputs:['value'], query:{pageSize:200}, interval:1000 }
function fixture() {
  const calls=[],received=[],errors=[]
  const watch=createMetricResultStreams((targets,next,error)=>{const call={targets,next,error,stopped:false};calls.push(call);return()=>{call.stopped=true}})
  return {calls,received,errors,add:id=>watch(id,query,frame=>received.push([id,frame]),cause=>errors.push([id,cause.message]))}
}
test('超过六张可见卡片只占一个连接，滚动增删时不重读已就绪历史，旧帧不回填',async()=>{
  const f=fixture(),stops=Array.from({length:10},(_,i)=>f.add(String(i)))
  await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].targets.length,10)
  const first=f.calls[0]
  for(const item of first.targets)first.next({subscriptionId:item.subscriptionId,frame:{kind:'ready'}})
  stops[0]();stops.push(f.add('new'));await tick()
  assert.ok(first.stopped);assert.equal(f.calls.length,2)
  const next=f.calls[1];assert.equal(next.targets.length,10)
  assert.equal(next.targets.filter(t=>t.includeHistory).length,1);assert.equal(next.targets.find(t=>t.includeHistory).configId,'new')
  const before=f.received.length;first.next({subscriptionId:first.targets[1].subscriptionId,frame:{kind:'latest'}})
  assert.equal(f.received.length,before)
  for(const stop of stops)stop();await tick();assert.ok(next.stopped);assert.equal(f.calls.length,2)
})
test('单项失败不终止其他卡片，传输断开会通知当前订阅并释放连接',async()=>{
  const f=fixture(),a=f.add('a'),b=f.add('b');await tick()
  const first=f.calls[0]
  first.next({subscriptionId:first.targets[0].subscriptionId,error:'Denied'})
  first.next({subscriptionId:first.targets[1].subscriptionId,frame:{kind:'ready'}})
  await tick();assert.deepEqual(f.errors,[['a','Denied']]);assert.equal(f.received.length,1)
  assert.equal(f.calls.at(-1).targets.length,1);assert.equal(f.calls.at(-1).targets[0].includeHistory,false)
  const last=f.calls.at(-1);last.error(new Error('disconnected'));await tick()
  assert.deepEqual(f.errors,[['a','Denied'],['b','disconnected']]);assert.ok(last.stopped)
  a();b()
})
test('认证重置后再次组装连接必须补读历史；请求分片保留服务端预算',async()=>{
  const f=fixture(),stops=Array.from({length:129},(_,i)=>f.add(String(i)));await tick()
  assert.deepEqual(f.calls.map(call=>call.targets.length),[128,1])
  const first=f.calls[0],id=first.targets[0].subscriptionId
  first.next({subscriptionId:id,frame:{kind:'ready'}});first.next({subscriptionId:id,frame:{kind:'reset'}})
  stops[128]();await tick();assert.equal(f.calls.at(-1).targets.find(item=>item.subscriptionId===id).includeHistory,true)
  for(const stop of stops)stop();await tick()
})
