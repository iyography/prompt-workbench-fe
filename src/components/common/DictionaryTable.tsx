import { Dictionary } from "lodash";
import { StringDataTable, StringDataTableProps } from "./StringDataTable";

export type DictionaryTableProps = Omit<
  StringDataTableProps<string>,
  "valuesPerRow"
>;

// Wrapper for StringDataTable that supports displaying and editing a Dictionary<string> instead of a Dictionary<string[]>
export function DictionaryTable({
  data,
  onChange,
  isEditable,
  ...props
}: DictionaryTableProps) {
  const dataAsDictOfStringArrs = Object.entries(data).reduce<
    Dictionary<string[]>
  >((acc, [key, value]) => ({ ...acc, [key]: [value] }), {});
  const onChangeDictOfStringArrs =
    onChange &&
    ((data: Dictionary<string[]>) => {
      const dataAsDictOfStrings = Object.entries(data).reduce<
        Dictionary<string>
      >((acc, [key, [value]]) => ({ ...acc, [key]: value }), {});
      onChange(dataAsDictOfStrings);
    });

  return isEditable ? (
    <StringDataTable
      valuesPerRow={1}
      isEditable
      data={dataAsDictOfStringArrs}
      onChange={onChangeDictOfStringArrs}
      {...props}
    />
  ) : (
    <StringDataTable
      valuesPerRow={1}
      data={dataAsDictOfStringArrs}
      {...props}
    />
  );
}
