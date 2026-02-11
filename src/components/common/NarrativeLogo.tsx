import React from 'react';
import Image from 'next/image';

interface LogoProps {
  className?: string;
  variant?: 'main' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

export const NarrativeLogo: React.FC<LogoProps> = ({ 
  className = '', 
  variant = 'main', 
  size = 'md' 
}) => {
  const sizeClasses = {
    sm: variant === 'icon' ? 'h-6 w-6' : 'h-6 w-auto',
    md: variant === 'icon' ? 'h-8 w-8' : 'h-8 w-auto', 
    lg: variant === 'icon' ? 'h-12 w-12' : 'h-12 w-auto'
  };

  if (variant === 'icon') {
    return (
      <Image
        src="/favico.svg"
        alt="Narrative"
        width={32}
        height={32}
        className={`${sizeClasses[size]} ${className}`}
      />
    );
  }

  return (
    <Image
      src="/logo.svg"
      alt="Narrative"
      width={180}
      height={40}
      className={`${sizeClasses[size]} ${className}`}
    />
  );
};

export default NarrativeLogo;