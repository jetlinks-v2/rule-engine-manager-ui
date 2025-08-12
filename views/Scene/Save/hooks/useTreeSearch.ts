
type OptionsType = {
  labelName: string
  valueName: string
  onEnd?: (selectedKeys: string[]) => void
}

const defaultOptions = {
  labelName: 'name',
  valueName: 'value',
}

export const useTreeSearch = (treeData: Ref<any[]>, options: OptionsType = defaultOptions) => {
  const searchValue = ref()
  const { valueName, labelName } = Object.assign(defaultOptions, options)
  const treeOpenKeysSet = new Set<string>()

  const add = (value: string) => {
    treeOpenKeysSet.add(value);
  }

  const filterTree = (data: any[]) => {
    return data.filter((option) => {
      const name = option[labelName]

      if (name.includes(searchValue.value) || option.multiTag) {
        add(option[valueName])
        return true
      } else if (option.children?.length){
        option.children = filterTree(option.children)
        const hasChildren = !!option.children.length
        if (hasChildren) {
          add(option[valueName]);
        }
        return hasChildren
      }
      return false
    });
  }

  const searchOptions = computed(() => {
    treeOpenKeysSet.clear()
    if (searchValue.value) {
      const filterTreeData = filterTree(JSON.parse(JSON.stringify(treeData.value)));
      options.onEnd?.([...treeOpenKeysSet.values()])
      return filterTreeData
    }
    return treeData.value;
  })

  return {
    searchOptions,
    searchValue
  }
}
