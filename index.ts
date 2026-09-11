import i18n from "@jetlinks-web-core/locales";
import registerSetting from './register'
import { name } from './package.json'
import { moduleRegistry } from '@jetlinks-web-core/utils/module-registry'

const routerModules = import.meta.glob('./views/**/index.vue')
const getAsyncRoutesMap = () => {
    const modules = {}
    Object.keys(routerModules).forEach(item => {
        const code = item.replace('./views/', '').replace('/index.vue', '')
        const key = `rule-engine/${code}`
        modules[key] = routerModules[item]
    })

    // 私有化与 SaaS 租户项目共用同一套场景联动实现，仅保留不同菜单键的路由别名。
    modules['rule-engine/Scene'] = () => import('./views/SceneLinkage/index.vue')
    modules['iot-user/scene-linkage'] = () => import('./views/SceneLinkage/index.vue')

    return modules
}

const sceneLinkageEditorRoute = {
    code: 'Editor',
    url: '/editor/:id?',
    name: i18n.global.t('rule-engine-manager-ui.index.102627-0'),
    component: () => import('./views/SceneLinkage/editor/index.vue')
}

const getExtraRoutesMap = () => {
    return {
        'rule-engine/Scene': {
            children: [
                {
                    code: 'Save',
                    url: '/Save',
                    name: i18n.global.t('rule-engine-manager-ui.index.102627-0'),
                    component: () => import('./views/Scene/Save/index.vue')
                },
                sceneLinkageEditorRoute
            ]
        },
        // SaaS 租户项目仍使用历史菜单键，但页面实现统一由规则引擎模块提供。
        'iot-user/scene-linkage': {
            children: [sceneLinkageEditorRoute]
        },
        'rule-engine/Alarm/Configuration': {
            children: [
                {
                    code: 'Save',
                    url: '/Save',
                    name: i18n.global.t('rule-engine-manager-ui.index.102627-1'),
                    component: () => import('./views/Alarm/Configuration/Save/index.vue')
                }
            ]
        },
        'rule-engine/Alarm/Log': {
            children: [
                {
                    code: 'Record',
                    url: '/Record',
                    name: i18n.global.t('rule-engine-manager-ui.index.102627-2'),
                    component: () => import('./views/Alarm/Log/Record/index.vue')
                },
                {
                    code: 'Detail',
                    url: '/Detail/:id',
                    name: i18n.global.t('rule-engine-manager-ui.index.102627-1'),
                    component: () => import('./views/Alarm/Log/Detail/index.vue')
                }
            ]
        },
    }
}

const register = () => {
    moduleRegistry.register(name, registerSetting)
}

export default {
    getAsyncRoutesMap,
    getExtraRoutesMap,
    register,
    priority: -100
}
