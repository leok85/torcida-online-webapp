type StripedProps = { height: number | string; width?: number | string; stripe?: number; radius?: number };

/** Placeholder listrado para imagens que virão da API. */
export function Striped({ height, width, stripe = 8, radius }: StripedProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        width,
        flex: width ? 'none' : undefined,
        borderRadius: radius,
        background: `repeating-linear-gradient(135deg, var(--soft) 0 ${stripe}px, var(--bg) ${stripe}px ${stripe * 2}px)`,
      }}
    />
  );
}
