import { Listbox, Popover, Transition } from "@headlessui/react";
import { CaretUpDown } from "@phosphor-icons/react";
import classNames from "classnames";
import { Fragment, ReactNode } from "react";

export type DropdownOptionType<T> = {
  id: T;
  label: ReactNode;
  visible?: boolean;
  tooltip?: ReactNode;
  containerProps?: Partial<Parameters<typeof Listbox.Option>[0]>;
};

export function Dropdown<T extends string | number>({
  options,
  selectedOption,
  setSelectedOption,
  placeholderText = "Select an option...",
  label,
  title,
  disabled = false,
  className,
}: {
  options: DropdownOptionType<T>[];
  selectedOption: DropdownOptionType<T> | null | undefined;
  setSelectedOption: (option: DropdownOptionType<T>) => void;
  placeholderText?: string;
  label?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={classNames("flex flex-col gap-2", className)}>
      {label && <label>{label}</label>}
      <Popover className="relative">
        <Listbox
          value={selectedOption ?? undefined}
          onChange={setSelectedOption}
          disabled={disabled}
        >
          <Listbox.Button
            className={classNames(
              "btn-secondary flex gap-2 items-center w-full",
              selectedOption ? "" : "font-normal subtitle",
            )}
            title={title}
          >
            {selectedOption ? selectedOption.label : placeholderText}
            <CaretUpDown className="ml-auto h-4 w-4" />
          </Listbox.Button>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Popover.Panel className="absolute z-10 mt-4 left-0">
              <Listbox.Options
                as="div"
                className="divide-y bg-white shadow ring-1 ring-black ring-opacity-5 rounded-lg mb-14 w-48"
              >
                {options.map((option) => (
                  <div key={option.id} className="relative group">
                    <Listbox.Option
                      {...{ ...option.containerProps }}
                      value={option}
                      className={
                        "p-4 cursor-pointer" +
                        " " +
                        (option.containerProps?.className || "")
                      }
                    >
                      {option.label}
                    </Listbox.Option>
                    {option.tooltip && (
                      <div
                        className="absolute invisible group-hover:visible shadow-md bg-gray-600 text-white  text-sm rounded-md p-2 z-20 
                        max-w-xs break-words opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        style={{
                          left: "100%",
                          top: "50%",
                          transform: "translateY(-50%)",
                          marginLeft: "4px",
                          maxWidth: "150px",
                          width: "max-content",
                        }}
                      >
                        {option.tooltip}
                      </div>
                    )}
                  </div>
                ))}
              </Listbox.Options>
            </Popover.Panel>
          </Transition>
        </Listbox>
      </Popover>
    </div>
  );
}
