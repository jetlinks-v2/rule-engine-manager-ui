import { defineStore } from 'pinia'
import type { FormModelType } from '../views/Scene/typings'
import { detail, sceneValidate } from '../api/scene'
import {cloneDeep, isArray, isObject, set} from 'lodash-es'
import {randomNumber, randomString} from '@jetlinks-web/utils'
import i18n from '@/locales';
import {useRequest} from "@jetlinks-web/hooks";

type ErrorItemType = {
  path: string
  column: string
}

const assignmentKey = (data: any[]): any[] => {
  const onlyKey = ['when', 'then', 'terms', 'actions'];
  if (!data) return [];
  return data.map((item: any) => {
    if (item) {
      item.key = randomString();
      Object.keys(item).some((key) => {
        if (onlyKey.includes(key) && isArray(item[key])) {
          item[key] = assignmentKey(item[key]);
        }
      });
    }
    return item;
  });
};

const defaultBranchId = randomNumber()

export const defaultBranches = [
  {
    when: [
      {
        terms: [
          {
            column: undefined,
            value: {
              source: 'fixed',
              value: undefined
            },
            termType: undefined,
            key: 'params_1',
            type: 'and',
          },
        ],
        type: 'and',
        key: 'terms_1',
      },
    ],
    key: defaultBranchId,
    shakeLimit: {
      enabled: false,
      time: 1,
      threshold: 1,
      alarmFirst: true,
    },
    then: [],
    executeAnyway: true,
    branchId: defaultBranchId,
    branchName: i18n.global.t('Terms.Terms.9093429-8')
  },
];

const defaultOptions = {
  trigger: {},
  when: [
    {
      terms: [
        {
          terms: [['','eq','','and']],
        },
      ],
      branchName: i18n.global.t('Terms.Terms.9093429-8'),
      key:defaultBranchId,
      executeAnyway: true,
      groupIndex: 1
    },
  ],
};

const TriggerTypeKeys = ['device', 'multi-device']

const handleTriggerError = (result: any, path: string[], column: string) => {
  let value = undefined;


  set(result, path, value)
}

export const useSceneStore = defineStore('scene', () => {
  const data = ref<FormModelType>({
    trigger: { type: ''},
    options: [defaultOptions],
    branches: defaultBranches,
    description: '',
    name: '',
    id: undefined
  })


  const { loading: validateLoading, run: validateRequest } = useRequest<any, ErrorItemType[]>(sceneValidate, { immediate: false });

  const productCache = {}

  const reset = () => {
    data.value = {
      trigger: { type: ''},
      options: cloneDeep(defaultOptions),
      branches: cloneDeep(defaultBranches),
      description: '',
      name: '',
      id: undefined
    }
  }

  const compatibleOldOptions = (options: any) => {
    if (isObject(options)) {
      return [options]
    } else {
      return options
    }
  }

  const getDetail = async (id: string) => {
    reset()
    const resp = await detail(id)
    if (resp.success) {
      const result = resp.result as any

      if (result.branches?.length) { // 有过滤条件和执行动作
        const validateResult = await validateRequest({
          branches: result.branches,
          trigger: result.trigger,
        }).catch(e => {
          console.log(e)
        })

        const actionItemExecutorMap = {
          device: 'device',
          notify: 'notify',
          'device-data': 'configuration',
          'collector': 'collector'
        }


        if (validateResult!.length) {

          const isMultiDevice = result.trigger.type === 'multi-device'
          const multiDeviceIndexMap = {}

          if (isMultiDevice) {
            result.trigger.multiDevice.triggers.forEach((item, index) => {
              multiDeviceIndexMap[item.options.sourceTrigger] = index
            })
          }

          validateResult!.forEach(item => {
            let _path = item.path
            const isTrigger = _path.startsWith("trigger")
            const isBranches = _path.startsWith("branches")

            let paths = _path.split('_').map(pathItem => {
              if (multiDeviceIndexMap.hasOwnProperty(pathItem)) {
                return multiDeviceIndexMap[pathItem]
              }

              if (isBranches && item.column === 'relation' && pathItem === 'selector') {
                return 'relation'
              }

              if (pathItem === 'selector') {
                return 'selectorValues'
              }

              return pathItem
            })

            if (_path.startsWith("trigger")) {
              const [a, b] = paths
              if (isMultiDevice) {
                result[a][b].triggers[paths[3]].changeData = true
              } else {
                result[a][b].changeData = true
              }
            }

            if (_path.startsWith("branches")) {
              const bIndex = paths[1]
              const groupIndex = paths[3]
              const actionIndex = paths[5]
              const item = result.branches[bIndex].then[groupIndex].actions[actionIndex]
              const executor = item.executor as string
              const key = actionItemExecutorMap[executor]
              item[key].changeData = true
            }
            set(result, paths, undefined)
          })
        }
      }

      const triggerType = result.triggerType
      let branches: any[] = result.branches

      if (!branches) {
        branches = cloneDeep(defaultBranches)
        if (!TriggerTypeKeys.includes(triggerType)) {
          branches[0].when.length = []
        }
      }

      branches = branches.map(item => {
        if (item?.then) {
          item?.then.forEach(thenItem => {
            if (thenItem.actions) {
              thenItem.actions.forEach(actionItem => {
                if (!actionItem.actionId) {
                  actionItem.actionId = randomNumber()
                }
              })
            }
          })
        }
        return item
      })

      if (result.trigger.type === 'multi-device' && !result.trigger.hasOwnProperty('multiDevice')) {
        result.trigger = {
          ...result.trigger,
          multiDevice: {
            triggers: [],
            relation: {
              objectType: undefined,
              relation: undefined,
              next: {}
            }
          }
        }
      }

      data.value = {
        ...result,
        trigger: result.trigger || {},
        branches: cloneDeep(assignmentKey(branches)),
        options: result.options && Object.keys(result.options)?.length ? result.options : cloneDeep(defaultOptions),
      }
    }
  }

  return {
    data,
    productCache,
    getDetail,
    reset
  }
})
