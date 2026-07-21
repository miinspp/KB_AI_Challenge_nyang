import { fmtMan } from '../../shared/format';

/**
 * 동종 업종 점포당 월매출 실측 분포를 곡선으로 그리고 내 위치를 표시.
 * 가로축 = 백분위(하위→상위), 세로축 = 점포당 월매출(상위 5% 극단값이 축을 누르지 않도록 P95까지).
 * 내 위치의 백분위는 백엔드가 계산한 salesPercentile(권위값)을 사용.
 */
export default function DistributionChart({ quantiles, myValue, salesPercentile }) {
  if (!quantiles || quantiles.length < 101) return null;
  const W = 320, H = 132, PAD = 10, BOT = 112;
  const capV = quantiles[95] || quantiles[100];
  const x = (i) => PAD + (i / 100) * (W - 2 * PAD);
  const y = (v) => BOT - (Math.min(v, capV) / capV) * (BOT - PAD);

  const line = quantiles.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)},${BOT} L${line.replace(/ /g, ' L')} L${x(100).toFixed(1)},${BOT} Z`;

  const p = Math.max(0, Math.min(100, salesPercentile ?? 0));
  const mx = x(p);
  const my = y(quantiles[Math.round(p)]);
  const medX = x(50), medY = y(quantiles[50]);
  const labelX = Math.min(W - 66, Math.max(PAD, mx - 31));

  return (
    <div className="card">
      <p style={{ fontSize: 13.5, fontWeight: 800, color: '#2B2825', marginBottom: 4 }}>업종 내 우리 가게 위치</p>
      <p style={{ fontSize: 11, color: '#B9B0A4', marginBottom: 8 }}>
        같은 업종 점포들의 월매출 분포 · 오른쪽일수록 상위
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD873" stopOpacity=".8" />
            <stop offset="100%" stopColor="#FFF3D2" stopOpacity=".25" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#distFill)" />
        <polyline points={line} fill="none" stroke="#E8B93E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* 업종 중위(P50) */}
        <line x1={medX} y1={medY} x2={medX} y2={BOT} stroke="#C4BAAD" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x={medX} y={126} fill="#B9B0A4" fontSize="9.5" textAnchor="middle">중위</text>

        {/* 내 위치 */}
        <line x1={mx} y1={my} x2={mx} y2={BOT} stroke="#7FA95E" strokeWidth="2" strokeDasharray="4 4" />
        <circle cx={mx} cy={my} r="6" fill="#8DBB6C" stroke="#fff" strokeWidth="2.5" />
        <rect x={labelX} y={my - 26} rx="8" width="62" height="19" fill="#3F5230" />
        <text x={labelX + 31} y={my - 13} fill="#fff" fontSize="10.5" fontWeight="800" textAnchor="middle">우리 가게</text>

        <text x={PAD} y={126} fill="#C4BAAD" fontSize="9.5">하위</text>
        <text x={W - PAD} y={126} fill="#C4BAAD" fontSize="9.5" textAnchor="end">상위</text>
      </svg>
      <p style={{ fontSize: 10.5, color: '#C4BAAD', textAlign: 'center', marginTop: 2 }}>
        내 매출 {fmtMan(myValue)} · 세로축은 상위 5%까지 표시
      </p>
    </div>
  );
}
