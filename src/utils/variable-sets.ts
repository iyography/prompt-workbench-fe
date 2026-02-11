import { Dictionary } from "lodash";

export const getSet = (sets: Dictionary<string[]>, index: number) =>
  Object.entries(sets).reduce<Dictionary<string>>((acc, [key, value]) => {
    return { ...acc, [key]: value[index] };
  }, {});
