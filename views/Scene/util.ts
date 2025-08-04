import type {ActionBranchesProps} from "./typings";
import {isArray} from "lodash-es";
import i18n from '@/locales'
const $t = i18n.global.t

export const handleGroup = (branches: ActionBranchesProps[]) => {
    let group: Array<Array<ActionBranchesProps | null>> = []

    branches.forEach((item) => {
        const lastIndex = group.length - 1
        if (item?.executeAnyway) {
            group[lastIndex] = [item]
        } else {
            if (isArray(group[lastIndex])) {
                group[lastIndex].push(item)
            } else {
                group[lastIndex] = [item]
            }
        }
    })

    // 判断每组末尾是否有数据并且when有值
    if (group.length) {
        group = group.map(item => {
            if (item.length && item[item.length -1]?.when?.length) {
                item.push(null)
            }
            return item
        })
    } else {
        group[0] = [null]
    }

    return group
}



export const groupToArray = (branchesGroup: Array<ActionBranchesProps[]>) => {
    const arr:ActionBranchesProps[] = []

    branchesGroup.forEach(item => {

    })
}

export const handleParamsGroupBySource = (data: any[], options: any) => {
    const sourceKey = options?.sourceKey || 'others'
    const source = [{
        name: $t("MultiDevice.index-07221552-4"),
        value: 'default',
    }]
    const cloneData = JSON.parse(JSON.stringify(data))
    const arr = [{
        name: $t("MultiDevice.index-07221552-4"),
        column: 'default',
        value: 'default',
        id: 'default',
        disabled: true,
        multiTag: true
    }]


    for (let i = 0; i < cloneData.length; i++) {
        const item = cloneData[i]
        const _others = item[sourceKey]

        if (!item.column.includes('.') && _others?.sourceTrigger) {
            item.column = `${_others.sourceTrigger}.${item.column}`
        }

        if (i > 0) {
            const currentElement = cloneData[i - 1]

            if (_others?.sourceTrigger && _others.sourceTrigger !== currentElement[sourceKey]?.sourceTrigger) {
                const sourceItem = {
                    value: _others.sourceTrigger,
                    column: _others.sourceTrigger,
                    id: _others.sourceTrigger,
                    name: $t("MultiDevice.index-07221552-3", [source.length]),
                    disabled: true,
                    multiTag: true
                }
                source.push(sourceItem)
                arr.push(sourceItem, item)
            } else {
                arr.push(item)
            }
        } else {
            arr.push(item)
        }
    }

    return { data: arr, source}
}
