import { request } from '@jetlinks-web/core';
/**
 * 获取告警配置列表
 */
export const queryList = (data:any) => request.post('/alarm/config/detail/_query',data);
/**
 * 启动告警配置
 */
export const _enable = (id:string) => request.post(`/alarm/config/${id}/_enable`);
/**
 * 禁用告警配置
 */
export const _disable = (id:string) => request.post(`/alarm/config/${id}/_disable`);
/**
 * 删除告警配置
 */
export const remove = (id:string) => request.remove(`/alarm/config/${id}`);
/**
 * 手动触发告警
 */
export const _execute = (data:any) => request.post('/scene/batch/_execute',data);
/**
 * 下拉框场景数据
 */
export const getScene = (params:Record<string,any>) => request.get('/scene/_query/no-paging?paging=false',params);
/**
 * 获取配置类型
 */
export const getTargetTypes = () => request.get('/alarm/config/target-type/supports');
/**
 * 保存基本设置
 */
export const save = (data:any) =>request.post('/alarm/config',data);
/**
 * 更新基础设置
 */
export const update = (data:any) => request.patch('/alarm/config',data);
/**
 * 获取基础设置数据
 */
export const detail = (id:string) => request.get(`/alarm/config/${id}`);
/**
 * 解除场景联动绑定
 */
// export const unbindScene = (id:string,data:any, branchId: string) => request.post(`/alarm/rule/bind/${id}/_delete?branchIndex=${branchId}`,data); // 新解绑接口

export const unbindScene = (id:string,data:any) => request.post(`/alarm/rule/bind/${id}/_delete`,data);

export const unBindAlarm = (id: string, alarmId: string, data: any) => request.post(`/alarm/rule/bind/${alarmId}/${id}/_delete`, data)
export const unBindAlarmMultiple = (data: any) => request.post(`/alarm/rule/bind/_delete`, data)
/**
 * 保存关联场景
 */
export const bindScene = (data:any) => request.patch("/alarm/rule/bind",data)

/**
 * 查询关联的场景执行动作id
 * @param data
 */
export const queryBindScene = (data:any) => request.post("/alarm/rule/bind/_query",data)
