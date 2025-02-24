import { getTargetTypes } from '../api/configuration';

export const useAlarmConfigType = () => {
  type Options = { label: string; value: string };
  const supports = ref<Options[]>([]);
  getTargetTypes().then((res) => {
    supports.value = res.result.map((item: any) => {
      return {
        label: item.name,
        value: item.id,
      };
    });
  });
  return {
    supports,
  };
}