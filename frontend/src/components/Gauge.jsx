export default function Gauge({ value = 0, level = "alert", available = true }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 78;
  const c = 2 * Math.PI * r;
  const dash = available ? (v / 100) * c : 0;
  const color =
    v < 25 ? "#7cbc8a" : v < 50 ? "#d4b37a" : v < 75 ? "#e08a6a" : "#c45c4a";

  return (
    <svg viewBox="0 0 200 200" width="210" height="210">
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(212,179,122,0.14)" strokeWidth="12" />
      <circle
        cx="100"
        cy="100"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 100 100)"
      />
      <text x="100" y="96" textAnchor="middle" fill="#f3eee4" fontFamily="Fraunces, serif" fontSize="48">
        {available ? Math.round(v) : "—"}
      </text>
      <text x="100" y="122" textAnchor="middle" fill="#d4b37a" fontSize="11" letterSpacing="3">
        {available ? level.toUpperCase() : "UNAVAILABLE"}
      </text>
    </svg>
  );
}
