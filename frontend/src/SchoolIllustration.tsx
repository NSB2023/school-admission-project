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
      <div className="paper-sun" role="img" aria-label="Sun" />
      <div className="paper-clouds" role="img" aria-label="Clouds">
        <PaperCloud className="cloud cloud-right" />
        <PaperCloud className="cloud cloud-left" />
      </div>
      <div className="paper-school">
        <img
          src="/images/paper-school.png"
          alt="Paper-cut school building"
          width="1536"
          height="1024"
          fetchPriority="high"
        />
        <svg
          className="facade-details"
          viewBox="0 0 1536 1024"
          role="group"
          aria-label="School facade details"
        >
          <text
            x="768"
            y="398"
            textAnchor="middle"
            fill="#0b3a63"
            fontFamily="Georgia, serif"
            fontSize="45"
            fontWeight="600"
            letterSpacing="6"
          >
            School
          </text>
          <g role="img" aria-label="School clock">
            <circle
              cx="768"
              cy="267"
              r="45"
              fill="#e4e8ed"
              stroke="#0b3a63"
              strokeWidth="2"
            />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M768 228v6"
                stroke="#0b3a63"
                strokeWidth="3"
                transform={`rotate(${i * 30} 768 267)`}
              />
            ))}
            <path
              d="m744 248 24 19 25-24"
              fill="none"
              stroke="#0b3a63"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="768" cy="267" r="4" fill="#0b3a63" />
          </g>
        </svg>
      </div>
      <svg
        className="graduation-badge"
        viewBox="0 0 160 140"
        role="img"
        aria-label="Blue graduation cap with orange ribbon"
      >
        <path
          d="M38 61v35q42 29 84 0V61"
          fill="#0b3a63"
          stroke="#e4e8ed"
          strokeWidth="3"
        />
        <path
          d="m10 49 70-29 70 29-70 29Z"
          fill="#0b3a63"
          stroke="#e4e8ed"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="m80 49 48 8v37"
          fill="none"
          stroke="#ff9100"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="80" cy="49" r="4" fill="#ff9100" />
        <path d="m123 91-3 29 8-5 8 5-4-29Z" fill="#ff9100" />
        <path d="M125 96v14" stroke="#ffc36c" strokeWidth="2" />
      </svg>
      <figcaption>
        {period === "morning"
          ? "New mornings. Endless possibilities."
          : "Bright days. Bigger dreams."}
      </figcaption>
    </figure>
  );
}
