import { useEffect, useMemo, useState } from 'react';
import { postSimulation } from '../../api/simulation';
import { applyScenarioAdjustments, buildSimRows, buildSimulationPayload, summarizeConstraintCheck } from './sim';
import { SimulationSummaryPanel } from './SimulatorScreen';

const SCENARIO_INIT = { salesDeltaPct: 0, fixedCostDeltaMan: 0, cashDeltaMan: 0 };
// 슬라이더 3개를 하나씩 옮기기 번거로운 사람을 위한 "자주 겪는 상황" 프리셋 — 값은 전부
// 위 슬라이더와 같은 salesDeltaPct/fixedCostDeltaMan/cashDeltaMan 조합이라 선택 즉시 슬라이더도 같이 움직인다.
const SCENARIO_PRESETS = [
  { key: 'default', label: '지금 그대로', values: { salesDeltaPct: 0, fixedCostDeltaMan: 0, cashDeltaMan: 0 } },
  { key: 'sales_down', label: '매출이 크게 줄었을 때 (매출 -20%)', values: { salesDeltaPct: -20, fixedCostDeltaMan: 0, cashDeltaMan: 0 } },
  { key: 'sales_up', label: '매출이 크게 늘었을 때 (매출 +20%)', values: { salesDeltaPct: 20, fixedCostDeltaMan: 0, cashDeltaMan: 0 } },
  { key: 'fixed_cost_up', label: '임대료·인건비가 오를 때 (고정비 +50만원)', values: { salesDeltaPct: 0, fixedCostDeltaMan: 50, cashDeltaMan: 0 } },
  { key: 'cash_down', label: '보유 현금이 크게 줄었을 때 (현금 -300만원)', values: { salesDeltaPct: 0, fixedCostDeltaMan: 0, cashDeltaMan: -300 } },
  { key: 'crisis', label: '매출 감소와 고정비 상승이 겹칠 때', values: { salesDeltaPct: -20, fixedCostDeltaMan: 30, cashDeltaMan: -200 } },
];
const SLIDERS = [
  { key: 'salesDeltaPct', label: '매출이 지금보다', unit: '%', min: -30, max: 30, step: 5 },
  { key: 'fixedCostDeltaMan', label: '월 고정비가 지금보다', unit: '만원', min: -100, max: 100, step: 10 },
  { key: 'cashDeltaMan', label: '보유 현금이 지금보다', unit: '만원', min: -500, max: 500, step: 50 },
];
// 슬라이더를 움직이는 동안(드래그 중) 값이 바뀔 때마다 계산을 보내지 않고, 손을 뗀 뒤 잠깐 멈추면
// 그때 한 번만 /api/simulation을 호출한다 — Java 호출이라 비용 문제는 없지만, 매 tick마다
// 요청을 쌓지 않는 게 맞다.
const RECALC_DEBOUNCE_MS = 450;
// 대안 조합을 재탐색할 때 확인해볼 후보 수 — Top3 중 지금 조합을 뺀 나머지만 순서대로 확인한다.
const MAX_ALT_CANDIDATES = 3;

function isFailing(simulation) {
  if (!simulation) return false;
  return !simulation.constraints?.repaymentBurdenPassed || (simulation.constraints?.violations?.length ?? 0) > 0;
}

function passesConstraints(simulation) {
  return Boolean(simulation?.constraints?.repaymentBurdenPassed) && (simulation?.constraints?.violations?.length ?? 0) === 0;
}

/**
 * 상황 실험실 — 이미 장착된 조합(추천 Top3든 직접 고른 조합이든)을 그대로 두고,
 * "매출·고정비·보유현금이 지금과 달라지면?"만 가정해서 같은 Java 시뮬레이션 엔진을 다시 돌려본다.
 * 새 계산 로직은 없다(sim.js의 applyScenarioAdjustments가 하는 건 숫자 변환뿐) — 결과 표시도
 * 시뮬레이터 탭과 똑같은 SimulationSummaryPanel을 그대로 재사용한다.
 *
 * 가정을 바꿔 지금 조합이 상환부담 기준을 못 넘기면("만약에" 탈락), Top3 안의 다른 조합에
 * 같은 가정을 적용해 통과하는 대안을 자동으로 찾아 "조합 A(지금) vs 조합 B(AI 재탐색)"로 비교해 보여준다.
 */
