import {cloneDeep, isBoolean, isEqual} from 'lodash-es'

export type DropdownButtonOptions = {
  label: string;
  value: string;
  children?: DropdownButtonOptions[];
  [key: string]: any;
};

export const getComponent = (type: string): string => {
  switch (type) {
    case 'int':
    case 'long':
    case 'float':
    case 'double':
      return type
    case 'metric':
    case 'enum':
    case 'boolean':
      return 'menu'
    case 'date':
      return 'date'
    case 'tree':
      return 'tree'
    case 'file':
      return 'file'
    case 'geoPoint':
      return 'geoPoint'
    default:
      return 'input'
  }
}

export const getOption = (data: any[], value?: string | number | boolean, key: string = 'name'): DropdownButtonOptions | any => {
  if (value === undefined && value === null) return;

  const targetValue = isBoolean(value) ? String(value) : value;

  const findOption = (items: any[]): any | undefined => {
    for (const item of items) {
      if (isEqual(item[key], targetValue)) {
        return item
      }
      if (item.children?.length) {
        const result = findOption(item.children)
        if (result) return result
      }
    }
    return undefined
  }

  return findOption(data)
}
