import { defineStore } from 'pinia'
import type { FormModelType } from '../views/Scene/typings'
import { detail } from '../api/scene'
import {cloneDeep, isArray, isObject} from 'lodash-es'
import {randomNumber, randomString} from '@jetlinks-web/utils'
import i18n from '@/locales';

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

export const useSceneStore = defineStore('scene', () => {
  const data = ref<FormModelType>({
    trigger: { type: ''},
    options: [defaultOptions],
    branches: defaultBranches,
    description: '',
    name: '',
    id: undefined
  })

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
