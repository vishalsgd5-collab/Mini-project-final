export default function Wave({ values = [], color = "#8fb89a" }) {
  const w = 520;
  const h = 92;
  if (!values.length) {
    return <div className="wave" />;
  }
  const min = Math.min(...values, 0.12);
  const max = Math.max(...values, 0.36);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - ((v - min) / (max - min + 1e-6)) * (h - 16) - 8;
    return `${x},${y}`;
  });
  return (
    <div className="wave">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="92" preserveAspectRatio="none">
        <polyline fill="none" stroke={color} strokeWidth="2" points={pts.join(" ")} />
      </svg>
    </div>
  );
}
