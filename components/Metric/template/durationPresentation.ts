/** 单位名称由语言包决定；数值与保存的 ISO 时长不参与文案转换。 */
export function durationUnitText(unit:string, amount:number|undefined, t:(key:string)=>string):string {
  return t(amount === 1 ? `${unit}Singular` : unit)
}
