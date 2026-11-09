function PaperCloud({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 260 100"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M17 78C1 73 4 51 24 47C19 25 44 12 62 24C70-2 111 0 120 24C143 7 170 22 172 42C194 32 215 43 214 57C239 49 261 66 248 79C213 90 51 92 17 78Z"
        fill="#9db1c2"
        transform="translate(2 6)"
      />
      <path
        d="M17 78C1 73 4 51 24 47C19 25 44 12 62 24C70-2 111 0 120 24C143 7 170 22 172 42C194 32 215 43 214 57C239 49 261 66 248 79C213 90 51 92 17 78Z"
        fill="#e4e8ed"
      />
      <path
        d="M28 64C55 67 66 60 91 66C125 72 145 63 179 67C204 70 219 63 234 67"
        stroke="#d0d9e1"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function SchoolIllustration({
  period,
}: {
  period: "morning" | "day";
}) {
  return (
    <figure
      className={`paper-scene ${period}`}
      aria-label={`${period === "morning" ? "Morning" : "Day"} at school`}
    >
      <div className="scene-orbit" aria-hidden="true" />
      <div className="paper-sun" role="img" aria-label="Sun" />
      <div className="paper-clouds" role="img" aria-label="Clouds">
        <PaperCloud className="cloud cloud-right" />
        <PaperCloud className="cloud cloud-left" />
      </div>
      <img
        className="paper-school"
        src="/images/paper-school.png"
        alt="Paper-cut school building"
        width="1536"
        height="1024"
        fetchPriority="high"
      />
      <div className="scene-stamp" aria-hidden="true">
        <span>ROOM TO LEARN</span>
        <span className="stamp-star">✳</span>
        <span>SPACE TO GROW</span>
      </div>
      <figcaption>
        <span className="caption-line" />
        {period === "morning"
          ? "New mornings. Endless possibilities."
          : "Bright days. Bigger dreams."}
      </figcaption>
    </figure>
  );
}
