import { useEffect, useMemo, useState } from 'react';
import { postSimulation } from '../../api/simulation';
import { applyScenarioAdjustments, buildSimRows, buildSimulationPayload } from './sim';
import { SimulationSummaryPanel } from './SimulatorScreen';

const SCENARIO_INIT = { salesDeltaPct: 0, fixedCostDeltaMan: 0, cashDeltaMan: 0 };
// 몬테카를로 위험 계산은 매출·비용의 일상적인 변동성만 흔들어볼 뿐, 지원금 지연·연속된 매출
// 급감 같은 "진짜 위기"는 반영하지 않는다. 그런 위기 상황을 직접 만들어볼 수 있게, 최근 매출
// 하위 구간·비용 상위 구간에 해당하는 값으로 슬라이더를 한 번에 맞춰주는 프리셋을 둔다.
const ADVERSE_PRESET = { salesDeltaPct: -20, fixedCostDeltaMan: 30, cashDeltaMan: -100 };
const SLIDERS = [
  { key: 'salesDeltaPct', label: '매출이 지금보다', unit: '%', min: -30, max: 30, step: 5 },
  { key: 'fixedCostDeltaMan', label: '월 고정비가 지금보다', unit: '만원', min: -100, max: 100, step: 10 },
  { key: 'cashDeltaMan', label: '보유 현금이 지금보다', unit: '만원', min: -500, max: 500, step: 50 },
];
// 슬라이더를 움직이는 동안(드래그 중) 값이 바뀔 때마다 계산을 보내지 않고, 손을 뗀 뒤 잠깐 멈추면
// 그때 한 번만 /api/simulation을 호출한다 — Java 호출이라 비용 문제는 없지만, 매 tick마다
// 요청을 쌓지 않는 게 맞다.
const RECALC_DEBOUNCE_MS = 450;

/**
 * 상황 실험실 — 이미 장착된 조합(추천 Top3든 직접 고른 조합이든)을 그대로 두고,
 * "매출·고정비·보유현금이 지금과 달라지면?"만 가정해서 같은 Java 시뮬레이션 엔진을 다시 돌려본다.
 * 새 계산 로직은 없다(sim.js의 applyScenarioAdjustments가 하는 건 숫자 변환뿐) — 결과 표시도
 * 시뮬레이터 탭과 똑같은 SimulationSummaryPanel을 그대로 재사용한다.
 */
export default function ScenarioLabScreen({ equipped, simulationBase, onBack }) {
  const [scenario, setScenario] = useState(SCENARIO_INIT);
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const basePayload = useMemo(
    () => buildSimulationPayload({ ...simulationBase, equipped }),
    [simulationBase, equipped],
  );
  const isDefault = scenario.salesDeltaPct === 0 && scenario.fixedCostDeltaMan === 0 && scenario.cashDeltaMan === 0;
  const isAdversePreset = scenario.salesDeltaPct === ADVERSE_PRESET.salesDeltaPct
    && scenario.fixedCostDeltaMan === ADVERSE_PRESET.fixedCostDeltaMan
    && scenario.cashDeltaMan === ADVERSE_PRESET.cashDeltaMan;

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

  const simRows = useMemo(() => buildSimRows(simulation), [simulation]);

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="button" className="press-fx" onClick={() => setScenario(ADVERSE_PRESET)} disabled={isAdversePreset} style={{
            border: 'none', background: 'none', padding: 0,
            color: isAdversePreset ? 'var(--muted-faint)' : 'var(--danger)', fontWeight: 800, fontSize: 12,
            cursor: isAdversePreset ? 'default' : 'pointer',
          }}>⚠ 어려운 상황 한 번에 보기</button>
          {!isDefault && (
            <button type="button" className="press-fx" onClick={() => setScenario(SCENARIO_INIT)} style={{
              border: 'none', background: 'none', padding: 0,
              color: 'var(--gold-link)', fontWeight: 800, fontSize: 12, cursor: 'pointer',
            }}>가정 초기화</button>
          )}
        </div>
      </div>

      <SimulationSummaryPanel simulation={simulation} simRows={simRows} loading={loading} error={error} variant="standalone" items={equipped} />
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
