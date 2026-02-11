import classNames from "classnames";
import { DetailedHTMLProps, TextareaHTMLAttributes, forwardRef } from "react";

interface TextAreaProps
  extends DetailedHTMLProps<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    HTMLTextAreaElement
  > {
  label: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, className, ...props }, ref) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={props.id}>{label}</label>
      <textarea
        ref={ref}
        rows={4}
        draggable={false}
        {...props}
        className={classNames(
          "block w-full rounded-md border-0 py-1.5 text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6",
          className,
        )}
      />
    </div>
  )
);

TextArea.displayName = "TextArea";
