import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Couple from './Couple';
import { buildSimulationDetail, SIM_VIEWS } from './sim';

export default function SimulatorScreen({ equipped, options, toggle, simRows, simulation, loading, error }) {
  const [view, setView] = useState('cash');
  const [salesCase, setSalesCase] = useState('average');
  const [activeMonth, setActiveMonth] = useState(null);
  const [reaction, setReaction] = useState({ type: 'idle', key: 0 });
  const previousEquippedCount = useRef(equipped.length);
  const previousGoodCombination = useRef(false);
  const reactionKey = useRef(0);
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
  const hasSimulationData = Boolean(simulation?.baseline?.monthlyCashFlows?.length);
  const hasFailedEligibility = equipped.some((item) => item.eligibilityStatus === 'FAIL');
  const duplicateGroups = equipped.map((item) => item.duplicateGroup).filter(Boolean);
  const hasDuplicateProducts = new Set(duplicateGroups).size !== duplicateGroups.length;
  const needsAttention = equipped.length > 0 && (hasConstraintIssue || hasFailedEligibility || hasDuplicateProducts);
  const isGoodCombination = hasSimulationData
    && equipped.length > 0
    && simulation?.confidence?.level !== 'LOW'
    && detail.riskAfter < detail.riskBefore
    && !needsAttention;

  const triggerReaction = (type) => {
    reactionKey.current += 1;
    setReaction({ type, key: reactionKey.current });
  };

  useLayoutEffect(() => {
    if (previousEquippedCount.current !== equipped.length) {
      triggerReaction(equipped.length > previousEquippedCount.current ? 'equip' : 'idle');
      previousEquippedCount.current = equipped.length;
    }
  }, [equipped.length]);

  useEffect(() => {
    if (isGoodCombination && !previousGoodCombination.current) triggerReaction('success');
    previousGoodCombination.current = isGoodCombination;
  }, [isGoodCombination]);

  return (
    <div className="scr" style={{ padding: '0 0 200px', gap: 0 }}>
      <div style={{
        margin: '2px 22px 0', position: 'relative', height: 230, overflow: 'hidden',
        background: 'linear-gradient(180deg,#FFF3D2 0%,#FFFFFF 68%,#E9F2DB 86%,#D8E8C2 100%)',
        border: '1.5px solid #EAECEF', borderRadius: 22,
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: 'linear-gradient(180deg,#B9D69A,#9DC47B)' }} />
        {/* Landscape is the background; Couple only renders transparent character layers. */}
        <Couple reaction={reaction.type} reactionKey={reaction.key} needsAttention={needsAttention} />
        <EquippedBubble equipped={equipped} toggle={toggle} />
      </div>


      <section style={{ margin: '12px 22px 0' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#8B95A1', margin: '0 0 9px 2px' }}>추천 상품 {options.length}개</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          {options.map((item) => {
            const selected = equipped.some((equippedItem) => equippedItem.key === item.key);
            const conflicts = !selected && item.duplicateGroup
              && equipped.some((equippedItem) => equippedItem.duplicateGroup === item.duplicateGroup);
            const eligibility = eligibilityLabel(item.eligibilityStatus);
            const terms = productTerms(item);
            return (
              <button key={item.key} onClick={() => toggle(item)} type="button" aria-pressed={selected} title={item.name || item.short} style={{
                border: selected ? '1.5px solid #E8B93E' : conflicts ? '1.5px solid #E7C7C2' : '1.5px solid #EAECEF',
                background: selected ? '#FFF6DD' : conflicts ? '#FBF3F1' : '#fff', borderRadius: 14, padding: '11px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', minHeight: 60,
              }}>
                <span className="icon-badge" style={{ flex: 'none', width: 30, height: 30, borderRadius: 10, fontSize: 14, background: item.iconBg, color: item.iconColor, marginTop: 1 }}>{item.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#191B1F', lineHeight: 1.42, overflowWrap: 'anywhere' }}>{item.name || item.short}</span>
                  {item.reason && <span style={{ display: '-webkit-box', marginTop: 3, overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, fontSize: 10.5, lineHeight: 1.35, fontWeight: 700, color: '#8B95A1' }}>{item.reason}</span>}
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                    <span style={{ padding: '3px 6px', borderRadius: 7, background: '#F1F3F5', color: '#8B95A1', fontSize: 9.5, fontWeight: 800 }}>{terms}</span>
                    <span style={{ padding: '3px 6px', borderRadius: 7, background: eligibility.background, color: eligibility.color, fontSize: 9.5, fontWeight: 800 }}>{eligibility.label}</span>
                  </span>
                  {(conflicts || item.duplicateNotice) && (
                    <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, fontWeight: 800, color: '#B45A51' }}>
                      중복 가입 불가
                    </span>
                  )}
                </span>
                <span style={{ flex: 'none', fontSize: 13, fontWeight: 900, color: selected ? '#C98A00' : '#C7CDD3' }}>{selected ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ margin: '14px 22px 0', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 900, color: '#191B1F' }}>시뮬레이션 요약</p>
          </div>
          <span style={{
            flex: 'none', fontSize: 10.5, fontWeight: 900, padding: '5px 8px', borderRadius: 10,
            color: riskTone === 'base' ? '#8B95A1' : riskTone === 'good' ? '#5E8A3E' : '#D0564C',
            background: riskTone === 'base' ? '#EEF0F3' : riskTone === 'good' ? '#EDF5E1' : '#FDE8E6',
          }}>{riskTone === 'base' ? '기준 시나리오' : riskTone === 'good' ? '부담 완화' : '대출 부담 주의'}</span>
        </div>

        {loading && <p style={{ fontSize: 12, fontWeight: 800, color: '#8B95A1' }}>월별 시나리오를 계산하고 있어요.</p>}
        {error && <p style={{ fontSize: 12, fontWeight: 800, color: '#D0564C' }}>계산 확인 필요: {friendlyError(error)}</p>}

        {!loading && !error && !hasSimulationData && <SimulationAwaiting />}

        {!loading && !error && hasSimulationData && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {simRows.slice(0, 4).map((metric) => (
                <div key={metric.name} style={{ background: '#F7F8FA', border: '1px solid #EAECEF', borderRadius: 12, padding: '10px 11px', minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#9FA6B0' }}>{metric.name}</p>
                  <p style={{ marginTop: 4, fontSize: 13.5, fontWeight: 900, color: '#191B1F', whiteSpace: 'nowrap' }}>{metric.after}</p>
                  <p style={{ marginTop: 3, fontSize: 10.5, fontWeight: 800, color: metric.deltaColor }}>{metric.delta} <span style={{ color: '#B0B8C1', fontWeight: 600 }}>기준 {metric.before}</span></p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, background: '#F1F3F5', padding: 4, borderRadius: 13 }}>
              {SIM_VIEWS.map((item) => {
                const selected = view === item.key;
                return (
                  <button key={item.key} type="button" onClick={() => { setView(item.key); setActiveMonth(null); }} style={{
                    height: 32, border: 'none', borderRadius: 10, cursor: 'pointer', background: selected ? '#fff' : 'transparent',
                    color: selected ? '#191B1F' : '#8B95A1', fontSize: 10.5, fontWeight: 900,
                    boxShadow: selected ? '0 2px 8px rgba(25,27,31,.08)' : 'none',
                  }}>{item.label}</button>
                );
              })}
            </div>

            <div>
              {view === 'sales' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10, padding: 4, background: '#F1F3F5', borderRadius: 12 }}>
                  {[
                    ['conservative', '낮은 전망'],
                    ['average', '기준 전망'],
                    ['optimistic', '높은 전망'],
                  ].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => { setSalesCase(key); setActiveMonth(null); }} style={{
                      height: 30, border: 'none', borderRadius: 9, cursor: 'pointer',
                      background: salesCase === key ? '#fff' : 'transparent',
                      color: salesCase === key ? '#191B1F' : '#8B95A1', fontSize: 10.5, fontWeight: 900,
                      boxShadow: salesCase === key ? '0 2px 8px rgba(25,27,31,.08)' : 'none',
                    }}>{label}</button>
                  ))}
                  <p style={{ gridColumn: '1 / -1', padding: '2px 6px 3px', fontSize: 9.5, lineHeight: 1.4, fontWeight: 700, color: '#9FA6B0' }}>
                    앞으로의 매출은 최근 연동 이력을 바탕으로 계산한 추정치예요.
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#191B1F' }}>{current.title}</p>
                <p style={{ fontSize: 11.5, fontWeight: 900, color: current.unavailable ? '#9FA6B0' : current.inverse ? (current.after <= current.before ? '#5E8A3E' : '#D0564C') : (current.after >= current.before ? '#5E8A3E' : '#D0564C') }}>
                  {current.unavailable ? '최근 6개월 매출 필요' : `${current.displayBefore ?? current.before} → ${current.displayAfter ?? `${current.after}${current.unit}`}`}
                </p>
              </div>
            </div>

            {current.unavailable ? (
              <div style={{ minHeight: 120, display: 'grid', placeItems: 'center', padding: 18, border: '1.5px solid #EAECEF', borderRadius: 14, background: '#FFFFFF', color: '#8B95A1', textAlign: 'center', fontSize: 11.5, fontWeight: 800, lineHeight: 1.55 }}>
                최근 6개월 이상의 실제 매출 이력이 연결되면<br />월별로 현금이 모자랄 가능성을 보여드려요.
              </div>
            ) : (
              <MiniCompareChart points={current.points} scaleValues={current.scaleValues} scaleFromZero={current.scaleFromZero} inverse={current.inverse} unit={current.unit} title={current.title} onPointChange={setActiveMonth} />
            )}

            {activeMonth && <MonthlyChangeSheet point={activeMonth} unit={current.unit} view={view} />}

            {view === 'risk' && !current.unavailable && (
              <RiskGauge
                beforeProbability={simulation.baseline.stochastic.bufferBreachProbability}
                afterProbability={simulation.selectedScenario.stochastic.bufferBreachProbability}
                simulationCount={simulation.selectedScenario.stochastic.simulationCount}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
              {current.facts.map((fact) => (
                <div key={fact.k} style={{ borderTop: '1.5px solid #EAECEF', paddingTop: 8, minWidth: 0 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 800, color: '#9FA6B0' }}>{fact.k}</p>
                  <p style={{ marginTop: 3, fontSize: 12, fontWeight: 900, color: '#191B1F', lineHeight: 1.25 }}>{fact.v}</p>
                </div>
              ))}
            </div>

            {(detail.violations.length > 0 || detail.warnings.length > 0) && (
              <div style={{ borderTop: '1.5px solid #EAECEF', paddingTop: 10 }}>
                <p style={{ fontSize: 11.5, fontWeight: 900, color: detail.violations.length ? '#D0564C' : '#8B95A1' }}>{detail.violations[0] || detail.warnings[0]}</p>
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

function eligibilityLabel(status) {
  if (status === 'PASS') return { label: '조건 충족', background: '#EDF5E1', color: '#5E8A3E' };
  if (status === 'FAIL') return { label: '조건 확인 필요', background: '#FDE8E6', color: '#D0564C' };
  return { label: '조건 확인', background: '#EEF0F3', color: '#8B95A1' };
}

function productTerms(item) {
  const terms = item.simulationTerms || {};
  if (item.type === 'LOAN' && terms.annualRate != null) {
    const duration = terms.totalTermMonths ? ` · ${terms.totalTermMonths}개월` : '';
    return `연 ${Number(terms.annualRate).toFixed(1)}%${duration}`;
  }
  if (item.type === 'SAVINGS' || item.type === 'MUTUAL_AID') return '매달 현금 쌓기';
  if (item.type === 'INSURANCE') return '위험 대비';
  return item.category || '지원 조건 확인';
}

function SimulationAwaiting() {
  return (
    <div style={{ marginTop: 4, padding: '23px 16px', border: '1.5px dashed #D3D7DC', borderRadius: 16, background: '#FFFFFF', textAlign: 'center' }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: '#525A64' }}>분석을 마치면 월별 변화가 보여요</p>
      <p style={{ marginTop: 5, fontSize: 11, lineHeight: 1.5, fontWeight: 700, color: '#9FA6B0' }}>우리 가게 진단에서 분석하기를 완료해 주세요.</p>
    </div>
  );
}

function MonthlyChangeSheet({ point, unit, view }) {
  const difference = Math.round((Number(point.after) - Number(point.before)) * 10) / 10;
  const improved = view === 'repay' || view === 'risk' ? difference <= 0 : difference >= 0;
  const context = {
    cash: '매출·운영비·상환액을 함께 반영했어요.',
    sales: '선택한 매출 시나리오 기준이에요.',
    repay: '기존 대출과 새 대출 상환액을 합산했어요.',
    risk: '매출 변동과 상환 부담을 함께 반영했어요.',
  }[view] || '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 11px', borderRadius: 12, background: '#F1F3F5' }}>
      <span style={{ width: 28, height: 28, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 9, background: '#fff', color: improved ? '#5E8A3E' : '#D0564C', fontSize: 12, fontWeight: 900 }}>{point.label}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 11, fontWeight: 900, color: '#191B1F' }}>{point.label}개월차 변화 <span style={{ color: improved ? '#5E8A3E' : '#D0564C' }}>{difference > 0 ? '+' : ''}{difference}{unit}</span></p>
        <p style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: '#8B95A1' }}>{context}</p>
      </div>
    </div>
  );
}

