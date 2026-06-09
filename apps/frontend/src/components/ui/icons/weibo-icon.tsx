import React, { FC, SVGProps } from 'react';

export const WeiboIcon: FC<SVGProps<SVGSVGElement> & { size?: number }> = ({
  size = 24,
  className,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    {...props}
  >
    <path d="M20.194 14.197c0 3.86-4.27 7.003-9.194 7.003-5.09 0-8.99-3.143-8.99-7.003 0-4.083 3.9-7.365 8.99-7.365 4.924 0 9.194 3.282 9.194 7.365z" />
    <path
      d="M17.5 9.5c-.4-.3-.8-.5-1.2-.5-.3 0-.5.1-.7.3-.2.2-.3.5-.3.8 0 .3.1.5.3.7.2.2.5.3.8.3.4 0 .8-.2 1.2-.5.1 0 .1-.1.1-.3 0-.2 0-.5-.2-.8zM7.3 10.5c-.3 0-.5.1-.7.3-.2.2-.3.5-.3.8 0 .3.1.5.3.7.2.2.5.3.8.3.4 0 .8-.2 1.2-.5.1 0 .1-.1.1-.3 0-.2 0-.5-.2-.8-.4-.3-.8-.5-1.2-.5z"
      fill="#fff"
    />
    <path
      d="M12 14c-1.5 0-2.7 1.2-2.7 2.7 0 .3.2.5.5.5h4.4c.3 0 .5-.2.5-.5 0-1.5-1.2-2.7-2.7-2.7z"
      fill="#fff"
    />
  </svg>
);
