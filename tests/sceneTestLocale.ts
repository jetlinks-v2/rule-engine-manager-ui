import zh from '../locales/lang/zh.json'

// Node 测试只替换应用级语言装配，不加载 Vite 的 import.meta.glob 与运行时注册。
export default { global: { locale: { value: 'zh' }, t: (key: string, params: Record<string, unknown> = {}) => (zh[key as keyof typeof zh] || key).replace(/\{([^}]+)\}/g, (_, name) => String(params[name] ?? '')) } }
