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
        }
    }
}

export default {
    getAsyncRoutesMap,
    getExtraRoutesMap
}
