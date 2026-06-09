import React, { FC, SVGProps } from 'react';

export const XiaohongshuIcon: FC<
  SVGProps<SVGSVGElement> & { size?: number }
> = ({ size = 24, className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    {...props}
  >
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <path
      d="M7 7h10c.55 0 1 .45 1 1v8c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1z"
      fill="#fff"
    />
    <circle cx="9.5" cy="10.5" r="1.5" />
    <path d="M8 14l3-3 2 2 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);
