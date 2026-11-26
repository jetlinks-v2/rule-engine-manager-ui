import { createServer } from 'vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { platformModules } from './platform.mjs'
import { createFixtureBackend } from './fixtures.mjs'

/** 独立 Vite 宿主加载真实业务页面，HTTP 模拟接口在同源内闭环。 */
export async function startFixtureServer(
  uiRoot,
  moduleRoot,
  { sourceRoot = moduleRoot, legacy = false } = {},
) {
  const coreRoot = path.join(uiRoot, 'jetlinks-web-core/src')
  const fixtureRoot = path.join(moduleRoot, 'tests/frontend')
  const cachedDeps = path.join(uiRoot, 'jetlinks-web-core/node_modules/.vite/deps')
  let dependencyAliases = []
  try {
    const metadata = JSON.parse(await readFile(path.join(cachedDeps, '_metadata.json'), 'utf8'))
    dependencyAliases = Object.entries(metadata.optimized)
      .sort((a, b) => b[0].length - a[0].length)
      .map(([name, item]) => ({
        find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
        replacement: path.resolve(cachedDeps, item.file),
      }))
  } catch {}
  const virtual = platformModules(coreRoot, sourceRoot)
  const backend = createFixtureBackend()
  const cacheDir = path.join(uiRoot, 'node_modules/.vite-scene-frontend')
  console.log('HOST: 创建隔离测试服务')
  const server = await createServer({
    configFile: false,
    root: uiRoot,
    publicDir: path.join(uiRoot, 'jetlinks-web-core/public'),
    cacheDir,
    logLevel: 'error',
    resolve: {
      alias: [
        ...dependencyAliases,
        ...Object.entries({
          '@jetlinks-web-core/locales': '/__fixture/i18n.js',
          '@jetlinks-web-core/locales/index': '/__fixture/i18n.js',
          '@jetlinks-web-core/store': 'store',
          '@jetlinks-web-core/store/menu': 'menu',
          '@jetlinks-web-core/store/auth': 'auth',
          '@jetlinks-web-core/hooks': 'hooks',
          '@jetlinks-web-core/components': 'components',
          '@jetlinks-web-core/components/IconValue': 'icons',
        }).map(([name, id]) => ({
          find: new RegExp('^' + name + '$'),
          replacement: '\0scene-fixture:' + id,
        })),
        { find: '@', replacement: coreRoot },
        { find: '@theme-config', replacement: path.join(uiRoot, 'jetlinks-web-core/configs/theme/index.ts') },
        { find: '@jetlinks-web-core', replacement: coreRoot },
        { find: '@rule-engine-manager-ui', replacement: sourceRoot },
        { find: '@device-manager-ui', replacement: path.join(uiRoot, 'modules/device-manager-ui') },
        { find: '@edge-master-ui', replacement: path.join(uiRoot, 'modules/edge-master-ui') },
      ],
      dedupe: ['vue', 'vue-router', 'pinia', 'vue-i18n', 'ant-design-vue'],
    },
    define: {
      'import.meta.env.VITE_APP_BASE_API': '"/__api"',
      'import.meta.env.VITE_TOKEN_KEY': '"X-Access-Token"',
      'import.meta.env.VITE_APP_ENVIRONMENT': '""',
      'import.meta.env.VITE_BUILD': '"test"',
    },
    css: {
      preprocessorMaxWorkers: 0,
      preprocessorOptions: {
        less: {
          additionalData:
            '@import "' + path.join(coreRoot, 'style/variable.less').replaceAll('\\', '/') + '";\n',
          modifyVars: {
            'primary-color': '#1677ff',
            'error-color': '#ff4d4f',
            'primary-color-hover': '#4096ff',
            'item-hover-bg': '#f5f5f5',
            'primary-color-active': '#0958d9',
            'text-color': '#1f2429',
            'primary-1': '#e6f4ff',
          },
          javascriptEnabled: true,
        },
      },
    },
    plugins: [
      vue(),
      vueJsx(),
      AutoImport({ imports: ['vue', 'vue-router'], dts: false }),
      {
        name: 'scene-frontend-host',
        enforce: 'pre',
        resolveId(id) {
          const names = {
            '@jetlinks-web-core/locales': '/__fixture/i18n.js',
            '@jetlinks-web-core/locales/index': '/__fixture/i18n.js',
            '@jetlinks-web-core/store': 'store',
            '@jetlinks-web-core/store/menu': 'menu',
            '@jetlinks-web-core/store/auth': 'auth',
            '@jetlinks-web-core/hooks': 'hooks',
            '@jetlinks-web-core/components': 'components',
            '@jetlinks-web-core/components/IconValue': 'icons',
          }
          if (id === 'virtual:__federation__') return '\0scene-fixture:federation'
          if (id.startsWith('\0scene-fixture:')) return id
          const absolute = (
            id.startsWith('.') && arguments[1] ? path.resolve(path.dirname(arguments[1]), id) : id
          )
            .replaceAll('\\', '/')
            .replace(/\.ts$/, '')
          const core = coreRoot.replaceAll('\\', '/')
          for (const [suffix, key] of [
            ['/router', 'router'],
            ['/router/index', 'router'],
            ['/utils/modules', 'modules'],
            ['/store/menu', 'menu'],
            ['/store/auth', 'auth'],
            ['/store/index', 'store'],
            ['/locales/index', '/__fixture/i18n.js'],
          ])
            if (absolute === core + suffix) return '\0scene-fixture:' + key
          if (names[id]) return '\0scene-fixture:' + names[id]
          if (virtual[id]) return '\0scene-fixture:' + id
        },
        load(id) {
          if (id === 'virtual:__federation__') return '\0scene-fixture:federation'
          if (id.startsWith('\0scene-fixture:')) return virtual[id.slice(15)]
        },
        configureServer(vite) {
          vite.middlewares.use(async (req, res, next) => {
            if (req.url === '/' || req.url === '/index.html') {
              res.setHeader('Content-Type', 'text/html; charset=utf-8')
              res.end(
                await vite.transformIndexHtml(
                  '/',
                  '<!doctype html><html><head><link rel="icon" href="data:,"></head><body><div id="app"></div><script type="module" src="/@fs/' +
                    path.join(fixtureRoot, legacy ? 'legacy-entry.js' : 'entry.js').replaceAll('\\', '/') +
                    '"></script></body></html>',
                ),
              )
              return
            }
            if (req.url === '/tests-entry.js') {
              res.setHeader('Content-Type', 'text/javascript')
              res.end(await readFile(path.join(fixtureRoot, 'entry.js'), 'utf8'))
              return
            }
            if (!req.url.startsWith('/__api/')) return next()
            const parsed = new URL(req.url, 'http://localhost')
            let payload = ''
            for await (const chunk of req) payload += chunk.toString('utf8')
            try {
              const result = await backend.handle(
                req.method,
                parsed.pathname.slice(6),
                payload ? JSON.parse(payload) : {},
                parsed.searchParams,
              )
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(
                JSON.stringify(result?.success === false ? result : { status: 200, success: true, result }),
              )
            } catch (error) {
              res.statusCode = 501
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ status: 501, success: false, message: error.message }))
            }
          })
        },
      },
    ],
    optimizeDeps: dependencyAliases.length
      ? { noDiscovery: true, include: [] }
      : {
          noDiscovery: true,
          entries: [],
          include: [
            'vue',
            'vue-router',
            'pinia',
            'vue-i18n',
            'ant-design-vue',
            '@jetlinks-web/components',
            '@jetlinks-web/core',
            '@jetlinks-web/utils',
            '@jetlinks-web/hooks',
            'lodash-es',
            'dayjs',
          ],
        },
    server: { watch: null, host: '127.0.0.1', port: 0, fs: { allow: [uiRoot, fixtureRoot, sourceRoot] } },
  })
  console.log('HOST: 启动监听')
  await server.listen()
  console.log('HOST: 就绪')
  return { server, backend, cacheDir, url: `http://127.0.0.1:${server.httpServer.address().port}` }
}