export default function ScenarioLabScreen({ equipped, simulationBase, topCombos = [], equippedComboId, onApplyCombo, onBack }) {
  const [scenario, setScenario] = useState(SCENARIO_INIT);
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [altCombo, setAltCombo] = useState(null); // { comboId, headline, items, simulation } | null
  const [altLoading, setAltLoading] = useState(false);

  const basePayload = useMemo(
    () => buildSimulationPayload({ ...simulationBase, equipped }),
    [simulationBase, equipped],
  );
  const isDefault = scenario.salesDeltaPct === 0 && scenario.fixedCostDeltaMan === 0 && scenario.cashDeltaMan === 0;
  const activePresetKey = SCENARIO_PRESETS.find((preset) => preset.values.salesDeltaPct === scenario.salesDeltaPct
    && preset.values.fixedCostDeltaMan === scenario.fixedCostDeltaMan
    && preset.values.cashDeltaMan === scenario.cashDeltaMan)?.key || 'custom';
  const currentComboId = equippedComboId || [...equipped].map((item) => item.key).sort().join('+');
  const currentCombo = topCombos.find((combo) => combo.comboId === currentComboId);
  const currentLabel = currentCombo?.headline || equipped.map((item) => item.short || item.name).join(' + ') || '지금 조합';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const timeout = setTimeout(() => {
      const payload = applyScenarioAdjustments(basePayload, scenario);
      postSimulation(payload)
        .then((result) => { if (alive) setSimulation(result); })
        .catch((e) => { if (alive) setError(e.message); })
        .finally(() => { if (alive) setLoading(false); });
    }, RECALC_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timeout); };
  }, [basePayload, scenario]);

  // 지금 조합이 이 가정에서 제약을 못 넘기면, Top3의 다른 조합에 같은 가정을 적용해
  // 통과하는 대안을 찾는다 — 새 계산 로직이 아니라 buildSimulationPayload/postSimulation을
  // 조합만 바꿔 재사용한다(위 이펙트와 동일한 엔진 호출).
  useEffect(() => {
    if (!simulation || !isFailing(simulation)) { setAltCombo(null); setAltLoading(false); return undefined; }
    const alternates = topCombos.filter((combo) => combo.comboId !== currentComboId);
    if (alternates.length === 0) { setAltCombo(null); setAltLoading(false); return undefined; }

    let alive = true;
    setAltLoading(true);
    setAltCombo(null);
    (async () => {
      let found = null;
      for (const combo of alternates.slice(0, MAX_ALT_CANDIDATES)) {
        try {
          const payload = applyScenarioAdjustments(
            buildSimulationPayload({ ...simulationBase, equipped: combo.items }),
            scenario,
          );
          // eslint-disable-next-line no-await-in-loop -- 통과하는 첫 대안을 찾으면 즉시 멈춰야 해서 순차 호출한다.
          const result = await postSimulation(payload);
          if (passesConstraints(result)) { found = { ...combo, simulation: result }; break; }
        } catch {
          // 이 후보는 건너뛰고 다음 후보를 본다.
        }
      }
      if (alive) { setAltCombo(found); setAltLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- topCombos/simulationBase/currentComboId는 상위에서 안정적으로 내려오므로 simulation 변화 기준으로만 재탐색한다.
  }, [simulation]);

  const simRows = useMemo(() => buildSimRows(simulation), [simulation]);
  const showCompare = !loading && isFailing(simulation) && topCombos.length > 1;

  return (
    <div className="acct">
      <div className="acct-bar">
        <button className="hdr-back" onClick={onBack}>‹</button>
        <span className="hdr-title">상황 실험실</span>
        <span style={{ width: 38 }} />
      </div>

      <div style={{ padding: '2px 22px 0' }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, fontWeight: 700, color: 'var(--muted)' }}>
          지금 선택한 상품 조합은 그대로 두고, 매출이나 비용이 달라지는 상황만 가정해볼 수 있어요.
        </p>
      </div>

      <div style={{ margin: '14px 22px 0', padding: '17px 16px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {SLIDERS.map((slider) => (
          <GaugeSlider key={slider.key} {...slider} value={scenario[slider.key]}
            onChange={(value) => setScenario((current) => ({ ...current, [slider.key]: value }))} />
        ))}

        {!isDefault && (
          <button type="button" className="press-fx" onClick={() => setScenario(SCENARIO_INIT)} style={{
            alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0,
            color: 'var(--gold-link)', fontWeight: 800, fontSize: 12, cursor: 'pointer',
          }}>가정 초기화</button>
        )}
      </div>

      {/* 슬라이더 3개를 직접 옮기지 않아도, 자주 겪는 상황 하나를 고르면 슬라이더까지 한번에 맞춰준다. */}
      <section style={{ margin: '12px 22px 0' }}>
        <label htmlFor="scenario-preset" style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 7 }}>
          자주 겪는 상황으로 빠르게 보기
        </label>
        <div style={{ position: 'relative' }}>
          <select
            id="scenario-preset"
            value={activePresetKey === 'custom' ? '' : activePresetKey}
            onChange={(e) => {
              const preset = SCENARIO_PRESETS.find((item) => item.key === e.target.value);
              if (preset) setScenario(preset.values);
            }}
            style={{
              width: '100%', height: 46, borderRadius: 13, border: '1.5px solid var(--border-strong)',
              background: '#fff', padding: '0 34px 0 14px', fontSize: 13, fontWeight: 800, color: 'var(--ink)',
              appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
            }}
          >
            <option value="" disabled>{activePresetKey === 'custom' ? '직접 조정한 값이에요' : '상황을 선택하세요'}</option>
            {SCENARIO_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>
          <span aria-hidden="true" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 900, color: '#B6AE9F', pointerEvents: 'none' }}>▾</span>
        </div>
      </section>

      {showCompare && (
        <ComboCompareSection
          current={{ label: currentLabel, rank: currentCombo?.rank, items: equipped, simulation }}
          alt={altCombo}
          altLoading={altLoading}
          onSwitch={altCombo ? () => onApplyCombo?.(altCombo.items) : undefined}
        />
      )}

      <SimulationSummaryPanel simulation={simulation} simRows={simRows} loading={loading} error={error} items={equipped} />
    </div>
  );
}

