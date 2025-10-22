import { getTargetTypes } from '../api/configuration';
import {useMenuStore} from "@/store";

export const useAlarmConfigType = (filter: string[] = []) => {
  type Options = { label: string; value: string };
  const supports = ref<Options[]>([]);

  const menuStore = useMenuStore();

  getTargetTypes().then((res) => {
    const _filter = [...filter]
    if (!menuStore.hasMenu('DataCollect/Collector')) {
      _filter.push('collector')
    }
    supports.value = res.result.map((item: any) => {
      return {
        label: item.name,
        value: item.id,
      };
    }).filter((item: any) => {
      return !_filter.includes(item.value)
    });
  });
  return {
    supports,
  };
}
