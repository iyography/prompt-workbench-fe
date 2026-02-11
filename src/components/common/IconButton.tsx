import { Icon as PhosphorIconType } from "@phosphor-icons/react";
import classNames from "classnames";

type IconButton = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  Icon: PhosphorIconType;
  size?: number;
  variant?: 'default' | 'brand' | 'accent';
};

export const IconButton = ({ className, size = 20, Icon, variant = 'default', ...props }: IconButton) => {
  const variantClasses = {
    default: 'text-narrative-charcoal hover:text-narrative-green',
    brand: 'text-narrative-green hover:text-narrative-mid-green',
    accent: 'text-narrative-purple hover:text-purple-600'
  };
  
  return (
    <button 
      className={classNames(
        "h-fit w-fit p-1 rounded transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-narrative-green", 
        variantClasses[variant],
        className
      )} 
      {...props}
    >
      <Icon size={size} aria-hidden="true" />
    </button>
  );
};