// "만약에" 가정을 바꿔 지금 조합이 탈락하면(제약 위반), 위에 조합 A(가정 변경 전)/조합 B(AI 자동 재탐색)를
// 나란히 보여준다. 아래 SimulationSummaryPanel은 항상 "지금 장착된 조합" 기준으로 그대로 유지된다.
function ComboCompareSection({ current, alt, altLoading, onSwitch }) {
  const currentCheck = summarizeConstraintCheck(current.simulation);
  const altCheck = alt ? summarizeConstraintCheck(alt.simulation) : null;

  return (
    <section style={{ margin: '14px 22px 0' }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--ink)', marginBottom: 9 }}>
        이 가정에서는 지금 조합이 기준을 넘겨요 — 대안을 같이 볼게요
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ComboCompareCard tone="bad" title="조합 A · 가정 변경 전" subtitle={current.label} items={current.items} check={currentCheck} />

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span aria-hidden="true" style={{ fontSize: 15, fontWeight: 900, color: '#CBC3B3' }}>↓ AI 자동 재탐색</span>
        </div>

        {altLoading && (
          <div style={{ padding: '18px', border: '1.5px dashed var(--border-deep)', borderRadius: 16, textAlign: 'center', background: '#fff' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#8F8779' }}>같은 가정으로 다른 조합을 다시 계산하고 있어요…</p>
          </div>
        )}
        {!altLoading && alt && (
          <ComboCompareCard tone="good" title="조합 B · AI 자동 재탐색 결과" subtitle={alt.headline} items={alt.items} check={altCheck}
            badge="이 가정에서 통과" onSwitch={onSwitch} />
        )}
        {!altLoading && !alt && (
          <div style={{ padding: '18px', border: '1.5px dashed var(--border-deep)', borderRadius: 16, textAlign: 'center', background: '#fff' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: '#5C5449' }}>이 가정을 통과하는 다른 조합을 찾지 못했어요</p>
            <p style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: '#A39B8C' }}>가정을 조금 완화해서 다시 확인해 보세요.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ComboCompareCard({ tone, title, subtitle, items, check, badge, onSwitch }) {
  const accent = tone === 'good' ? '#5E8A3E' : '#D0564C';
  const border = tone === 'good' ? '#CFE3BC' : '#F3D3CD';
  const bg = tone === 'good' ? '#F2F8EC' : '#FDF2F0';
  return (
    <div style={{ border: `1.5px solid ${border}`, borderRadius: 16, background: bg, padding: '14px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 900, color: accent }}>{title}</p>
        {badge && <span style={{ flex: 'none', fontSize: 9.5, fontWeight: 900, color: '#fff', background: accent, padding: '2px 7px', borderRadius: 7 }}>{badge}</span>}
      </div>
      <p style={{ marginTop: 4, fontSize: 14.5, fontWeight: 900, color: '#1E1A14', overflowWrap: 'anywhere' }}>{subtitle}</p>
      <p style={{ marginTop: 2, fontSize: 10.5, fontWeight: 700, color: '#8F8779', overflowWrap: 'anywhere' }}>
        {items.map((item) => item.short || item.name).join(' + ')}
      </p>

      {check && (
        <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7, borderTop: `1px solid ${tone === 'good' ? '#DCEBCB' : '#F6DCD8'}`, paddingTop: 10 }}>
          <CompareRow label="상환부담(DSR)" value={`${check.dsrPct}% · 기준 30% ${check.dsrPassed ? '이내' : '초과'}`} bad={!check.dsrPassed} />
          <CompareRow label="몬테카를로 판정" value={check.passed ? `통과 (${check.simulationCount.toLocaleString()}회)` : '제약 위반 → 탈락'} bad={!check.passed} />
          <CompareRow label="현금부족 확률" value={`${check.cashShortageRiskPct}%`} bad={check.cashShortageRiskPct >= 20} />
        </div>
      )}

      {tone === 'good' && onSwitch && (
        <button type="button" className="press-fx" onClick={onSwitch} style={{
          marginTop: 12, width: '100%', height: 40, border: 'none', borderRadius: 11,
          background: accent, color: '#fff', fontSize: 12.5, fontWeight: 900, cursor: 'pointer',
        }}>이 조합으로 바꾸기</button>
      )}
    </div>
  );
}

function CompareRow({ label, value, bad }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8F8779' }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 900, color: bad ? '#D0564C' : '#3F6B2A' }}>{value}</span>
    </div>
  );
}

// 원형 다이얼이 아니라 가로 슬라이더 + 게이지 채움 막대 — 값이 커질수록 트랙이 채워지는
// .combo-fitbar와 같은 시각 언어를 그대로 가져와, 숫자를 직접 타이핑하지 않고도 감으로 조절하게 한다.
function GaugeSlider({ label, value, min, max, step, unit, onChange }) {
  const percent = ((value - min) / (max - min)) * 100;
  const displayValue = `${value > 0 ? '+' : ''}${value}${unit}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: value === 0 ? 'var(--muted-mid)' : 'var(--gold-link)' }}>{displayValue}</span>
      </div>
      <input
        type="range" className="scenario-slider" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${percent}%, var(--border-strong) ${percent}%, var(--border-strong) 100%)` }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 700, color: 'var(--muted-faint)' }}>
        <span>{min}{unit}</span>
        <span>0{unit}</span>
        <span>+{max}{unit}</span>
      </div>
    </div>
  );
}
