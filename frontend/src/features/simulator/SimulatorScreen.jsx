import { useMemo, useState } from 'react';
import Couple from './Couple';
import { buildSimulationDetail, SIM_VIEWS } from './sim';

export default function SimulatorScreen({ equipped, options, toggle, simRows, simulation, loading, error }) {
  const [view, setView] = useState('cash');
  const [salesCase, setSalesCase] = useState('average');
  const detail = useMemo(() => buildSimulationDetail(simulation), [simulation]);
  const baseView = detail.views[view] || detail.views.cash;
  const current = view === 'sales' && baseView.scenarios?.[salesCase]
    ? { ...baseView, ...baseView.scenarios[salesCase] }
    : baseView;
  const hasConstraintIssue = Boolean(simulation && !simulation.constraints?.repaymentBurdenPassed);
  const riskTone = equipped.length === 0 || simulation?.confidence?.level === 'LOW'
    ? 'base'
    : hasConstraintIssue || detail.riskAfter > detail.riskBefore ? 'bad'
    : detail.riskAfter < detail.riskBefore ? 'good' : 'base';

  return (
    <div className="scr" style={{ padding: '0 0 130px', gap: 0 }}>
      <div style={{
        margin: '2px 22px 0', position: 'relative', height: 230, overflow: 'hidden',
        background: 'linear-gradient(180deg,#FFF3D2 0%,#FFF9EF 68%,#E9F2DB 86%,#D8E8C2 100%)',
        border: '1.5px solid #F0E7D6', borderRadius: 22,
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: 'linear-gradient(180deg,#B9D69A,#9DC47B)' }} />
        {/* Landscape is the background; Couple only renders transparent character layers. */}
        <Couple />
        <EquippedProducts equipped={equipped} toggle={toggle} />
      </div>

      <section style={{ margin: '12px 22px 0' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#8A8178', margin: '0 0 9px 2px' }}>추천 상품</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {options.map((item) => {
            const selected = equipped.some((equippedItem) => equippedItem.key === item.key);
            const conflicts = !selected && item.duplicateGroup
              && equipped.some((equippedItem) => equippedItem.duplicateGroup === item.duplicateGroup);
            return (
              <button key={item.key} onClick={() => toggle(item)} type="button" style={{
                border: selected ? '1.5px solid #E8B93E' : conflicts ? '1.5px solid #E7C7C2' : '1.5px solid #F0E7D6',
                background: selected ? '#FFF6DD' : conflicts ? '#FBF3F1' : '#fff', borderRadius: 14, padding: '11px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', minHeight: 56,
              }}>
                <span className="icon-badge" style={{ width: 30, height: 30, borderRadius: 10, fontSize: 14, background: item.iconBg, color: item.iconColor }}>{item.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: '#2B2825', lineHeight: 1.35 }}>{item.short}</span>
                  {(conflicts || item.duplicateNotice) && (
                    <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, fontWeight: 800, color: '#B45A51' }}>
                      중복 가입 불가
                    </span>
                  )}
                </span>
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
          </div>
          <span style={{
            flex: 'none', fontSize: 10.5, fontWeight: 900, padding: '5px 8px', borderRadius: 10,
            color: riskTone === 'base' ? '#8A8178' : riskTone === 'good' ? '#5E8A3E' : '#D0564C',
            background: riskTone === 'base' ? '#F5EFE3' : riskTone === 'good' ? '#EDF5E1' : '#FDE8E6',
          }}>{riskTone === 'base' ? '기준 시나리오' : riskTone === 'good' ? '부담 완화' : '대출 부담 주의'}</span>
        </div>

        {loading && <p style={{ fontSize: 12, fontWeight: 800, color: '#8A8178' }}>월별 시나리오를 계산하고 있어요.</p>}
        {error && <p style={{ fontSize: 12, fontWeight: 800, color: '#D0564C' }}>계산 확인 필요: {friendlyError(error)}</p>}

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
              {view === 'sales' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10, padding: 4, background: '#F7F1E4', borderRadius: 12 }}>
                  {[
                    ['conservative', '보수적'],
                    ['average', '평균'],
                    ['optimistic', '좋은 경우'],
                  ].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setSalesCase(key)} style={{
                      height: 30, border: 'none', borderRadius: 9, cursor: 'pointer',
                      background: salesCase === key ? '#fff' : 'transparent',
                      color: salesCase === key ? '#2B2825' : '#8A8178', fontSize: 10.5, fontWeight: 900,
                      boxShadow: salesCase === key ? '0 2px 8px rgba(80,60,20,.08)' : 'none',
                    }}>{label}</button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#2B2825' }}>{current.title}</p>
                <p style={{ fontSize: 11.5, fontWeight: 900, color: current.unavailable ? '#A79C8E' : current.inverse ? (current.after <= current.before ? '#5E8A3E' : '#D0564C') : (current.after >= current.before ? '#5E8A3E' : '#D0564C') }}>
                  {current.unavailable ? '최근 6개월 매출 필요' : `${current.displayBefore ?? current.before} → ${current.displayAfter ?? `${current.after}${current.unit}`}`}
                </p>
              </div>
              <p style={{ marginTop: 4, fontSize: 11.5, color: '#8A8178', lineHeight: 1.55 }}>{current.lead}</p>
            </div>

            {current.unavailable ? (
              <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', padding: 18, border: '1.5px solid #F0E7D6', borderRadius: 14, background: '#FFF9EF', color: '#8A8178', textAlign: 'center', fontSize: 11.5, fontWeight: 800, lineHeight: 1.55 }}>
                최근 6개월 이상의 실제 매출 이력이 연결되면<br />월별로 현금이 모자랄 가능성을 보여드려요.
              </div>
            ) : (
              <MiniCompareChart points={current.points} scaleValues={current.scaleValues} scaleFromZero={current.scaleFromZero} inverse={current.inverse} unit={current.unit} title={current.title} />
            )}

            {view === 'risk' && !current.unavailable && (
              <RiskGauge
                beforeProbability={simulation.baseline.stochastic.bufferBreachProbability}
                afterProbability={simulation.selectedScenario.stochastic.bufferBreachProbability}
                simulationCount={simulation.selectedScenario.stochastic.simulationCount}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
              {current.facts.map((fact) => (
                <div key={fact.k} style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 8, minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#A79C8E' }}>{fact.k}</p>
                  <p style={{ marginTop: 3, fontSize: 12, fontWeight: 900, color: '#2B2825', lineHeight: 1.25 }}>{fact.v}</p>
                </div>
              ))}
            </div>

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

function friendlyError(error) {
  if (error.includes('Duplicate benefit group')) return '함께 선택할 수 없는 상품 조합이에요.';
  if (error.includes('existingDebtBalance is required')) return '기존 대출 내역을 입력하거나 내역 없음을 선택해 주세요.';
  if (error.includes('Eligibility failed')) return '현재 입력 조건으로는 가입 자격을 충족하지 못한 상품이 있어요.';
  if (error.includes('Requested amount exceeds')) return '희망 금액이 상품의 공식 한도를 초과했어요.';
  if (error.includes('Requested amount is below')) return '희망 금액이 상품의 최소 신청금액보다 적어요.';
  return error;
}

function EquippedProducts({ equipped, toggle }) {
  if (equipped.length === 0) return null;

  return (
    <aside className="equipped-products" aria-label={`장착 상품 ${equipped.length}개`}>
      <div className="equipped-products__header">
        <span>장착 {equipped.length}개</span>
      </div>
      <div className="equipped-products__list">
        {equipped.map((item) => (
          <button
            key={item.key}
            type="button"
            className="equipped-product equipped-product--list"
            onClick={() => toggle(item)}
            title={`${item.short} 해제`}
            style={{ '--item-color': item.iconColor, '--item-bg': item.iconBg }}
          >
            <span className="icon-badge equipped-product__icon">{item.icon}</span>
            <span className="equipped-product__name">{item.short}</span>
            <span className="equipped-product__remove" aria-hidden="true">×</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function MiniCompareChart({ points, scaleValues, scaleFromZero = false, inverse, unit, title }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const values = scaleValues?.length ? scaleValues : points.flatMap((point) => [point.before, point.after]);
  const rawMax = Math.max(...values, 1);
  const rawMin = Math.min(...values);
  const padding = Math.max((rawMax - rawMin) * 0.16, Math.abs(rawMax) * 0.04, 1);
  const max = rawMax + padding;
  // Cash and risk need a zero reference; sales and repayments use a zoomed value range.
  const min = rawMin < 0 ? rawMin - padding : scaleFromZero ? 0 : Math.max(0, rawMin - padding);
  const span = Math.max(1, max - min);
  const x = (index) => 4 + (index / Math.max(1, points.length - 1)) * 92;
  const y = (value) => 76 - ((value - min) / span) * 66;
  const path = (key) => points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point[key])}`).join(' ');
  const afterColor = inverse ? '#6FAE4D' : '#E5A600';
  const gradientId = inverse ? 'sim-chart-green-fill' : 'sim-chart-yellow-fill';
  const hasNegativeValue = rawMin < 0;
  const zeroLineY = hasNegativeValue ? y(0) : null;
  const areaBaseY = zeroLineY ?? 76;
  const areaPath = `${path('after')} L ${x(points.length - 1)} ${areaBaseY} L ${x(0)} ${areaBaseY} Z`;
  const hovered = hoveredIndex == null ? null : points[hoveredIndex];

  return (
    <div style={{ background: '#FFF9EF', border: '1.5px solid #F0E7D6', borderRadius: 14, padding: '13px 11px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 900, color: '#2B2825' }}>월별 변화</p>
          <p style={{ marginTop: 2, fontSize: 10.5, fontWeight: 700, color: '#A79C8E' }}>그래프 위에 마우스를 올려 월별 수치를 확인하세요.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 800, color: '#8A8178' }}>
          <span><i style={{ display: 'inline-block', width: 12, height: 2, borderRadius: 2, background: '#BFB3A2', marginRight: 4, verticalAlign: 'middle' }} />기준</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, background: afterColor, marginRight: 4, verticalAlign: 'middle' }} />장착 후</span>
        </div>
      </div>
      <div className="sim-chart-tooltip-slot" aria-live="polite">
        {hovered && (
          <div className="sim-chart-tooltip">
            <span className="sim-chart-tooltip__dot" style={{ background: afterColor }} />
            <strong>{hovered.label}개월차</strong>
            <span>기존 {hovered.before}{unit}</span>
            <span>장착 후 {hovered.after}{unit}</span>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', height: 182, paddingLeft: 34 }}>
        <span style={{ position: 'absolute', left: 0, top: 2, fontSize: 9, fontWeight: 800, color: '#B9B0A4' }}>{Math.round(max)}{unit}</span>
        <span style={{ position: 'absolute', left: 0, top: 67, fontSize: 9, fontWeight: 800, color: '#B9B0A4' }}>{Math.round((max + min) / 2)}{unit}</span>
        <span style={{ position: 'absolute', left: 0, bottom: 22, fontSize: 9, fontWeight: 800, color: '#B9B0A4' }}>{Math.round(min)}{unit}</span>
        <svg viewBox="0 0 100 84" preserveAspectRatio="none" role="img" aria-label={`${title} 월별 변화 그래프`} style={{ width: '100%', height: 144, overflow: 'hidden' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={afterColor} stopOpacity=".26" />
              <stop offset="100%" stopColor={afterColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[10, 43, 76].map((lineY) => <line key={lineY} x1="0" y1={lineY} x2="100" y2={lineY} stroke="#ECE3D5" strokeWidth=".7" vectorEffect="non-scaling-stroke" />)}
          {zeroLineY != null && <line x1="0" y1={zeroLineY} x2="100" y2={zeroLineY} stroke="#D9BFA0" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={path('before')} fill="none" stroke="#BFB3A2" strokeWidth="1.4" strokeDasharray="4 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <path d={path('after')} fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <path d={path('after')} fill="none" stroke={afterColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {hoveredIndex != null && <line x1={x(hoveredIndex)} y1="0" x2={x(hoveredIndex)} y2="84" stroke="#D6C7AF" strokeWidth=".8" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          {points.map((point, index) => (
            <rect key={point.label} x={x(index) - 4.2} y="0" width="8.4" height="84" fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)}
              onClick={() => setHoveredIndex(index)} tabIndex="0" role="button" aria-label={`${point.label}개월차 상세 보기`} style={{ cursor: 'pointer' }} />
          ))}
        </svg>
        <div style={{ position: 'absolute', left: 34, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between' }}>
          {points.map((point, index) => <span key={point.label} style={{ fontSize: 9, fontWeight: 800, color: index % 2 === 0 || index === points.length - 1 ? '#B9B0A4' : 'transparent' }}>{point.label}월</span>)}
        </div>
      </div>
    </div>
  );
}

function RiskGauge({ beforeProbability, afterProbability, simulationCount }) {
  const beforeValue = beforeProbability * 100;
  const afterValue = afterProbability * 100;
  const label = (probability) => {
    const value = probability * 100;
    if (value < 0.1) return '거의 없음';
    if (value < 5) return `매우 낮음 (${Math.round(value * 10) / 10}%)`;
    if (value < 20) return `낮음 (${Math.round(value * 10) / 10}%)`;
    return `주의 필요 (${Math.round(value * 10) / 10}%)`;
  };
  const level = (value) => (value < 0.1 ? '안정적' : value < 20 ? '확인 필요' : '주의');
  const color = afterValue < 20 ? '#5E8A3E' : afterValue < 40 ? '#C98A00' : '#D0564C';

  return (
    <div style={{ background: '#FBF7EE', borderRadius: 12, padding: '11px 12px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={{ fontSize: 11, fontWeight: 900, color: '#8A8178' }}>가게 운영에 필요한 현금이 모자랄 가능성</p>
        <p style={{ fontSize: 15, fontWeight: 900, color }}>{label(afterProbability)} · {level(afterValue)}</p>
      </div>
      <div style={{ position: 'relative', height: 13, marginTop: 10, borderRadius: 7, background: 'linear-gradient(90deg,#A8D284 0 20%,#FFD66B 20% 40%,#F0968C 40% 100%)' }}>
        <span title={`기준 ${label(beforeProbability)}`} style={{ position: 'absolute', left: `${beforeValue}%`, top: -4, width: 2, height: 21, background: '#6B6259', transform: 'translateX(-1px)' }} />
        <span title={`장착 후 ${label(afterProbability)}`} style={{ position: 'absolute', left: `${afterValue}%`, top: -5, width: 10, height: 23, border: `3px solid ${color}`, borderRadius: 7, background: '#fff', transform: 'translateX(-5px)' }} />
      </div>
      <p style={{ marginTop: 8, fontSize: 10.5, color: '#8A8178', lineHeight: 1.45 }}>임대료·인건비·대출 상환을 반영했을 때, 가게 운영에 필요한 현금이 모자랄 가능성이에요.</p>
    </div>
  );
}
