type Props = {
  value: number;
  size?: number;
};

export function ScoreRing({ value, size = 160 }: Props) {
  const stroke = 6;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0"
      role="img"
      aria-label={`Score ${value} of 100`}
    >
      <title>Score {value} of 100</title>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--color-line)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--color-gold)"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
