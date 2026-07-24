import { useMemo, useState } from 'react';
import Couple from './Couple';
import { buildSimulationDetail, SIM_VIEWS } from './sim';

export default function SimulatorScreen({ equipped, options, toggle, simRows, simulation, loading, error }) {
  const [view, setView] = useState('cash');
  const detail = useMemo(() => buildSimulationDetail(simulation, equipped), [simulation, equipped]);
  const current = detail.views[view] || detail.views.cash;
  const riskTone = equipped.length === 0 ? 'base' : detail.riskAfter <= detail.riskBefore ? 'good' : 'bad';
  const nice = equipped.length === 0 || detail.riskAfter <= detail.riskBefore;

  return (
    <div className="scr" style={{ padding: '0 0 130px', gap: 0 }}>
      <div style={{ padding: '2px 22px 12px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: '#2B2825', letterSpacing: 0 }}>상품을 장착해 보세요</h2>
        <p style={{ marginTop: 4, fontSize: 12.5, color: '#8A8178' }}>추천 상품을 고르면 월별 현금흐름과 안전자금 위험이 함께 바뀝니다.</p>
      </div>

      <div style={{
        margin: '0 22px', position: 'relative', height: 230, overflow: 'hidden',
        background: 'linear-gradient(180deg,#FFF3D2 0%,#FFF9EF 68%,#E9F2DB 86%,#D8E8C2 100%)',
        border: '1.5px solid #F0E7D6', borderRadius: 22,
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: 'linear-gradient(180deg,#B9D69A,#9DC47B)' }} />
        {/* Landscape is the background; Couple only renders transparent character layers. */}
        <Couple nice={nice} />
        <div style={{
          position: 'absolute', right: 16, top: 14, bottom: 14, width: 150,
          background: 'rgba(255,255,255,.76)', border: '1.5px solid #F0E7D6', borderRadius: 16,
          padding: 10, display: 'flex', flexDirection: 'column', gap: 8, backdropFilter: 'blur(3px)',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#8A8178', letterSpacing: 0 }}>장착 상품 {equipped.length}개</span>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {equipped.length > 0 ? equipped.map((item) => (
              <button key={item.key} onClick={() => toggle(item)} title={`${item.short} 해제`} style={{
                flex: '0 0 48px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${item.iconColor}`, background: item.iconBg,
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', textAlign: 'left',
              }}>
                <span className="icon-badge" style={{ width: 24, height: 24, borderRadius: 8, fontSize: 12, background: '#fff', color: item.iconColor }}>{item.icon}</span>
                <span style={{ flex: 1, fontSize: 10.5, fontWeight: 800, lineHeight: 1.3, color: '#2B2825' }}>{item.short}</span>
              </button>
            )) : (
              <div style={{ flex: 1, borderRadius: 12, border: '1.5px dashed #E4D8C2', background: 'rgba(255,255,255,.5)', display: 'grid', placeItems: 'center', padding: 10, textAlign: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#C4BAAD', lineHeight: 1.45 }}>아래 상품을<br />선택해 주세요</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <section style={{ margin: '12px 22px 0' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#8A8178', margin: '0 0 9px 2px' }}>
          보유 아이템 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>탭하여 장착 또는 해제</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {options.map((item) => {
            const selected = equipped.some((equippedItem) => equippedItem.key === item.key);
            return (
              <button key={item.key} onClick={() => toggle(item)} type="button" style={{
                border: selected ? '1.5px solid #E8B93E' : '1.5px solid #F0E7D6',
                background: selected ? '#FFF6DD' : '#fff', borderRadius: 14, padding: '11px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', minHeight: 56,
              }}>
                <span className="icon-badge" style={{ width: 30, height: 30, borderRadius: 10, fontSize: 14, background: item.iconBg, color: item.iconColor }}>{item.icon}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 800, color: '#2B2825', lineHeight: 1.35 }}>{item.short}</span>
                <span style={{ flex: 'none', fontSize: 13, fontWeight: 900, color: selected ? '#C98A00' : '#D8CDBB' }}>{selected ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ margin: '14px 22px 0', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 900, color: '#2B2825' }}>시뮬레이션 요약</p>
            <p style={{ marginTop: 4, fontSize: 11.5, color: '#8A8178', lineHeight: 1.5 }}>
              매출에서 비용·세금·기존 및 신규 상환액을 차감해 월별 잔액을 계산합니다.
            </p>
          </div>
          <span style={{
            flex: 'none', fontSize: 10.5, fontWeight: 900, padding: '5px 8px', borderRadius: 10,
            color: riskTone === 'base' ? '#8A8178' : riskTone === 'good' ? '#5E8A3E' : '#D0564C',
            background: riskTone === 'base' ? '#F5EFE3' : riskTone === 'good' ? '#EDF5E1' : '#FDE8E6',
          }}>{riskTone === 'base' ? '기준 시나리오' : riskTone === 'good' ? '위험 완화' : '상환 부담 주의'}</span>
        </div>

        {loading && <p style={{ fontSize: 12, fontWeight: 800, color: '#8A8178' }}>월별 시나리오를 계산하고 있어요.</p>}
        {error && <p style={{ fontSize: 12, fontWeight: 800, color: '#D0564C' }}>시뮬레이션 연결 실패: {error}</p>}

        {!loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {simRows.map((metric) => (
                <div key={metric.name} style={{ background: '#FBF7EE', border: '1px solid #F0E7D6', borderRadius: 12, padding: '10px 11px', minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#A79C8E' }}>{metric.name}</p>
                  <p style={{ marginTop: 4, fontSize: 13.5, fontWeight: 900, color: '#2B2825', whiteSpace: 'nowrap' }}>{metric.after}</p>
                  <p style={{ marginTop: 3, fontSize: 10.5, fontWeight: 800, color: metric.deltaColor }}>{metric.delta} <span style={{ color: '#B9B0A4', fontWeight: 600 }}>기준 {metric.before}</span></p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, background: '#F7F1E4', padding: 4, borderRadius: 13 }}>
              {SIM_VIEWS.map((item) => {
                const selected = view === item.key;
                return (
                  <button key={item.key} type="button" onClick={() => setView(item.key)} style={{
                    height: 32, border: 'none', borderRadius: 10, cursor: 'pointer', background: selected ? '#fff' : 'transparent',
                    color: selected ? '#2B2825' : '#8A8178', fontSize: 10.5, fontWeight: 900,
                    boxShadow: selected ? '0 2px 8px rgba(80,60,20,.08)' : 'none',
                  }}>{item.label}</button>
                );
              })}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#2B2825' }}>{current.title}</p>
                <p style={{ fontSize: 11.5, fontWeight: 900, color: current.inverse ? (current.after <= current.before ? '#5E8A3E' : '#D0564C') : (current.after >= current.before ? '#5E8A3E' : '#D0564C') }}>
                  {current.before} → {current.after}{current.unit}
                </p>
              </div>
              <p style={{ marginTop: 4, fontSize: 11.5, color: '#8A8178', lineHeight: 1.55 }}>{current.lead}</p>
            </div>

            <MiniCompareChart points={current.points} inverse={current.inverse} unit={current.unit} title={current.title} />

            {view === 'risk' && <RiskGauge before={detail.riskBefore} after={detail.riskAfter} />}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
              {current.facts.map((fact) => (
                <div key={fact.k} style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 8, minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#A79C8E' }}>{fact.k}</p>
                  <p style={{ marginTop: 3, fontSize: 12, fontWeight: 900, color: '#2B2825', lineHeight: 1.25 }}>{fact.v}</p>
                </div>
              ))}
            </div>

            {detail.contributions.length > 0 && (
              <div style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 900, color: '#8A8178' }}>상품별 반영 근거</p>
                {detail.contributions.map((contribution) => (
                  <div key={contribution.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span className="icon-badge" style={{ width: 28, height: 28, borderRadius: 9, fontSize: 13, background: contribution.iconBg, color: contribution.iconColor }}>{contribution.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <p style={{ flex: 1, fontSize: 12, fontWeight: 900, color: '#2B2825' }}>{contribution.name}</p>
                        <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 900, color: contribution.iconColor, background: contribution.iconBg, padding: '3px 7px', borderRadius: 8 }}>{contribution.delta}</span>
                      </div>
                      <p style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: '#8A7A55', lineHeight: 1.45 }}>{contribution.formula}</p>
                      <p style={{ marginTop: 2, fontSize: 10.8, color: '#A79C8E', lineHeight: 1.45 }}>{contribution.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(detail.violations.length > 0 || detail.warnings.length > 0) && (
              <div style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 10 }}>
                <p style={{ fontSize: 11.5, fontWeight: 900, color: detail.violations.length ? '#D0564C' : '#8A8178' }}>{detail.violations[0] || detail.warnings[0]}</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MiniCompareChart({ points, inverse, unit, title }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const values = points.flatMap((point) => [point.before, point.after]);
  const rawMax = Math.max(...values, 1);
  const rawMin = Math.min(...values, 0);
  const padding = Math.max((rawMax - rawMin) * 0.16, Math.abs(rawMax) * 0.04, 1);
  const max = rawMax + padding;
  const min = Math.max(0, rawMin - padding);
  const span = Math.max(1, max - min);
  const x = (index) => 4 + (index / Math.max(1, points.length - 1)) * 92;
  const y = (value) => 76 - ((value - min) / span) * 66;
  const path = (key) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point[key])}`).join(' ');
  const afterColor = inverse ? '#6FAE4D' : '#E5A600';
  const markerFill = inverse ? '#E9F5E0' : '#FFF1C9';
  const gradientId = inverse ? 'sim-chart-green-fill' : 'sim-chart-yellow-fill';
  const areaPath = `${path('after')} L ${x(points.length - 1)} 84 L ${x(0)} 84 Z`;
  const hovered = hoveredIndex == null ? null : points[hoveredIndex];

  return (
    <div style={{ background: '#FFF9EF', border: '1.5px solid #F0E7D6', borderRadius: 14, padding: '13px 11px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 900, color: '#2B2825' }}>월별 변화</p>
          <p style={{ marginTop: 2, fontSize: 10.5, fontWeight: 700, color: '#A79C8E' }}>점을 누르거나 마우스를 올려 월별 수치를 확인하세요.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 800, color: '#8A8178' }}>
          <span><i style={{ display: 'inline-block', width: 12, height: 2, borderRadius: 2, background: '#BFB3A2', marginRight: 4, verticalAlign: 'middle' }} />기준</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, background: afterColor, marginRight: 4, verticalAlign: 'middle' }} />장착 후</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 182, paddingLeft: 34 }}>
        <span style={{ position: 'absolute', left: 0, top: 2, fontSize: 9, fontWeight: 800, color: '#B9B0A4' }}>{Math.round(max)}{unit}</span>
        <span style={{ position: 'absolute', left: 0, bottom: 22, fontSize: 9, fontWeight: 800, color: '#B9B0A4' }}>{Math.round(min)}{unit}</span>
        {hovered && (
          <div style={{ position: 'absolute', zIndex: 2, top: 5, left: `${Math.min(68, Math.max(4, x(hoveredIndex) - 8))}%`, background: '#2B2825', color: '#fff', borderRadius: 9, padding: '7px 8px', fontSize: 10.5, fontWeight: 800, lineHeight: 1.45, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(43,40,37,.18)' }}>
            <div>{hovered.label}개월차 · {title}</div>
            <div style={{ color: '#DCD3C7' }}>기준 {hovered.before}{unit} / 장착 후 {hovered.after}{unit}</div>
          </div>
        )}
        <svg viewBox="0 0 100 84" preserveAspectRatio="none" role="img" aria-label={`${title} 월별 변화 그래프`} style={{ width: '100%', height: 144, overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={afterColor} stopOpacity=".26" />
              <stop offset="100%" stopColor={afterColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[10, 43, 76].map((lineY) => <line key={lineY} x1="0" y1={lineY} x2="100" y2={lineY} stroke="#ECE3D5" strokeWidth=".7" vectorEffect="non-scaling-stroke" />)}
          {hoveredIndex != null && <line x1={x(hoveredIndex)} y1="0" x2={x(hoveredIndex)} y2="84" stroke="#D6C7AF" strokeWidth=".8" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={path('before')} fill="none" stroke="#BFB3A2" strokeWidth="1.7" strokeDasharray="3 2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <circle key={`before-${point.label}`} cx={x(index)} cy={y(point.before)} r="1.15" fill="#fff" stroke="#BFB3A2" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />)}
          <path d={path('after')} fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path('after')} fill="none" stroke={afterColor} strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => (
            <g key={point.label} onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)} onClick={() => setHoveredIndex(index)} tabIndex="0" role="button" aria-label={`${point.label}개월차 상세 보기`} style={{ cursor: 'pointer' }}>
              {hoveredIndex === index && <circle cx={x(index)} cy={y(point.after)} r="5" fill={afterColor} opacity=".18" vectorEffect="non-scaling-stroke" />}
              <circle cx={x(index)} cy={y(point.after)} r={hoveredIndex === index ? '3.25' : '2.45'} fill={markerFill} stroke={afterColor} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
              <circle cx={x(index)} cy={y(point.after)} r=".8" fill={afterColor} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
        <div style={{ position: 'absolute', left: 34, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between' }}>
          {points.map((point, index) => <span key={point.label} style={{ fontSize: 9, fontWeight: 800, color: index % 3 === 0 || index === points.length - 1 ? '#B9B0A4' : 'transparent' }}>{point.label}월</span>)}
        </div>
      </div>
    </div>
  );
}

function RiskGauge({ before, after }) {
  const beforeValue = Math.round(before * 10) / 10;
  const afterValue = Math.round(after * 10) / 10;
  const level = (value) => (value < 20 ? '낮음' : value < 40 ? '주의' : '높음');
  const color = afterValue < 20 ? '#5E8A3E' : afterValue < 40 ? '#C98A00' : '#D0564C';

  return (
    <div style={{ background: '#FBF7EE', borderRadius: 12, padding: '11px 12px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={{ fontSize: 11, fontWeight: 900, color: '#8A8178' }}>현금 부족 가능성</p>
        <p style={{ fontSize: 15, fontWeight: 900, color }}>{afterValue}% · {level(afterValue)}</p>
      </div>
      <div style={{ position: 'relative', height: 13, marginTop: 10, borderRadius: 7, background: 'linear-gradient(90deg,#A8D284 0 20%,#FFD66B 20% 40%,#F0968C 40% 100%)' }}>
        <span title={`기준 ${beforeValue}%`} style={{ position: 'absolute', left: `${beforeValue}%`, top: -4, width: 2, height: 21, background: '#6B6259', transform: 'translateX(-1px)' }} />
        <span title={`장착 후 ${afterValue}%`} style={{ position: 'absolute', left: `${afterValue}%`, top: -5, width: 10, height: 23, border: `3px solid ${color}`, borderRadius: 7, background: '#fff', transform: 'translateX(-5px)' }} />
      </div>
      <p style={{ marginTop: 8, fontSize: 10.5, color: '#8A8178', lineHeight: 1.45 }}>기준 {beforeValue}%에서 상품 장착 후 {afterValue}%로 변합니다.</p>
    </div>
  );
}
