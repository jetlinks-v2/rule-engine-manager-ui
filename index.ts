const routerModules = import.meta.glob('./views/**/index.vue')


const getAsyncRoutesMap = () => {
    const modules = {}
    Object.keys(routerModules).forEach(item => {
        const code = item.replace('./views/', '').replace('/index.vue', '')
        const key = `rule-engine/${code}`
        modules[key] = routerModules[item]
    })

    return modules
}

const getExtraRoutesMap = () => {
    return {
        'rule-engine/Scene': {
            children: [
                {
                    code: 'Save',
                    url: '/Save',
                    name: '详情信息',
                    component: () => import('./views/Scene/Save/index.vue')
                }
            ]
        },
        'rule-engine/Alarm/Configuration': {
            children: [
                {
                    code: 'Save',
                    url: '/Save',
                    name: '详情',
                    component: () => import('./views/Alarm/Configuration/Save/index.vue')
                }
            ]
        },
        'rule-engine/Alarm/Log': {
            children: [
                {
                    code: 'Record',
                    url: '/Record',
                    name: '处理记录',
                    component: () => import('./views/Alarm/Log/Record/index.vue')
                },
                {
                    code: 'Detail',
                    url: '/Detail/:id',
                    name: '详情',
                    component: () => import('./views/Alarm/Log/Detail/index.vue')
                }
            ]
        },
    }
}

export default {
    getAsyncRoutesMap,
    getExtraRoutesMap
}
