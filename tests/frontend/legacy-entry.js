import { createApp, h } from 'vue'
import { createRouter, createWebHashHistory, RouterView } from 'vue-router'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import JetLinksComponents, { ConfigProvider } from '@jetlinks-web/components'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import componentsZhCN from '@jetlinks-web/components/es/locale/zh-CN'
import { setToken } from '@jetlinks-web/utils'
import { crateAxios } from '@jetlinks-web/core'
import { usePermissionContext } from '@jetlinks-web/hooks'
import i18n from '/__fixture/i18n.js'
import ConfirmModal from '@jetlinks-web-core/components/ConfirmModal/index.vue'
import CloudEmpty from '@jetlinks-web-core/components/CloudEmpty/index.vue'
import FullPage from '@jetlinks-web-core/layout/FullPage.vue'
import TitleComponent from '@jetlinks-web-core/components/TitleComponent/index.vue'
import 'ant-design-vue/dist/reset.css'
import '@jetlinks-web-core/style.css'
setToken('scene-frontend-fixture-token')
crateAxios({
  filter_url: ['/'],
  code: 200,
  codeKey: 'status',
  requestOptions: () => ({ baseURL: '/__api' }),
  handleResponse: (r) => {
    if (r.data.success === false) throw new Error(r.data.message)
    return r.data
  },
  handleError: () => false,
})
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/editor?id=baseline-manual' },
    {
      path: '/editor',
      name: 'rule-engine/Scene/Save',
      component: () => import('@rule-engine-manager-ui/views/Scene/Save/index.vue'),
    },
    { path: '/list', name: 'rule-engine/Scene', component: { render: () => h('div', '已保存') } },
  ],
})
window.__fixtureNavigate = (id, params) =>
  router.push(
    String(id).endsWith('/Editor')
      ? { name: 'rule-engine/Scene/Editor', params: params || {} }
      : { name: 'rule-engine/Scene' },
  )
const app = createApp({
  setup() {
    usePermissionContext({ hasPermission: () => true, permission: () => true })
    return () =>
      h(
        ConfigProvider,
        { locale: zhCN, componentsLocale: componentsZhCN, IconConfig: { scriptUrl: '/icons/iconfont.js' } },
        {
          default: () =>
            h(RouterView, null, {
              default: ({ Component, route }) => (Component ? h(Component, { key: route.fullPath }) : null),
            }),
        },
      )
  },
})
app.use(Antd).use(JetLinksComponents).use(createPinia()).use(router).use(i18n)
app
  .component('ConfirmModal', ConfirmModal)
  .component('CloudEmpty', CloudEmpty)
  .component('FullPage', FullPage)
  .component('TitleComponent', TitleComponent)
app.mount('#app')
await router.isReady()
window.__fixtureReady = true
