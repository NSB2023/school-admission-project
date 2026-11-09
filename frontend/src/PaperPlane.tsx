export default function PaperPlane({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className={`paper-plane ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 11.5 26 2 18.2 26 12 17Z" fill="#ff9100" />
      <path d="M2 11.5 12 17 26 2Z" fill="#ffb047" />
      <path d="m12 17 6.2 9L16 13 26 2Z" fill="#e17f00" />
      <path d="M12 17 26 2" stroke="#e4e8ed" strokeWidth=".8" />
    </svg>
  );
}
