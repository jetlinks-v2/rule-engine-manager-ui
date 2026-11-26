import type { InjectionKey } from 'vue'

/** 仅在同一设计器内预览和定位声明，不读取运行数据或写入配置。 */
export const templateReferenceKey: InjectionKey<{
  preview(id?: string): void
  locate(id: string): void
}> = Symbol('metric-template-reference')
