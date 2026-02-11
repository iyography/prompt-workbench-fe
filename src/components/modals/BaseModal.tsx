import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";

export type BaseModalProps = {
  show: boolean;
  onClose: () => void;
  children: React.ReactNode;
  beforeEnter?: () => void;
  afterLeave?: () => void;
};

// FIXME: Would be great to automatically allow all valid props of Transition.Root but ComponentProps is not working with Headless UI
export const BaseModal = ({ onClose, children, ...props }: BaseModalProps) => (
  <Transition.Root as={Fragment} appear {...props}>
    <Dialog as="div" className="relative z-10" onClose={onClose}>
      <Transition.Child
        as={Fragment}
        enter="ease-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-neutral-500 bg-opacity-25 transition-opacity" />
      </Transition.Child>

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto p-4 sm:p-6 md:p-20">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <Dialog.Panel className="mx-auto max-w-xl transform rounded-xl bg-white p-2 shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
            {children}
          </Dialog.Panel>
        </Transition.Child>
      </div>
    </Dialog>
  </Transition.Root>
);
