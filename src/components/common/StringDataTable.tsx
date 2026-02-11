import classNames from "classnames";
import { Dictionary, difference, range } from "lodash";
import { ComponentPropsWithoutRef, useEffect, useState } from "react";
import { IconButton } from "./IconButton";
import { ArrowsOutSimple, Trash } from "@phosphor-icons/react";
import React from "react";
import { BaseModal } from "../modals/BaseModal";
import { AutogrowTextArea } from "./AutogrowTextArea";

type StringDataTableDataCellProps = Pick<
  ComponentPropsWithoutRef<"textarea">,
  | "disabled"
  | "value"
  | "onChange"
  | "onBlur"
  | "placeholder"
  | "className"
  | "readOnly"
> & { disableExpand?: boolean };

const StringDataTableDataCell = ({
  className,
  disableExpand,
  ...props
}: StringDataTableDataCellProps) => {
  const [isExpandedViewOpen, setIsExpandedViewOpen] = useState(false);

  return (
    <td>
      <div className="flex w-full items-center relative">
        <BaseModal
          show={isExpandedViewOpen}
          onClose={() => setIsExpandedViewOpen(false)}
        >
          <div className="p-container">
            <AutogrowTextArea
              {...props}
              className={classNames(
                "py-4 text-sm placeholder:text-secondary w-full border-1 border-neutral-200 rounded-lg resize-none px-3",
                className,
              )}
            />
          </div>
        </BaseModal>
        <textarea
          {...props}
          rows={1}
          className={classNames(
            "whitespace-nowrap py-4 text-sm placeholder:text-secondary w-full border-0 resize-none px-3 no-scrollbar group-last:rounded-bl-lg",
            className,
          )}
        />
        {props?.readOnly != true && !disableExpand && (
          <IconButton
            Icon={ArrowsOutSimple}
            size={20}
            tabIndex={-1}
            className="bg-neutral-100 rounded p-px absolute right-1 my-auto"
            onClick={() => setIsExpandedViewOpen(true)}
          />
        )}
      </div>
    </td>
  );
};

export type StringDataTableProps<T = string[]> =
  | {
      data: Dictionary<T>;
      label?: string;
      valuesPerRow: number;
      isEditable?: true;
      disableKeyEditing?: boolean;
      onChange?: (data: Dictionary<T>) => void;
    }
  | {
      data: Dictionary<T>;
      label?: string;
      valuesPerRow: number;
      isEditable?: false;
      // These props are not used when not in editable mode
      disableKeyEditing?: never;
      onChange?: never;
    };

const defaultKeySort = (a: string, b: string) => {
  // equal items sort equally
  if (a === b) return 0;
  // row with missing key (empty string key) always last
  if (a === "") return 1;
  if (b === "") return -1;
  // else use normal comparison (alphabetical)
  return a < b ? -1 : 1;
};

