/** 仅替换宿主应用会话和导航，不替换场景表单、节点、弹窗、序列化或预览组件。 */
export function platformModules(coreRoot, moduleRoot) {
  const fsPath = (p) => '/@fs/' + p.replaceAll('\\', '/')
  return {
    federation: `export const __federation_method_add_origin_setRemote=()=>{throw new Error('测试禁止加载远程模块')};export const __federation_method_getRemote=__federation_method_add_origin_setRemote;export const __federation_method_unwrapDefault=x=>x`,
    '/__fixture/i18n.js': `import {createI18n} from 'vue-i18n'; import zh from '${fsPath(
      moduleRoot + '/locales/lang/zh.json',
    )}'; import core from '${fsPath(coreRoot + '/locales/lang/zh.json')}';import device from '${fsPath(
      coreRoot + '/../../modules/device-manager-ui/locales/lang/zh.json',
    )}'; export default createI18n({legacy:false,flatJson:true,locale:'zh',fallbackLocale:'zh',messages:{zh:{...core,...device,...zh}}})`,
    router: `export default {push:(target)=>window.__fixtureNavigate?.(target),replace:()=>{},currentRoute:{value:{query:{},params:{}}}}`,
    modules: `export const modules=()=>({});export const getModulesMenu=()=>[];export const registerModule=()=>{};export const getModulesInitPage=()=>null;export const getHideHeaderRightConfig=()=>({});export const getPackageConfig=()=>({})`,
    store: `export * from '/__fixture/menu.js';export * from '/__fixture/auth.js';export const useSystemStore=()=>({themeStyleToken:{},isLight:true})`,
    menu: `import {reactive} from 'vue'; const store=reactive({activeMenu:{},menuList:[],layout:'top',jumpPage:(id,params)=>window.__fixtureNavigate?.(id,params),getMenuByCode:()=>({}),getMenuByName:()=>({})});export const useMenuStore=()=>store`,
    '/__fixture/menu.js': `export * from '@jetlinks-web-core/store/menu'`,
    '/__fixture/auth.js': `export * from '@jetlinks-web-core/store/auth'`,
    auth: `import {reactive} from 'vue';const store=reactive({userInfo:{id:'user-1',name:'测试用户'},user:{id:'user-1',name:'测试用户'},hasPermission:()=>true});export const useAuthStore=()=>store`,
    hooks: `export * from '${fsPath(coreRoot + '/hooks/useEmptyCreateState.ts')}';export * from '${fsPath(
      coreRoot + '/hooks/useResponsiveLayoutDimensions.ts',
    )}';export * from '${fsPath(coreRoot + '/hooks/useResponsiveAntdToken.ts')}';export * from '${fsPath(
      coreRoot + '/hooks/useUiTicker.ts',
    )}';export const useTabSaveSuccessBack=()=>({onBack:async()=>false});`,
    components: `export {CardSummary} from '${fsPath(
      coreRoot + '/components/CardBox/index.ts',
    )}';export {default as PageHeader} from '${fsPath(coreRoot + '/components/PageHeader/index.vue')}'`,
    icons: `export {default as IconValueView} from '${fsPath(
      coreRoot + '/components/IconValue/IconValueView.vue',
    )}'`,
  }
}
