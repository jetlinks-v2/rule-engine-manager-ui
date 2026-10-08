import { request } from '@jetlinks-web/core';

export interface EnumValue {
    value: string;
    text: string;
}

export interface TaskCenterTask {
    id: string;
    name: string;
    description?: string;
    source: string;
    enabledState: EnumValue;
    executeState: EnumValue;
    nodeCount: number;
    runningNodeCount: number;
    pausedNodeCount: number;
    abnormalNodeCount: number;
    startTime?: number;
    lastStateTime?: number;
    createTime?: number;
    modifyTime?: number;
}

export interface TaskExecuteLog {
    id: string;
    instanceId: string;
    nodeId?: string;
    level?: string;
    message?: string;
    createTime?: number;
    timestamp?: number;
    context?: unknown;
}

export interface PagerResult<T> {
    data: T[];
    pageIndex: number;
    pageSize: number;
    total: number;
}

export const queryTasks = (params: Record<string, unknown>) =>
    request.post<PagerResult<TaskCenterTask>>('/task-center/_query', params);

const encodeGetQuery = (params: Record<string, unknown>) => {
    const { sorts, terms: _terms, ...query } = params;
    // QueryParamEntity 的 GET 排序参数使用 sorts[0].name 形式，而非嵌套对象。
    if (Array.isArray(sorts)) {
        sorts.forEach((sort, index) => {
            if (sort && typeof sort === 'object') {
                const value = sort as Record<string, unknown>;
                query[`sorts[${index}].name`] = value.name;
                query[`sorts[${index}].order`] = value.order;
            }
        });
    }
    return query;
};

export const queryTaskLogs = (
    instanceId: string,
    params: Record<string, unknown>,
) => request.get<PagerResult<TaskExecuteLog>>(
    `/task-center/${instanceId}/logs`,
    encodeGetQuery(params),
);
