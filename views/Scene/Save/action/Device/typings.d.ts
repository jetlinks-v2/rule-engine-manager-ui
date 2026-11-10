export type DeviceModelType = {
    productId: string;
    selector: string;
    selectorValues: any;
    source: string;
    upperKey: string;
    deviceId: string;
    message: {
        properties?: any;
        messageType: string;
        inputs?: any[];
        functionId?: string;
    }
}

export type DeviceOptionType = {
    name?: string | string[];
    productName?: string;
    propertiesValue?: string;
    propertiesName?: any;
    tagName?: string;
    relationName?: string;
    actionName?: string;
}


/** 设备指令和设备信息弹窗共用的位置及展示参数，value 保留各自动作原生结构。 */
export type DeviceActionModalProps = {
  value: Record<string, any>;
  options: Record<string, any>;
  name: number;
  thenName: number;
  branchesName: number;
  parallel: boolean;
}
