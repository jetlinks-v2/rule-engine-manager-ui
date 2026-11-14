import baseMenu from './baseMenu.json'
import p from './package.json'
import i18n from '@jetlinks-web-core/locales'

const handleMenu = (menus: any[]): any[] => menus.map(item => ({
    ...item,
    ...(item.code === 'rule-engine' ? {
        name: i18n.global.t('IotSceneLinkage.metric.ruleAndCalculation'),
        i18nMessages: { name: { zh_CN: '规则与计算', en_US: 'Rules and calculations', en: 'Rules and calculations' } },
    } : {}),
    children: item.children ? handleMenu(item.children) : undefined,
    options: { appName: p.id || p.name, ...item.options, ...(item.code === 'rule-engine' ? { previousNames: ['规则引擎', 'Rule Engine'] } : {}) }
}))

export default () => {
    return handleMenu(baseMenu)
}
