import { useState } from "react";
import { Combobox } from "@headlessui/react";
import classNames from "classnames";
import { BaseModal } from "./BaseModal";
import { Timer, Warning, Icon, FileDashed } from "@phosphor-icons/react";

const EmptyState = ({ Icon, message }: { Icon: Icon; message: string }) => (
  <div className="px-4 py-14 text-center sm:px-14">
    <Icon size={24} className="mx-auto text-neutral-500" aria-hidden="true" />
    <p className="mt-4 text-sm subtitle">{message}</p>
  </div>
);

export type SearchSelectModalOption = {
  id: string | number;
  name: string;
};

export function SearchSelectModal({
  open,
  onClose,
  options,
  onSelect,
  isLoading,
  errorMessage,
}: {
  open: boolean;
  onClose: () => void;
  options: SearchSelectModalOption[];
  onSelect: (option: SearchSelectModalOption) => void;
  isLoading?: boolean;
  errorMessage?: string;
}) {
  const [query, setQuery] = useState("");

  const filteredData =
    query === ""
      ? options
      : options.filter((entry) => {
          return entry.name.toLowerCase().includes(query.toLowerCase());
        });

  return (
    <BaseModal show={open} onClose={onClose} afterLeave={() => setQuery("")}>
      {isLoading ? (
        <EmptyState Icon={Timer} message="Loading" />
      ) : errorMessage ? (
        <EmptyState Icon={Warning} message={errorMessage} />
      ) : (
        <Combobox onChange={(option) => {
          if (option && typeof option === 'object' && 'id' in option && 'name' in option) {
            onSelect(option as SearchSelectModalOption);
          }
        }}>
          <Combobox.Input
            className="w-full rounded-md border-0 bg-neutral-100 px-4 py-2.5 text-neutral-900 focus:ring-0 sm:text-sm"
            placeholder="Search..."
            onChange={(event) => setQuery(event.target.value)}
          />

          {filteredData.length > 0 && (
            <Combobox.Options
              as={"div"}
              static
              className="-mb-2 max-h-72 scroll-py-2 overflow-y-auto py-2 text-sm text-neutral-800"
            >
              {filteredData.map((entry) => (
                <Combobox.Option
                  as={"div"}
                  key={entry.id}
                  value={entry}
                  className={({ active }) =>
                    classNames(
                      "cursor-default select-none rounded-md px-4 py-2",
                      active && "bg-indigo-600 text-white",
                    )
                  }
                >
                  {entry.name}
                </Combobox.Option>
              ))}
            </Combobox.Options>
          )}

          {query !== "" && filteredData.length === 0 && (
            <EmptyState
              Icon={FileDashed}
              message="No items found with that name"
            />
          )}
        </Combobox>
      )}
    </BaseModal>
  );
}
