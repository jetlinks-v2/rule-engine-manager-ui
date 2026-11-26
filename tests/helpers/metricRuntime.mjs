import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const remapping = createRequire(require.resolve('vite/package.json'))('@jridgewell/remapping')
export const coreRoot = fileURLToPath(new URL('../..', import.meta.url))
export const sourceRoot = coreRoot
export const platformRoot = process.env.JETLINKS_WEB_CORE_ROOT || resolve(coreRoot, '../../jetlinks-web-core')
export const platformSources = resolve(platformRoot, 'src')
const instrumented = `/private/tmp/jetlinks-rule-metric-tests/${process.pid}/instrumented`

/** Run real TS/SFC modules with only external UI, browser and transport boundaries replaced. */
export function createMetricLoader(stubs = {}, resolvePath = path => path) {
  stubs={
    // 公共函数目录的传输边界；业务解析、保存和编辑组件仍执行真实代码。
    [resolve(sourceRoot,'components/Metric/expressionApi.ts')]:{metricExpressionFunctions:async()=>['abs','min','max','round','sqrt'].map(name=>({id:`math.${name}`,name,description:name,parameters:[{id:'value',name:'value',valueType:'number'}],returnType:'number',minimumArguments:name === 'min' || name === 'max' ? 2 : 1,maximumArguments:name === 'round' ? 2 : name === 'min' || name === 'max' ? 16 : 1}))},
    [resolve(sourceRoot,'api/expression.ts')]:{expressionFunctions:async()=>['abs','min','max','round','sqrt'].map(name=>({id:`math.${name}`,name,description:name,parameters:[{id:'value',name:'value',valueType:'number'}],returnType:'number',minimumArguments:name === 'min' || name === 'max' ? 2 : 1,maximumArguments:name === 'round' ? 2 : name === 'min' || name === 'max' ? 16 : 1}))},
    ...stubs,
  }
  const aliases = { ...stubs }
  for (const [filename, stub] of Object.entries(stubs)) {
    const name = relative(sourceRoot, filename)
    if (!name.startsWith('..') && !name.startsWith('components/Metric/') && existsSync(resolve(platformSources, name))) aliases[resolve(platformSources, name)] = stub
    if (name === 'components/Metric/api.ts') aliases[resolve(sourceRoot, 'components/Metric/readApi.ts')] = stub
  }
  stubs = aliases
  const cache = new Map()
  const load = filename => {
    filename = resolvePath(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    let source = readFileSync(filename, 'utf8')
    if (Object.hasOwn(stubs, '__metricGlob')) source = source.replaceAll('import.meta.glob', "require('__metricGlob')")
    let sfcMap
    if (filename.endsWith('.vue')) {
      const { descriptor } = parse(source, { filename })
      const script = compileScript(descriptor, { id: filename, inlineTemplate: true })
      source = script.content
      sfcMap = script.map
    }
    const sourcePath = filename.startsWith(platformRoot + '/') ? `core/${relative(platformRoot, filename)}` : relative(coreRoot, filename)
    const output = resolve(instrumented, sourcePath.replace(/\.(ts|vue)$/, '.cjs'))
    mkdirSync(dirname(output), { recursive: true })
    const transpiled = ts.transpileModule(source.replaceAll('import.meta.env', '({})'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, sourceMap: true, inlineSources: true },
    })
    const generatedMap = JSON.parse(transpiled.sourceMapText)
    const mapped = sfcMap ? remapping([generatedMap, sfcMap], () => null) : generatedMap
    mapped.sources = mapped.sources.map(() => filename)
    mapped.file = output
    writeFileSync(`${output}.map`, JSON.stringify(mapped))
    const code = transpiled.outputText.replace(/\/\/# sourceMappingURL=.*$/, '') + `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(mapped)).toString('base64')}`
    writeFileSync(output, code)
    const loaded = new Module(output)
    loaded.filename = output
    loaded.paths = Module._nodeModulePaths(coreRoot)
    cache.set(filename, loaded)
    loaded.require = id => {
      if (Object.hasOwn(stubs, id)) return stubs[id]
      if (id === 'vue') return vue
      if (!id.startsWith('.') && !id.startsWith('@jetlinks-web-core/') && !id.startsWith('@rule-engine-manager-ui/')) return createRequire(filename)(id)
      const base = id.startsWith('.') ? resolve(dirname(filename), id) : id.startsWith('@jetlinks-web-core/') ? resolve(platformSources, id.slice('@jetlinks-web-core/'.length)) : resolve(sourceRoot, id.slice('@rule-engine-manager-ui/'.length))
      if(base.endsWith('.css?inline'))return readFileSync(base.slice(0,-'?inline'.length),'utf8')
      const target = [base, `${base}.ts`, `${base}.vue`, resolve(base, 'index.ts')].map(resolvePath).find(item => existsSync(item) && /\.(ts|vue)$/.test(item))
      if (Object.hasOwn(stubs, target)) return stubs[target]
      if (!target) throw new Error(`Unresolved test import ${id} from ${filename}`)
      if (target.endsWith('.vue') && !target.includes('/components/Metric/') && !target.includes('/components/Expression/')) return { default: passthrough('external-shell'), __esModule: true }
      return load(target)
    }
    loaded._compile(code, output)
    return loaded.exports
  }
  return file => {
    const local = resolve(sourceRoot, file)
    const generic = !file.startsWith('components/Metric/') && !existsSync(local) && existsSync(resolve(platformSources, file))
    return load(generic ? resolve(platformSources, file) : local)
  }
}

// 候选项是由选择器传参调用的 scoped slot，浅层壳不能在没有候选参数时自行调用。
export const passthrough = name => vue.defineComponent({ name, inheritAttrs: true, setup: (_props, { slots }) => () => vue.h(name, Object.entries(slots).flatMap(([key,slot]) => key === 'option' ? [] : slot?.())) })
export const flush = async () => { await vue.nextTick(); await new Promise(resolve => setImmediate(resolve)); await vue.nextTick() }

export function createMetricRenderer() {
  class TestButton { focus(options) { this.focused = options } get isConnected() { return !!this.parent } get disabled() { return !!this.props.disabled } }
  globalThis.HTMLButtonElement = TestButton
  const node = (type, text = '') => Object.assign(type === 'button' ? new TestButton() : {}, {
    type, text, props: {}, style: {}, children: [], parent: null,
    focus(options) { this.focused = options },
    addEventListener(type, listener) { (this.listeners ||= new Map()).set(type,listener) },
    removeEventListener(type, listener) { if (this.listeners?.get(type) === listener) this.listeners.delete(type) },
    // 原位编辑的 DOM 边界：仅模拟实际使用的可聚焦输入查找。
    querySelector() { return walk(this, item => ['input','textarea'].includes(item.type) || item.props.tabindex != null && item.props.tabindex !== '-1')[0] || null },
    querySelectorAll(selector) { return selector === '[data-expression-reference]' ? walk(this,item=>item.props['data-expression-reference'] != null) : [] },
    get dataset() { return { expressionReference:this.props['data-expression-reference'] } },
    classList:{toggle() {}},
  })
  const renderer = vue.createRenderer({
    createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
    insert(child, parent, anchor) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); child.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1; at < 0 ? parent.children.push(child) : parent.children.splice(at, 0, child) },
    remove(child) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); child.parent = null },
    setText: (element, text) => { element.text = text }, setElementText: (element, text) => { element.text = text; element.children = [] },
    setComment: (element, text) => { element.text = text }, patchProp: (element, key, _prior, next) => { element.props[key] = next },
    parentNode: element => element.parent, nextSibling: element => element.parent?.children[element.parent.children.indexOf(element) + 1] || null,
  })
  return { renderer, root: node('root') }
}
export function walk(node, predicate) { return [node, ...node.children.flatMap(child => walk(child, predicate))].filter(predicate) }
export const textContent = node => node.type === '#comment' ? '' : node.text + node.children.map(textContent).join('')
