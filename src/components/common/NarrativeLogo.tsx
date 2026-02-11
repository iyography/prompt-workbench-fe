import React from 'react';

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
    sm: 'h-6',
    md: 'h-8', 
    lg: 'h-12'
  };

  if (variant === 'icon') {
    return (
      <svg 
        className={`${sizeClasses[size]} w-auto text-narrative-green ${className}`} 
        viewBox="0 0 32 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M8 8V32L16 24V16L24 8V32" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg 
      className={`${sizeClasses[size]} w-auto text-narrative-green ${className}`} 
      viewBox="0 0 180 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path 
        d="M8 8V32L16 24V16L24 8V32" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <text 
        x="40" 
        y="26" 
        className="fill-current font-sans font-normal" 
        fontSize="18" 
        letterSpacing="-0.02em"
      >
        Narrative
      </text>
    </svg>
  );
};

export default NarrativeLogo;