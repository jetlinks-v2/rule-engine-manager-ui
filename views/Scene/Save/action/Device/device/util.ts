import { sceneImages } from "../../../../data"

export const TypeMap = {
    fixed: {
        label: '自定义',
        value: 'fixed',
        image: sceneImages.deviceCustom,
        tip: '自定义选择当前产品下的任意设备',
        disabled: false
    },
    relation: {
        label: '按关系',
        value: 'relation',
        image: sceneImages.deviceRelation,
        tip: '选择与触发设备具有相同关系的设备',
        disabled: false
    },
    tag: {
        label: '按标签',
        value: 'tag',
        image: sceneImages.deviceTag,
        tip: '按标签选择产品下具有特定标签的设备',
        disabled: false
    },
    context: {
        label: '按变量',
        value: 'context',
        image: sceneImages.deviceVariable,
        tip: '选择设备ID为上游变量值的设备',
        disabled: false
    },
}
