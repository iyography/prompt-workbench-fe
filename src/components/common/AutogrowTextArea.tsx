import { ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import { marked } from "marked";

interface AutogrowTextAreaProps extends Omit<ComponentPropsWithoutRef<"textarea">, "dangerouslySetInnerHTML"> {
  renderMarkdown?: boolean;
}

export const AutogrowTextArea = (props: AutogrowTextAreaProps) => {
  const { style, renderMarkdown = false, value, className, ...restProps } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);
  const [isEditing, setIsEditing] = useState(!renderMarkdown);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      setHeight(textareaRef.current.scrollHeight);
    } else if (!isEditing && divRef.current) {
      setHeight(divRef.current.scrollHeight);
    }
  }, [isEditing, value, textareaRef?.current?.scrollHeight, divRef?.current?.scrollHeight]);

  // When height is set to 0 (b/c scrollHeight changed or editor was blurred), we cause the height to grow just to min needed
  useEffect(() => {
    if (height === 0) {
      if (isEditing && textareaRef.current) {
        setHeight(textareaRef.current.scrollHeight);
      } else if (!isEditing && divRef.current) {
        setHeight(divRef.current.scrollHeight);
      }
    }
  }, [height, isEditing]);

  if (renderMarkdown && !isEditing) {
    return (
      <div
        ref={divRef}
        className={className}
        style={{
          ...style,
          height: height || 'auto',
          cursor: 'pointer',
        }}
        onClick={() => setIsEditing(true)}
        dangerouslySetInnerHTML={{
          __html: value ? marked.parse(value.toString(), { async: false }) as string : ''
        }}
      />
    );
  }

  return (
    <textarea
      ref={textareaRef}
      style={{
        ...style,
        height,
      }}
      value={value}
      className={className}
      onBlur={() => {
        setHeight(0);
        if (renderMarkdown) {
          setIsEditing(false);
        }
      }}
      {...restProps}
    />
  );
};