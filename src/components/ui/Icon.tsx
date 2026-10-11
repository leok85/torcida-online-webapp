import type { CSSProperties } from 'react';

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  filled?: boolean;
  className?: string;
};

export function Icon({ name, size, color, filled, className }: IconProps) {
  const style: CSSProperties = { fontSize: size, color };
  if (filled) style.fontVariationSettings = "'FILL' 1";
  return (
    <span className={className ? `ms ${className}` : 'ms'} style={style} aria-hidden="true">
      {name}
    </span>
  );
}
