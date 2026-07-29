import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Couple from './Couple';
import { IconSparkle } from '../../shared/Icons';
import { buildComboDetailCandidate, buildSimRows, buildSimulationDetail, SIM_VIEWS, summarizeSimulationForAdvisor } from './sim';
import { requestPortfolioDetail } from '../../api/portfolio';

// 직접 조합하기 드롭다운의 카테고리 — 맞춤 추천 화면(RecommendScreen)과 같은 방식으로 묶는다.
const PRODUCT_CATS = [
  ['all', '전체'],
  ['LOAN', '대출'],
  ['GRANT', '지원금'],
  ['SAVINGS', '적금'],
  ['MUTUAL_AID', '공제'],
  ['INSURANCE', '보험'],
];

export default function SimulatorScreen({
  equipped, options, toggle, simRows, simulation, loading, error,
  riskProfile, simulationReady, topCombos = [], comboSimulations = {},
  comboAnalysisLoading, comboAnalysisDone, comboAnalysisError, equippedComboId, onApplyCombo, onRetryComboAnalysis,
}) {
  // 직접 고른 상품의 "시뮬레이션 요약"은 눌러야만 보여준다(항상 떠 있던 고정 블록 제거).
  // undefined = "아직 아무것도 안 눌렀다" — 이 경우엔 아래 default 값을 매 렌더 다시 계산해서 쓴다.
  // (Top3 계산이 비동기로 끝나기 전엔 topCombos가 비어 있으므로, useState 초기값에 그대로 고정해두면
  //  로딩이 끝난 뒤에도 낡은 값이 남는다 — 그래서 override가 없는 한 매 렌더 새로 계산한다.)
  const [manualSummaryOverride, setManualSummaryOverride] = useState(undefined);
  const [customOpenOverride, setCustomOpenOverride] = useState(undefined);
  const [customCat, setCustomCat] = useState('all');
  // Top3 리스트에서 탭한 조합의 상세 시트 — 목록은 항상 최소한만 보여주고, 눌렀을 때만 "들어가서" 본다.
  const [openComboId, setOpenComboId] = useState(null);

  // AI 조합 분석 중엔 전체화면 테이크오버로 전환한다 — 헤더·탭바·CTA까지 전부 가려서
  // 로딩 중에 뒤로가거나 다른 탭으로 못 옮겨가게 막는다(계산이 끝나야만 사라짐).
  // "분석 시작 전"과 "분석 완료 후"를 comboAnalysisDone 하나로 판단한다 — comboAnalysisLoading은
  // 마운트 직후 아주 잠깐(App.jsx 이펙트가 도는 그 찰나) false일 수 있어서, 그걸로만 판단하면
  // 정상 화면이 한 프레임 노출되거나 테이크오버가 뜨자마자 "완료"로 오인해 닫힐 수 있다.
  const [takeoverVisible, setTakeoverVisible] = useState(
    () => Boolean(riskProfile && simulationReady && !comboAnalysisDone),
  );
  useEffect(() => {
    if (riskProfile && simulationReady && !comboAnalysisDone) setTakeoverVisible(true);
  }, [riskProfile, simulationReady, comboAnalysisDone]);

  if (takeoverVisible) {
    return <ComboLoadingTakeover active={comboAnalysisLoading} onDone={() => setTakeoverVisible(false)} />;
  }

  // 이미 장착된 조합/상품이 있으면 그 맥락을 그대로 이어서 보여준다 — 없으면 아무 것도 펼치지 않는다.
  const defaultManualSummaryOpen = equipped.length > 0 && !topCombos.some((combo) => combo.comboId === equippedComboId);
  const manualSummaryOpen = manualSummaryOverride !== undefined ? manualSummaryOverride : defaultManualSummaryOpen;

  // 직접 상품 고르기 드롭다운 — Top3가 없거나, 이미 Top3에 없는 나만의 조합을 쓰고 있으면 열어둔다.
  const defaultCustomOpen = topCombos.length === 0
    || (equipped.length > 0 && !topCombos.some((combo) => combo.comboId === equippedComboId));
  const customOpen = customOpenOverride !== undefined ? customOpenOverride : defaultCustomOpen;

  const toggleCustom = (item) => {
    toggle(item);
    setManualSummaryOverride(true);
  };

  const openCombo = topCombos.find((combo) => combo.comboId === openComboId) || null;
  const availableCats = PRODUCT_CATS.filter(([key]) => key === 'all' || options.some((item) => item.type === key));
  const visibleOptions = options.filter((item) => customCat === 'all' || item.type === customCat);

  return (
    <div className="scr" style={{ padding: '18px 0 200px', gap: 0 }}>
      {riskProfile && simulationReady && (
        <ComboAdvisorSection
          riskProfile={riskProfile} topCombos={topCombos} comboSimulations={comboSimulations}
          loading={comboAnalysisLoading} error={comboAnalysisError}
          equippedComboId={equippedComboId}
          onOpenCombo={(combo) => { onApplyCombo?.(combo.items); setOpenComboId(combo.comboId); }}
          onRetry={onRetryComboAnalysis}
        />
      )}

      <section style={{ margin: '12px 22px 0' }}>
        <button type="button" className="detail-toggle combo-toggle-row" onClick={() => setCustomOpenOverride(!customOpen)} style={{ marginTop: 0 }}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>내가 원하는 상품으로 직접 조합하기</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted-faint)' }}>{options.length}개 중 하나씩 골라볼 수 있어요</span>
          </span>
          <span aria-hidden="true" style={{ flex: 'none', fontSize: 11, fontWeight: 900, color: '#B0B8C1', transform: customOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }}>▾</span>
        </button>

        {customOpen && (
          <div style={{ marginTop: 8, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 16, padding: '10px 12px 4px' }}>
            {/* 맞춤 추천 화면과 같은 카테고리 필터 — 쭉 나열 대신 대출/지원금/적금 등으로 나눠 보여준다 */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
              {availableCats.map(([key, label]) => {
                const on = customCat === key;
                const count = key === 'all' ? options.length : options.filter((item) => item.type === key).length;
                return (
                  <button key={key} type="button" className="press-fx" onClick={() => setCustomCat(key)} style={{
                    flex: 'none', borderRadius: 10, padding: '6px 11px', fontSize: 11.5, fontWeight: 800,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    border: on ? '1.5px solid var(--gold-deep)' : '1.5px solid var(--border)',
                    background: on ? 'var(--gold)' : '#fff', color: on ? 'var(--ink)' : 'var(--muted)',
                  }}>
                    {label} <span style={{ fontWeight: 700, opacity: .65 }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, paddingBottom: 10 }}>
              {visibleOptions.map((item) => {
                const selected = equipped.some((equippedItem) => equippedItem.key === item.key);
                const conflicts = !selected && item.duplicateGroup
                  && equipped.some((equippedItem) => equippedItem.duplicateGroup === item.duplicateGroup);
                const eligibility = eligibilityLabel(item.eligibilityStatus);
                const terms = productTerms(item);
                return (
                  <button key={item.key} className="press-fx-row" onClick={() => toggleCustom(item)} type="button" aria-pressed={selected} title={item.name || item.short} style={{
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
          </div>
        )}
      </section>

      {manualSummaryOpen && (
        <SimulationSummaryPanel simulation={simulation} simRows={simRows} loading={loading} error={error} variant="standalone" items={equipped} />
      )}

      {openCombo && (
        <ComboDetailSheet key={openCombo.comboId} combo={openCombo} riskProfile={riskProfile}
          simulation={comboSimulations[openCombo.comboId]}
          isEquipped={equippedComboId === openCombo.comboId}
          onClose={() => setOpenComboId(null)} />
      )}
    </div>
  );
}

// ── 조합 분석 AI — 성향분석 완료 후 Top3 조합 계산 로딩 + 결과 카드 ──
// 1·2·3 순위를 숫자 대신 한눈에 알아볼 수 있는 메달 아이콘으로 보여준다.
const MEDALS = ['🥇', '🥈', '🥉'];
function RankIcon({ rank, size = 20 }) {
  const medal = MEDALS[rank - 1];
  if (medal) return <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>{medal}</span>;
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: '#EEF0F3', display: 'grid', placeItems: 'center',
      fontSize: size * 0.55, fontWeight: 900, color: 'var(--ink)',
    }}>{rank}</span>
  );
}

function ComboAdvisorSection({ riskProfile, topCombos, comboSimulations, loading, error, equippedComboId, onOpenCombo, onRetry }) {
  const showEmpty = !loading && !error && topCombos.length === 0;
  return (
    <section style={{ margin: '14px 22px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 9 }}>
        <p style={{ fontSize: 13.5, fontWeight: 900, color: '#191B1F' }}>AI 추천 조합 Top3</p>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--gold-link)', background: '#FFF6DD', padding: '2px 8px', borderRadius: 8 }}>
          {riskProfile.profileLabel || '내'} 성향 기준
        </span>
      </div>

      {!loading && error && (
        <div style={{ padding: '18px 16px', border: '1.5px dashed var(--border-deep)', borderRadius: 16, textAlign: 'center', background: '#fff' }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--danger)' }}>{friendlyError(error)}</p>
          <button type="button" className="press-fx" onClick={onRetry} style={{ marginTop: 8, border: 'none', background: 'none', color: 'var(--gold-link)', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>다시 분석하기</button>
        </div>
      )}

      {showEmpty && (
        <div style={{ padding: '18px 16px', border: '1.5px dashed var(--border-deep)', borderRadius: 16, textAlign: 'center', background: '#fff' }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#525A64' }}>지금 조건으로는 만들 수 있는 조합이 없어요</p>
          <p style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: '#9FA6B0' }}>아래에서 직접 골라볼 수 있어요.</p>
        </div>
      )}

      {!loading && !error && topCombos.length > 0 && (
        <div className="combo-list">
          {topCombos.map((combo, index) => (
            <ComboAdviceCard key={combo.comboId} combo={combo} index={index}
              simulation={comboSimulations[combo.comboId]}
              isEquipped={equippedComboId === combo.comboId}
              onOpen={() => onOpenCombo(combo)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ComboLoadingRing({ percent }) {
  const size = 128; const stroke = 10; const radius = (size - stroke) / 2; const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '4px auto 0' }}>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: -20, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,188,0,.32), rgba(255,188,0,0) 70%)',
      }} />
      <svg width={size} height={size} style={{ position: 'relative', display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--gold)" strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .35s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 27, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.5 }}>{Math.round(percent)}%</span>
      </div>
    </div>
  );
}

const COMBO_LOADING_STEPS = [
  '성향에 맞는 상품을 고르고 있어요',
  '조합별로 현금흐름을 계산하고 있어요',
  'AI가 성향에 가장 맞는 조합을 분석하고 있어요',
];

/**
 * AI 조합 분석 중 전체화면을 덮는 테이크오버 — 헤더·탭바·CTA까지 전부 이 위에 가려지므로
 * 로딩 중엔 뒤로가기·다른 탭 이동이 화면상 불가능해진다(클릭이 이 오버레이에서 막힘).
 * 배경은 그라데이션 없이 순백, 캐릭터 두 마리만 크게 띄운다.
 * active(=comboAnalysisLoading)가 꺼지면 곧장 사라지지 않고 100%를 잠깐 보여준 뒤 onDone을 호출한다.
 */
function ComboLoadingTakeover({ active, onDone }) {
  const [percent, setPercent] = useState(4);
  const [stepIndex, setStepIndex] = useState(0);
  // active가 "아직 시작 전(false)"인지 "이미 시작했다가 끝나서(false)"인지 구분하기 위한 플래그.
  // 이게 없으면 마운트 직후(App.jsx 이펙트가 돌기 전 그 찰나) active=false를 완료로 오인해
  // 시작하자마자 100%를 찍고 사라져버린다.
  const wasActive = useRef(false);

  useEffect(() => {
    if (!active) return undefined;
    wasActive.current = true;
    const tick = setInterval(() => setPercent((p) => (p < 92 ? p + Math.max(1, (92 - p) * 0.07) : p)), 220);
    const step = setInterval(() => setStepIndex((i) => (i + 1) % COMBO_LOADING_STEPS.length), 1500);
    return () => { clearInterval(tick); clearInterval(step); };
  }, [active]);

  useEffect(() => {
    if (active || !wasActive.current) return undefined;
    setPercent(100);
    const timeout = setTimeout(() => onDone?.(), 550);
    return () => clearTimeout(timeout);
  }, [active, onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'var(--canvas)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px',
    }}>
      <div style={{ position: 'relative', width: 210, height: 190, transform: 'scale(1.4)' }}>
        <Couple reaction="idle" reactionKey={0} needsAttention={false} />
      </div>
      <div style={{ marginTop: 58 }}>
        <ComboLoadingRing percent={percent} />
      </div>
      <p style={{ marginTop: 22, fontSize: 16, fontWeight: 900, color: 'var(--ink)', textAlign: 'center' }}>
        {percent >= 100 ? '분석이 끝났어요' : COMBO_LOADING_STEPS[stepIndex]}
      </p>
      <p style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', minHeight: 18 }}>
        {percent >= 100 ? '' : '보통 10초 이내에 끝나요.'}
      </p>
    </div>
  );
}

// 토스증권 "실시간 이슈" 리스트 참고 — 순위·제목·한 줄 요약·메타 정보만 보여주고,
// 나머지(수치·근거·AI 분석)는 전부 탭해서 "들어가야" 보이는 상세 시트로 옮긴다.
function ComboAdviceCard({ combo, index, simulation, isEquipped, onOpen }) {
  const metrics = summarizeSimulationForAdvisor(simulation);
  const safetyPercent = metrics ? Math.max(4, Math.min(100, Math.round((1 - metrics.cashShortageRisk) * 100))) : null;
  const isSafe = safetyPercent == null || safetyPercent >= 50;
  const trendColor = safetyPercent == null ? 'var(--muted-faint)' : isSafe ? 'var(--green-text)' : 'var(--danger)';

  return (
    <button type="button" className="combo-row press-fx-row" onClick={onOpen} style={{
      animationDelay: `${index * 90}ms`,
      width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
      flexDirection: 'row', alignItems: 'center', gap: 11,
      margin: isEquipped ? '0 -15px' : '0',
      padding: isEquipped ? '15px 15px' : '15px 0',
      background: isEquipped ? '#FFF6DD' : 'transparent',
      borderRadius: isEquipped ? 14 : 0,
    }}>
      <div className={combo.rank === 1 ? 'combo-rank-badge--top' : undefined} style={{ flex: 'none', width: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderRadius: '50%' }}>
        <RankIcon rank={combo.rank} />
        <span aria-hidden="true" style={{ fontSize: 8.5, fontWeight: 900, color: trendColor, lineHeight: 1 }}>{isSafe ? '▲' : '▼'}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{combo.headline}</span>
          {isEquipped
            ? <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 900, color: 'var(--gold-link)' }}>선택됨</span>
            : combo.rank === 1 && (
              <span style={{ flex: 'none', fontSize: 9, fontWeight: 900, color: '#fff', background: 'var(--gold-link)', padding: '2px 6px', borderRadius: 7 }}>가장 잘 맞아요</span>
            )}
        </div>
        <p style={{ display: '-webkit-box', marginTop: 3, overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, fontSize: 11, lineHeight: 1.4, fontWeight: 700, color: 'var(--muted)' }}>{combo.reason}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
          {combo.items.slice(0, 3).map((item) => (
            <span key={item.key} className="icon-badge" style={{ width: 15, height: 15, borderRadius: 5, background: item.iconBg, color: item.iconColor, fontSize: 7.5, flex: 'none' }}>{item.icon}</span>
          ))}
          {metrics && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-faint)' }}>
              상품 {combo.items.length}개 · 부족위험 {Math.round(metrics.cashShortageRisk * 100)}%
            </span>
          )}
        </div>
      </div>

      <span aria-hidden="true" style={{ flex: 'none', fontSize: 17, fontWeight: 700, color: '#C7CDD3' }}>›</span>
    </button>
  );
}

// Top3 로우를 탭하면 "들어가서" 보는 상세 시트 — 수치·근거·AI 분석을 한 곳에 모은다.
// 목록에서 보여주지 않던 내용은 전부 여기서 comboSimulations(이미 계산된 값)만 그대로 인용한다.
// 행을 누르는 순간 이 조합이 이미 장착되므로(App.jsx onOpenCombo), 여기엔 별도의 "적용하기" 버튼이 없다 —
// 시트는 "지금 보고 있는 조합 = 지금 장착된 조합"을 그대로 설명해주는 역할만 한다.
// .scr에 걸린 scrIn 애니메이션(transform)이 자손의 position:fixed를 가둬버리므로,
// body에 직접 렌더한다(InfoScreen.jsx의 바텀시트와 동일한 이유).
function ComboDetailSheet({ combo, simulation, riskProfile, onClose }) {
  const metrics = summarizeSimulationForAdvisor(simulation);
  const safetyPercent = metrics ? Math.max(4, Math.min(100, Math.round((1 - metrics.cashShortageRisk) * 100))) : null;
  const safetyColor = safetyPercent == null ? 'var(--border-deep)'
    : safetyPercent >= 80 ? 'var(--green-text)' : safetyPercent >= 50 ? 'var(--gold-link)' : 'var(--danger)';

  const [aiOpen, setAiOpen] = useState(false);
  const [aiDetail, setAiDetail] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const fetchAiDetail = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await requestPortfolioDetail({
        riskProfile,
        candidate: buildComboDetailCandidate(combo, simulation),
        headline: combo.headline,
        reason: combo.reason,
        caution: combo.caution || '',
      });
      setAiDetail(res && (res.fit || res.strength) ? res : { fit: combo.reason, strength: '', caution: combo.caution || '' });
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiClick = () => {
    const next = !aiOpen;
    setAiOpen(next);
    if (next && !aiDetail && !aiLoading) fetchAiDetail();
  };

  return createPortal(
    <div className="sheet-dim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {/* 스크롤해도 항상 보이는 헤더 — "뒤로가기 안 보인다"는 문제를 막기 위해 닫기 버튼을 고정한다 */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', paddingBottom: 12, marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
          <div className="sheet-grip"><span /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={onClose} aria-label="닫기" className="press-fx" style={{
              flex: 'none', width: 32, height: 32, border: 'none', borderRadius: 10, background: 'var(--chip)',
              color: 'var(--ink-soft)', fontSize: 16, fontWeight: 900, cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}>‹</button>
            <span style={{ flex: 'none', display: 'grid', placeItems: 'center' }}><RankIcon rank={combo.rank} size={24} /></span>
            <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{combo.headline}</p>
          </div>
          <p style={{ marginTop: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--gold-link)' }}>지금 이 조합으로 장착해서 보고 있어요</p>
        </div>

        {/* 상품 이름은 아래 "시뮬레이션 요약 > 이 숫자에 포함된 상품"에 풀네임으로 나오므로
            여기서 축약된 칩으로 중복 표시하지 않는다.
            정보가 한 덩어리로 쭉 이어지지 않도록 "안정도"·"AI 설명"을 각자 카드로 나눈다. */}
        {metrics && (
          <div style={{ marginTop: 14, padding: '13px 14px', borderRadius: 14, background: 'var(--warm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, color: 'var(--muted-mid)' }}>
              <span>이 조합의 안정도</span>
              <span style={{ color: safetyColor }}>여유현금 {metrics.monthlyNetCashManwon}만원 · 부족위험 {Math.round(metrics.cashShortageRisk * 100)}%</span>
            </div>
            <div className="combo-fitbar">
              <div className="combo-fitbar__fill" style={{ width: `${safetyPercent}%`, background: safetyColor }} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, padding: '13px 14px', borderRadius: 14, border: '1.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted-mid)' }}>AI 설명</p>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 600, color: 'var(--ink-soft)' }}>{combo.reason}</p>
          {combo.caution && <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger)' }}>{combo.caution}</p>}
        </div>

        <SimulationSummaryPanel simulation={simulation} simRows={buildSimRows(simulation)} loading={false} error="" variant="nested" items={combo.items} />

        <button type="button" className="combo-ai-btn press-fx" onClick={handleAiClick} disabled={aiLoading} style={{
          marginTop: 14, height: 46, border: 'none', borderRadius: 13, fontSize: 13.5, fontWeight: 900,
          cursor: aiLoading ? 'default' : 'pointer', color: 'var(--ink)',
        }}>
          {!aiLoading && <IconSparkle size={16} />}
          <span>{aiLoading ? 'AI가 분석하고 있어요…' : aiOpen ? '분석 결과 접기' : 'AI 분석하기'}</span>
        </button>
        {!aiOpen && !aiLoading && (
          <p style={{ marginTop: 6, textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--muted-faint)' }}>
            숨은 장점과 확인할 점까지 짚어드려요
          </p>
        )}

        {aiOpen && (
          <div className="evidence-box">
            {aiLoading && (
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>AI가 더 자세히 분석하고 있어요…</p>
            )}
            {!aiLoading && aiError && (
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>
                불러오지 못했어요: {aiError}{' '}
                <button type="button" className="press-fx" onClick={fetchAiDetail} style={{ border: 'none', background: 'none', color: 'var(--gold-link)', fontWeight: 800, cursor: 'pointer', padding: 0 }}>다시 시도</button>
              </p>
            )}
            {!aiLoading && !aiError && aiDetail && (
              <>
                {aiDetail.fit && (
                  <div className="evidence-row">
                    <span className="evidence-k">왜 맞나요</span>
                    <span className="evidence-v">{aiDetail.fit}</span>
                  </div>
                )}
                {aiDetail.strength && (
                  <div className="evidence-row">
                    <span className="evidence-k">장점</span>
                    <span className="evidence-v">{aiDetail.strength}</span>
                  </div>
                )}
                {aiDetail.caution && (
                  <div className="evidence-row">
                    <span className="evidence-k">확인할 점</span>
                    <span className="evidence-v">{aiDetail.caution}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// 조합 카드를 펼쳤을 때(nested) / 직접 고른 상품 조합일 때(standalone) 공용으로 쓰는
// "시뮬레이션 요약" — 실제 시뮬레이션 엔진(comboSimulations 또는 equipped 기반 simulation) 결과를
// 그대로 보여줄 뿐, 여기서 새 숫자를 계산하지 않는다.
function SimulationSummaryPanel({ simulation, simRows, loading, error, variant = 'standalone', items = [] }) {
  const [view, setView] = useState('cash');
  const [salesCase, setSalesCase] = useState('average');
  const [activeMonth, setActiveMonth] = useState(null);

  const detail = useMemo(() => buildSimulationDetail(simulation), [simulation]);
  const baseView = detail.views[view] || detail.views.cash;
  const current = view === 'sales' && baseView.scenarios?.[salesCase]
    ? { ...baseView, ...baseView.scenarios[salesCase] }
    : baseView;
  const hasConstraintIssue = Boolean(simulation && !simulation.constraints?.repaymentBurdenPassed);
  const riskTone = simulation?.confidence?.level === 'LOW'
    ? 'base'
    : hasConstraintIssue || detail.riskAfter > detail.riskBefore ? 'bad'
    : detail.riskAfter < detail.riskBefore ? 'good' : 'base';
  const hasSimulationData = Boolean(simulation?.baseline?.monthlyCashFlows?.length);

  const isNested = variant === 'nested';
  const Wrapper = isNested ? 'div' : 'section';
  const wrapperStyle = isNested
    ? { marginTop: 12, padding: '13px 14px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 14 }
    : { margin: '14px 22px 0', padding: '16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14 };

  return (
    <Wrapper style={wrapperStyle}>
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

      {/* 목록·칩에서는 이름이 잘려 보이니, 이 숫자들이 어떤 상품 조합인지 여기서 풀네임으로 다시 밝힌다 */}
      {items.length > 0 && (
        <div style={{ padding: '11px 12px', borderRadius: 12, background: 'var(--warm)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted-mid)' }}>이 숫자에 포함된 상품 {items.length}개</p>
          {items.map((item) => (
            <div key={item.key || item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="icon-badge" style={{ flex: 'none', width: 22, height: 22, borderRadius: 8, background: item.iconBg, color: item.iconColor, fontSize: 10.5 }}>{item.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{item.name || item.short}</span>
            </div>
          ))}
        </div>
      )}

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
                <button key={item.key} type="button" className="press-fx" onClick={() => { setView(item.key); setActiveMonth(null); }} style={{
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
                  <button key={key} type="button" className="press-fx" onClick={() => { setSalesCase(key); setActiveMonth(null); }} style={{
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {current.facts.map((fact) => (
              <div key={fact.k} style={{ display: 'flex', alignItems: 'baseline', gap: 12, borderTop: '1.5px solid #EAECEF', paddingTop: 9 }}>
                <p style={{ flex: 'none', width: 152, fontSize: 10.5, fontWeight: 800, color: '#9FA6B0', lineHeight: 1.4 }}>{fact.k}</p>
                <p style={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, fontWeight: 900, color: '#191B1F', lineHeight: 1.3 }}>{fact.v}</p>
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
    </Wrapper>
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