export function StringDataTable({
  data,
  onChange = () => {},
  label,
  valuesPerRow,
  isEditable: isEditableProp = false,
  disableKeyEditing = false,
}: StringDataTableProps) {
  // For displaying error messages under the table
  const [error, setError] = useState<string | null>(null);

  // Track the input states internally so we can update parent with changes only on blur
  const [inputs, setInputs] = useState<Dictionary<string>>({}); // Maps input id to input current value
  const [keyOrder, setKeyOrder] = useState<string[]>([]); // Used to track the order of keys to keep the rows from "jumping" around as editing occurs

  // Input IDs need to be unique and contain enough info to later figure out what value it corresponds to in `data`
  // "name-key" will be the ID of the input that corresponds to the "name" key in the data object
  // "email-value" will be the ID of the input that corresponds to the "email" value in the data object
  // The ID of the inputs in the create/add new row will be "newkey" and "newvalue" (no dash ensures no collisions if a key is named "new")
  const NEW_ROW_KEY_INPUT_ID = "newkey";
  const initializeInputs = () => {
    const newInputs: Dictionary<string> = {};
    Object.keys(data).forEach((key) => {
      newInputs[`${key}-key`] = key;
      const values = data[key];
      range(valuesPerRow).forEach((index) => {
        newInputs[`${key}-value-${index}`] = values?.[index] || "";
      });
    });
    newInputs[NEW_ROW_KEY_INPUT_ID] = "";
    setInputs(newInputs);
  };
  useEffect(() => {
    initializeInputs();
    computeNewKeyOrder();
  }, [JSON.stringify(data)]);

  // Figure out what the new key order should be
  const computeNewKeyOrder = () => {
    const newKeys = Object.keys(data);
    const addedKeys = difference(newKeys, keyOrder);
    const removedKeys = difference(keyOrder, newKeys);
    // If the keys have not changed (that probably just means only a value changed) we don't need to do anything
    if (addedKeys.length === 0 && removedKeys.length === 0) return;
    // If this is first render, we'll use the default key sort of ordering the keys alphabetically
    if (!keyOrder) {
      setKeyOrder(newKeys.sort(defaultKeySort));
      return;
    }
    // Otherwise, we want all the data to stay in the same row which means handling two cases...
    // 1. We have all the old keys plus one new key, which means a new key has been added:
    // It was previously in the last row, so we'll add it to the end of the keyOrder
    if (addedKeys.length === 1 && removedKeys.length === 0) {
      setKeyOrder([...keyOrder, addedKeys[0]]);
      return;
    }
    // 2. We are missing one of the old keys but also have a new key, which means a key has changed:
    // We'll find the index of the missing key and replace it with the new key
    if (addedKeys.length === 1 && removedKeys.length === 1) {
      const missingKey = removedKeys[0];
      const missingKeyIndex = keyOrder.indexOf(missingKey);
      const newKey = addedKeys[0];
      const newKeyOrder = [...keyOrder];
      newKeyOrder[missingKeyIndex] = newKey;
      setKeyOrder(newKeyOrder);
      return;
    }
    // If neither of these cases are true, it may just be that `data` has changed entirely (new template loaded, etc.)
    // So we'll fall back to the default key sort.
    setKeyOrder(newKeys.sort(defaultKeySort));
  };

  const onKeyChange = (key: string, newKey: string) => {
    const isAddRow = key === NEW_ROW_KEY_INPUT_ID;

    if (newKey === key) return;
    // If the key is already in the data, throw an error (to avoid overwriting data) and reset the inputs
    if (newKey in data) {
      setError("A variable with that name already exists.");
      initializeInputs();
      return;
    }
    // If the new key is empty...
    if (newKey === "") {
      // throw an error if this was not triggered by the add new row and reset the inputs
      if (!isAddRow) {
        setError("Variable name cannot be empty.");
        initializeInputs();
      }
      // If it was triggered by the add new row, no action is needed so we still return
      return;
    }

    const newData = { ...data };
    if (isAddRow) {
      // We are adding a new key. Default the value to an array of empty strings.
      newData[newKey] = range(valuesPerRow).map(() => "");
    } else {
      // We are renaming a key. Preserve the value and delete the old key.
      newData[newKey] = newData[key];
      delete newData[key];
    }
    onChange(newData);
  };

  const onValueChange = (key: string, valueIndex: number, value: string) => {
    if (value === data[key]?.[valueIndex]) return;
    const newValue = range(valuesPerRow).map(
      (index) => data[key]?.[index] || "",
    );
    newValue[valueIndex] = value;
    onChange({ ...data, [key]: newValue });
  };

  const onDelete = (key: string) => {
    const newData = { ...data };
    delete newData[key];
    onChange(newData);
  };

  const isKeysEditable = isEditableProp && !disableKeyEditing;
  const isValuesEditable = isEditableProp;

  return (
    <div className="flex flex-col gap-2 mb-2">
      {label && <label>{label}</label>}
      <div className="flow-root">
        <div className="mx-px my-px">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
              <table className="min-w-full divide-y divide-neutral-300">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-neutral-900 sm:pl-6">
                      Variable name
                    </th>
                    {range(valuesPerRow).map((valueIndex) => (
                      <th
                        key={valueIndex}
                        className="px-3 py-3.5 text-left text-sm font-semibold text-neutral-900"
                      >
                        {valuesPerRow > 1
                          ? `Value Set ${valueIndex + 1}`
                          : "Value"}
                      </th>
                    ))}
                    {isKeysEditable && <th />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {[...keyOrder, NEW_ROW_KEY_INPUT_ID].map((key, index) => {
                    const isAddRow = key === NEW_ROW_KEY_INPUT_ID;
                    if (isAddRow && !isKeysEditable) return null; // Don't render the add row if we can't edit

                    const keyInputId = isAddRow
                      ? NEW_ROW_KEY_INPUT_ID
                      : `${key}-key`;

                    return (
                      <tr
                        key={index}
                        className="divide-x divide-neutral-200 group"
                      >
                        <StringDataTableDataCell
                          placeholder={
                            isAddRow ? "Add new variable" : undefined
                          }
                          disabled={!isKeysEditable}
                          value={inputs[keyInputId]}
                          onChange={(e) => {
                            setInputs({
                              ...inputs,
                              [keyInputId]: e.target.value,
                            });
                            // Clear errors on edit
                            setError(null);
                          }}
                          onBlur={(e) => onKeyChange(key, e.target.value)}
                          className={
                            isAddRow ? "" : "empty:ring-red-500 empty:ring-1"
                          }
                          disableExpand
                        />
                        {range(valuesPerRow).map((valueIndex) => {
                          const valueInputId = `${key}-value-${valueIndex}`;
                          /* We don't want users adding values first, but we want them to be able
                           to tab into the value input after adding a key so we have this "dummy"
                           box that becomes un-disabled after user starts typing in new key input */
                          return isAddRow ? (
                            <StringDataTableDataCell
                              key={valueIndex}
                              value=""
                              readOnly
                              disabled={inputs[NEW_ROW_KEY_INPUT_ID] === ""}
                            />
                          ) : (
                            <StringDataTableDataCell
                              key={valueIndex}
                              placeholder={
                                isValuesEditable ? "Set value" : undefined
                              }
                              disabled={!isValuesEditable}
                              value={inputs[valueInputId]}
                              onChange={(e) => {
                                setInputs({
                                  ...inputs,
                                  [valueInputId]: e.target.value,
                                });
                                // Clear errors on edit
                                setError(null);
                              }}
                              onBlur={(e) =>
                                onValueChange(key, valueIndex, e.target.value)
                              }
                            />
                          );
                        })}
                        {isKeysEditable && (
                          <td className="w-0 pl-3 pr-4 pt-1.5">
                            {!isAddRow && (
                              <IconButton
                                onClick={() => onDelete(key)}
                                size={20}
                                tabIndex={-1}
                                Icon={Trash}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {error && <p className="error">⛔️ {error}</p>}
    </div>
  );
}
