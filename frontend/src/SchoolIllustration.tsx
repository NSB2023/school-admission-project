export default function SchoolIllustration() {
  return (
    <svg
      viewBox="0 0 460 260"
      fill="none"
      aria-hidden="true"
      className="school-illustration"
    >
      <circle cx="255" cy="131" r="109" fill="#E5EBFF" />
      <circle cx="370" cy="52" r="23" fill="#F5AC72" />
      <path
        d="M113 219H411M95 231H425"
        stroke="#BBC9EF"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M164 215V117H354V215"
        fill="#FDFEFF"
        stroke="#A8BAEB"
        strokeWidth="2"
      />
      <path d="M152 117L260 62L366 117H152Z" fill="#214BD8" />
      <path
        d="M240 215V177C240 165 248 157 260 157C272 157 280 165 280 177V215"
        fill="#214BD8"
      />
      <path
        d="M251 215V178C251 172 254 169 260 169C266 169 269 172 269 178V215"
        fill="#1636A6"
      />
      <path d="M260 170V214" stroke="#6684E7" strokeWidth="2" />
      <path d="M227 217H293L302 231H218L227 217Z" fill="#BCCBF3" />
      <path
        d="M248 232C231 240 244 248 218 260H300C312 248 282 240 276 232"
        fill="#F6C49F"
      />
      {[183, 212, 294, 323].map((x) => (
        <g key={x}>
          <rect
            x={x}
            y="135"
            width="16"
            height="24"
            rx="2"
            fill="#DCE5FF"
            stroke="#9AAEE7"
          />
          <path
            d={`M${x + 8} 136V158M${x + 1} 147H${x + 15}`}
            stroke="#9AAEE7"
          />
        </g>
      ))}
      {[183, 212, 294, 323].map((x) => (
        <rect
          key={x}
          x={x}
          y="177"
          width="16"
          height="22"
          rx="2"
          fill="#DCE5FF"
          stroke="#9AAEE7"
        />
      ))}
      <circle
        cx="260"
        cy="111"
        r="17"
        fill="#F7F9FF"
        stroke="#90A7E9"
        strokeWidth="2"
      />
      <path
        d="M260 100V111L267 116"
        stroke="#214BD8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M260 63V24" stroke="#214BD8" strokeWidth="3" />
      <path d="M261 25H295L286 35L295 45H261" fill="#EF8F49" />
      <path d="M128 215V168M388 215V177" stroke="#7993D9" strokeWidth="4" />
      <path
        d="M129 126C108 147 108 177 129 184C150 177 150 147 129 126Z"
        fill="#8EA6E7"
      />
      <path
        d="M388 143C370 160 370 183 388 188C406 183 406 160 388 143Z"
        fill="#A7B9ED"
      />
      <path
        d="M117 215H140M377 215H399"
        stroke="#7993D9"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M103 78H115M109 72V84M391 108H401M396 103V113"
        stroke="#E69760"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M157 47L164 44L171 47M331 76L338 73L345 76"
        stroke="#92A7DE"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