function OutcomeStrip({ metric, riskTone }) {
  if (!metric) return null;

  const tone = riskTone === 'good'
    ? { background: '#EDF5E1', border: '#CFE2B8', color: '#5E8A3E' }
    : riskTone === 'bad'
      ? { background: '#FDECE9', border: '#F3C7C0', color: '#D0564C' }
      : { background: '#FFFFFF', border: '#EAECEF', color: '#8B95A1' };

  return (
    <section style={{ margin: '12px 22px 0', padding: '12px 14px', border: `1.5px solid ${tone.border}`, borderRadius: 16, background: tone.background, display: 'flex', alignItems: 'center', gap: 11 }}>
      <span style={{ width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 10, background: '#fff', color: tone.color, fontSize: 15 }}>✦</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, color: '#8B95A1' }}>이번 조합으로</p>
        <p style={{ marginTop: 2, fontSize: 14, fontWeight: 900, color: '#191B1F' }}>{metric.name} <span style={{ color: tone.color }}>{metric.after}</span></p>
      </div>
      <span style={{ flex: 'none', fontSize: 11, fontWeight: 900, color: tone.color }}>{metric.delta}</span>
    </section>
  );
}

function EquippedBubble({ equipped, toggle }) {
  const [visibleItems, setVisibleItems] = useState(() => equipped.map((item) => ({ ...item, leaving: false })));
  const hasItems = visibleItems.length > 0;

  useLayoutEffect(() => {
    setVisibleItems((currentItems) => {
      const selectedKeys = new Set(equipped.map((item) => item.key));
      const kept = currentItems
        .filter((item) => selectedKeys.has(item.key))
        .map((item) => ({ ...item, leaving: false }));
      const added = equipped
        .filter((item) => !currentItems.some((current) => current.key === item.key))
        .map((item) => ({ ...item, leaving: false }));
      const leaving = currentItems
        .filter((item) => !selectedKeys.has(item.key))
        .map((item) => ({ ...item, leaving: true }));
      return [...kept, ...added, ...leaving];
    });
  }, [equipped]);

  const removeLeavingItem = (key) => {
    setVisibleItems((items) => items.filter((item) => item.key !== key || !item.leaving));
  };

  return (
    <aside aria-label={`장착 상품 ${equipped.length}개`} style={{ position: 'absolute', zIndex: 5, top: 20, right: 12, width: 176, padding: '10px 9px 9px', border: '1.5px solid rgba(240,231,214,.96)', borderRadius: '18px 18px 18px 7px', background: 'rgba(255,253,248,.94)', boxShadow: '0 6px 16px rgba(79,61,25,.1)' }}>
      {/* 말풍선 꼬리는 캐릭터가 있는 왼쪽을 향한다. */}
      <span aria-hidden="true" style={{ position: 'absolute', left: -11, bottom: 31, width: 0, height: 0, borderTop: '9px solid transparent', borderBottom: '9px solid transparent', borderRight: '12px solid rgba(255,253,248,.94)', filter: 'drop-shadow(-1px 0 0 rgba(240,231,214,.96))' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasItems ? 7 : 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: '#525A64' }}>{hasItems ? `함께 챙길 것 ${equipped.length}개` : '상품을 골라보세요'}</span>
        <span style={{ color: '#E5A600', fontSize: 12 }}>✦</span>
      </div>
      {hasItems && (
        <div className="equipped-bubble__list" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 126, overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: 1 }}>
          {visibleItems.map((item) => (
            <button key={item.key} type="button" className={`equipped-bubble__item${item.leaving ? ' is-leaving' : ''}`} disabled={item.leaving} onAnimationEnd={() => item.leaving && removeLeavingItem(item.key)} onClick={() => toggle(item)} title={`${item.name || item.short} 해제`} style={{ width: '100%', minHeight: 31, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', border: `1.5px solid ${item.iconColor}`, borderRadius: 10, background: item.iconBg, color: '#191B1F', cursor: item.leaving ? 'default' : 'pointer', textAlign: 'left' }}>
              <span className="icon-badge" style={{ flex: 'none', width: 20, height: 20, borderRadius: 7, background: '#fff', color: item.iconColor, fontSize: 10 }}>{item.icon}</span>
              <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, fontSize: 9.5, lineHeight: 1.2, fontWeight: 900 }}>{item.short || item.name}</span>
              <span aria-hidden="true" style={{ flex: 'none', color: item.iconColor, fontSize: 14, lineHeight: 1 }}>×</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
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

function MiniCompareChart({ points, scaleValues, scaleFromZero = false, inverse, unit, title, onPointChange }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
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
  const activeIndex = hoveredIndex ?? selectedIndex;
  const activePoint = activeIndex == null ? null : points[activeIndex];

  return (
    <div style={{ background: '#FFFFFF', border: '1.5px solid #EAECEF', borderRadius: 14, padding: '13px 11px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 900, color: '#191B1F' }}>월별 변화</p>
          <p style={{ marginTop: 2, fontSize: 10.5, fontWeight: 700, color: '#9FA6B0' }}>그래프 위에 마우스를 올려 월별 수치를 확인하세요.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 10, fontWeight: 800, color: '#8B95A1' }}>
          <span><i style={{ display: 'inline-block', width: 12, height: 2, borderRadius: 2, background: '#ABB3BC', marginRight: 4, verticalAlign: 'middle' }} />기준</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, background: afterColor, marginRight: 4, verticalAlign: 'middle' }} />장착 후</span>
        </div>
      </div>
      <div className="sim-chart-tooltip-slot" aria-live="polite">
        {activePoint && (
          <div className="sim-chart-tooltip">
            <span className="sim-chart-tooltip__dot" style={{ background: afterColor }} />
            <strong>{activePoint.label}개월차</strong>
            <span>기존 {activePoint.before}{unit}</span>
            <span>장착 후 {activePoint.after}{unit}</span>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', height: 182, paddingLeft: 34 }}>
        <span style={{ position: 'absolute', left: 0, top: 2, fontSize: 9, fontWeight: 800, color: '#B0B8C1' }}>{Math.round(max)}{unit}</span>
        <span style={{ position: 'absolute', left: 0, top: 67, fontSize: 9, fontWeight: 800, color: '#B0B8C1' }}>{Math.round((max + min) / 2)}{unit}</span>
        <span style={{ position: 'absolute', left: 0, bottom: 22, fontSize: 9, fontWeight: 800, color: '#B0B8C1' }}>{Math.round(min)}{unit}</span>
        <svg viewBox="0 0 100 84" preserveAspectRatio="none" role="img" aria-label={`${title} 월별 변화 그래프`} style={{ width: '100%', height: 144, overflow: 'hidden' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={afterColor} stopOpacity=".26" />
              <stop offset="100%" stopColor={afterColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[10, 43, 76].map((lineY) => <line key={lineY} x1="0" y1={lineY} x2="100" y2={lineY} stroke="#E1E4E8" strokeWidth=".7" vectorEffect="non-scaling-stroke" />)}
          {zeroLineY != null && <line x1="0" y1={zeroLineY} x2="100" y2={zeroLineY} stroke="#C7CDD3" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={path('before')} fill="none" stroke="#ABB3BC" strokeWidth="1.4" strokeDasharray="4 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <path d={path('after')} fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <path d={path('after')} fill="none" stroke={afterColor} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {activeIndex != null && <>
            <rect x={x(activeIndex) - 3.5} y="3" width="7" height="73" rx="2" fill={afterColor} opacity=".1" pointerEvents="none" />
            <line x1={x(activeIndex)} y1="4" x2={x(activeIndex)} y2="76" stroke={afterColor} strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          </>}
          {points.map((point, index) => (
            <rect key={point.label} className="sim-chart-hit-area" x={x(index) - 4.2} y="0" width="8.4" height="84" fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)} onBlur={() => setHoveredIndex(null)}
              onClick={() => {
                setSelectedIndex(index);
                onPointChange?.(points[index]);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedIndex(index);
                  onPointChange?.(points[index]);
                }
              }}
              tabIndex="0" role="button" aria-label={`${point.label}개월차 상세 보기`} style={{ cursor: 'pointer', outline: 'none' }} />
          ))}
          {activeIndex != null && <>
            <circle cx={x(activeIndex)} cy={y(points[activeIndex].before)} r="1.7" fill="#FFFFFF" stroke="#ABB3BC" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <circle cx={x(activeIndex)} cy={y(points[activeIndex].after)} r="2.3" fill="#FFFFFF" stroke={afterColor} strokeWidth="1.6" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          </>}
        </svg>
        <div style={{ position: 'absolute', left: 34, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between' }}>
          {points.map((point, index) => <span key={point.label} style={{ fontSize: 9, fontWeight: 800, color: index % 2 === 0 || index === points.length - 1 ? '#B0B8C1' : 'transparent' }}>{point.label}월</span>)}
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
    <div style={{ background: '#F7F8FA', borderRadius: 12, padding: '11px 12px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={{ fontSize: 11, fontWeight: 900, color: '#8B95A1' }}>가게 운영에 필요한 현금이 모자랄 가능성</p>
        <p style={{ fontSize: 15, fontWeight: 900, color }}>{label(afterProbability)} · {level(afterValue)}</p>
      </div>
      <div style={{ position: 'relative', height: 13, marginTop: 10, borderRadius: 7, background: 'linear-gradient(90deg,#A8D284 0 20%,#FFD66B 20% 40%,#F0968C 40% 100%)' }}>
        <span title={`기준 ${label(beforeProbability)}`} style={{ position: 'absolute', left: `${beforeValue}%`, top: -4, width: 2, height: 21, background: '#525A64', transform: 'translateX(-1px)' }} />
        <span title={`장착 후 ${label(afterProbability)}`} style={{ position: 'absolute', left: `${afterValue}%`, top: -5, width: 10, height: 23, border: `3px solid ${color}`, borderRadius: 7, background: '#fff', transform: 'translateX(-5px)' }} />
      </div>
      <p style={{ marginTop: 8, fontSize: 10.5, color: '#8B95A1', lineHeight: 1.45 }}>임대료·인건비·대출 상환을 반영했을 때, 가게 운영에 필요한 현금이 모자랄 가능성이에요.</p>
    </div>
  );
}
