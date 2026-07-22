import { useMemo, useState } from 'react';
import Couple from './Couple';
import { PRODUCTS } from '../recommend/products';
import { buildSimulationDetail, SIM_VIEWS } from './sim';

export default function SimulatorScreen({ equipped, toggle, simRows, simulation, loading, error }) {
  const [view, setView] = useState('cash');
  const eq = equipped.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
  const detail = useMemo(() => buildSimulationDetail(simulation, equipped), [simulation, equipped]);
  const current = detail.views[view] || detail.views.cash;
  const riskTone = eq.length === 0 ? 'base' : detail.riskAfter <= detail.riskBefore ? 'good' : 'bad';
  const nice = eq.length === 0 || detail.riskAfter <= detail.riskBefore;

  return (
    <div className="scr" style={{ padding: '0 0 130px', gap: 0 }}>
      <div style={{ padding: '2px 22px 12px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: '#2B2825', letterSpacing: -.4 }}>상품을 장착해 보세요</h2>
        <p style={{ marginTop: 4, fontSize: 12.5, color: '#8A8178' }}>아래 상품을 탭하면 슬롯에 장착되고, 가게 지표가 바뀌어요.</p>
      </div>

      <div style={{
        margin: '0 22px', position: 'relative', height: 230, overflow: 'hidden',
        background: 'linear-gradient(180deg,#FFF3D2 0%,#FFF9EF 68%,#E9F2DB 86%,#D8E8C2 100%)',
        border: '1.5px solid #F0E7D6', borderRadius: 22,
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, background: 'linear-gradient(180deg,#B9D69A,#9DC47B)' }} />
        {/* Landscape is the card background above; Couple renders transparent character layers only. */}
        <Couple nice={nice} />
        <div style={{
          position: 'absolute', right: 16, top: 14, bottom: 14, width: 150,
          background: 'rgba(255,255,255,.72)', border: '1.5px solid #F0E7D6', borderRadius: 16,
          padding: 10, display: 'flex', flexDirection: 'column', gap: 8, backdropFilter: 'blur(3px)',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#8A8178', letterSpacing: .3 }}>장착 상품 {eq.length}개</span>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {eq.length > 0 ? eq.map((p) => (
              <button key={p.id} onClick={() => toggle(p.id)} title={`${p.short} 해제`} style={{
                flex: '0 0 48px', borderRadius: 12, cursor: 'pointer',
                border: '1.5px solid ' + p.iconColor, background: p.iconBg,
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', textAlign: 'left',
              }}>
                <span className="icon-badge" style={{ width: 24, height: 24, borderRadius: 8, fontSize: 12, background: '#fff', color: p.iconColor }}>{p.icon}</span>
                <span style={{ flex: 1, fontSize: 10.5, fontWeight: 800, lineHeight: 1.3, color: '#2B2825' }}>{p.short}</span>
              </button>
            )) : (
              <div style={{ flex: 1, borderRadius: 12, border: '1.5px dashed #E4D8C2', background: 'rgba(255,255,255,.5)', display: 'grid', placeItems: 'center', padding: 10, textAlign: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#C4BAAD', lineHeight: 1.45 }}>아래에서 상품을 선택해 주세요</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ margin: '12px 22px 0', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {loading && <p style={{ fontSize: 12, fontWeight: 800, color: '#8A8178' }}>Java 계산 엔진으로 1,000개 시나리오를 계산하고 있어요.</p>}
        {error && <p style={{ fontSize: 12, fontWeight: 800, color: '#D0564C' }}>시뮬레이션 연결 실패: {error}</p>}
        {!loading && !error && simRows.length === 0 && <p style={{ fontSize: 12, fontWeight: 800, color: '#8A8178' }}>시뮬레이션 결과를 불러오는 중이에요.</p>}
        {!loading && simRows.map((m) => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ flex: 'none', width: 80, fontSize: 11.5, fontWeight: 700, color: '#8A8178' }}>{m.name}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#B9B0A4', textDecoration: m.strike, whiteSpace: 'nowrap' }}>{m.before}</span>
            <span style={{ fontSize: 12, color: '#C4BAAD' }}>→</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#2B2825', whiteSpace: 'nowrap' }}>{m.after}</span>
            <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 11, fontWeight: 800, color: m.deltaColor, background: m.deltaBg, padding: '3px 6px', borderRadius: 9, whiteSpace: 'nowrap' }}>{m.delta}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ margin: '12px 22px 0', padding: '15px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14.5, fontWeight: 900, color: '#2B2825', letterSpacing: 0 }}>시뮬레이션 근거</p>
            <p style={{ marginTop: 4, fontSize: 11.5, color: '#8A8178', lineHeight: 1.45 }}>
              월 현금흐름 = 영업현금흐름 + 상품 유입·절감 - 추가 고정유출
            </p>
          </div>
          <span style={{
            flex: 'none', fontSize: 10.5, fontWeight: 900,
            color: riskTone === 'base' ? '#8A8178' : riskTone === 'good' ? '#5E8A3E' : '#D0564C',
            background: riskTone === 'base' ? '#F5EFE3' : riskTone === 'good' ? '#EDF5E1' : '#FDE8E6',
            padding: '5px 8px', borderRadius: 10,
          }}>
            위험 {riskTone === 'base' ? '기준' : riskTone === 'good' ? '완화' : '주의'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, background: '#F7F1E4', padding: 4, borderRadius: 13 }}>
          {SIM_VIEWS.map((v) => {
            const on = view === v.key;
            return (
              <button key={v.key} type="button" onClick={() => setView(v.key)} style={{
                height: 31, border: 'none', borderRadius: 10, cursor: 'pointer',
                background: on ? '#fff' : 'transparent', color: on ? '#2B2825' : '#8A8178',
                fontSize: 10.5, fontWeight: 900, boxShadow: on ? '0 2px 8px rgba(80,60,20,.08)' : 'none',
              }}>
                {v.label}
              </button>
            );
          })}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <p style={{ fontSize: 13, fontWeight: 900, color: '#2B2825' }}>{current.title}</p>
            <p style={{ fontSize: 11, fontWeight: 800, color: current.inverse ? (current.after <= current.before ? '#5E8A3E' : '#D0564C') : (current.after >= current.before ? '#5E8A3E' : '#D0564C') }}>
              {current.before}→{current.after}{current.unit}
            </p>
          </div>
          <p style={{ marginTop: 4, fontSize: 11.5, color: '#8A8178', lineHeight: 1.55 }}>{current.lead}</p>
        </div>

        <MiniCompareChart points={current.points} inverse={current.inverse} unit={current.unit} />

        {view === 'risk' && <RiskGauge before={detail.riskBefore} after={detail.riskAfter} />}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          {current.facts.map((f) => (
            <div key={f.k} style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 8, minWidth: 0 }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#A79C8E' }}>{f.k}</p>
              <p style={{ marginTop: 3, fontSize: 12, fontWeight: 900, color: '#2B2825', lineHeight: 1.25 }}>{f.v}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {detail.summary.map((s) => (
            <div key={s.label} style={{ background: '#FBF7EE', borderRadius: 12, padding: '10px 11px' }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: '#A79C8E' }}>{s.label}</p>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#2B2825' }}>{s.value}</span>
                <span style={{ fontSize: 10.5, fontWeight: 900, color: s.good ? '#5E8A3E' : '#D0564C' }}>{s.delta}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 900, color: '#8A8178' }}>상품별 반영 근거</p>
          {detail.contributions.length > 0 ? detail.contributions.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', paddingTop: 8, borderTop: '1.5px solid #F0E7D6' }}>
              <span className="icon-badge" style={{ width: 28, height: 28, borderRadius: 9, fontSize: 13, background: c.iconBg, color: c.iconColor }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <p style={{ flex: 1, fontSize: 12, fontWeight: 900, color: '#2B2825' }}>{c.name}</p>
                  <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 900, color: c.iconColor, background: c.iconBg, padding: '3px 7px', borderRadius: 8 }}>{c.delta}</span>
                </div>
                <p style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: '#8A7A55', lineHeight: 1.45 }}>{c.formula}</p>
                <p style={{ marginTop: 3, fontSize: 10.8, color: '#A79C8E', lineHeight: 1.45 }}>{c.note}</p>
              </div>
            </div>
          )) : (
            <p style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 9, fontSize: 11.5, color: '#A79C8E', lineHeight: 1.55 }}>
              장착한 상품이 없어서 진단 결과의 기준 현금흐름만 표시하고 있어요.
            </p>
          )}
        </div>

        {(detail.violations.length > 0 || detail.warnings.length > 0) && (
          <div style={{ borderTop: '1.5px solid #F0E7D6', paddingTop: 10 }}>
            <p style={{ fontSize: 11.5, fontWeight: 900, color: detail.violations.length ? '#D0564C' : '#8A8178' }}>
              {detail.violations[0] || detail.warnings[0]}
            </p>
            <p style={{ marginTop: 4, fontSize: 10.5, color: '#A79C8E', lineHeight: 1.45 }}>
              {simulation?.inputAssumptions?.currentCashAssumed
                || simulation?.inputAssumptions?.existingDebtAssumed
                || simulation?.inputAssumptions?.existingMonthlyPaymentAssumed
                ? '입력하지 않은 재무정보에는 화면에 표시된 가정값을 적용했어요.'
                : '입력한 보유현금과 기존 대출 조건을 계산에 반영했어요.'}
              {' '}실제 심사 조건과 금리는 달라질 수 있어요.
            </p>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, padding: '0 22px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#8A8178', marginBottom: 9 }}>
          보유 아이템 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· 탭하여 장착/해제</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {PRODUCTS.map((p) => {
            const on = equipped.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)} style={{
                border: on ? '1.5px solid #E8B93E' : '1.5px solid #F0E7D6',
                background: on ? '#FFF6DD' : '#fff',
                borderRadius: 14, padding: '11px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', minHeight: 52, transition: 'all .2s',
              }}>
                <span className="icon-badge" style={{ width: 30, height: 30, borderRadius: 10, fontSize: 14, background: p.iconBg, color: p.iconColor }}>{p.icon}</span>
                <span style={{ flex: 1, fontSize: 11.5, fontWeight: 800, color: '#2B2825', lineHeight: 1.35 }}>{p.short}</span>
                <span style={{ flex: 'none', fontSize: 13, fontWeight: 900, color: on ? '#C98A00' : '#D8CDBB' }}>{on ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniCompareChart({ points, inverse, unit }) {
  const values = points.flatMap((p) => [p.before, p.after]);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const padding = Math.max((rawMax - rawMin) * 0.14, Math.abs(rawMax) * 0.025, 1);
  const max = rawMax + padding;
  const min = Math.max(0, rawMin - padding);
  const span = Math.max(1, max - min);
  const x = (i) => 4 + (i / Math.max(1, points.length - 1)) * 92;
  const y = (v) => 62 - ((v - min) / span) * 54;
  const path = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`).join(' ');
  const afterColor = inverse ? '#8DBB6C' : '#FFBC00';

  return (
    <div style={{ background: '#FFF9EF', border: '1.5px solid #F0E7D6', borderRadius: 14, padding: '11px 10px 9px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <p style={{ fontSize: 10.5, fontWeight: 900, color: '#A79C8E' }}>12개월 예측</p>
        <div style={{ display: 'flex', gap: 9, fontSize: 10.5, fontWeight: 800, color: '#A79C8E' }}>
          <span><i style={{ display: 'inline-block', width: 12, height: 2, borderRadius: 2, background: '#BFB3A2', marginRight: 4, verticalAlign: 'middle' }} />기준</span>
          <span><i style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, background: afterColor, marginRight: 4, verticalAlign: 'middle' }} />장착 후</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 108, paddingLeft: 28 }}>
        <span style={{ position: 'absolute', left: 0, top: 1, fontSize: 8.5, fontWeight: 800, color: '#B9B0A4' }}>{Math.round(max)}{unit}</span>
        <span style={{ position: 'absolute', left: 0, bottom: 18, fontSize: 8.5, fontWeight: 800, color: '#B9B0A4' }}>{Math.round(min)}{unit}</span>
        <svg viewBox="0 0 100 70" preserveAspectRatio="none" role="img" aria-label="기준과 장착 후의 12개월 변화 선 그래프" style={{ width: '100%', height: 84, overflow: 'visible' }}>
          {[8, 35, 62].map((lineY) => <line key={lineY} x1="0" y1={lineY} x2="100" y2={lineY} stroke="#ECE3D5" strokeWidth=".7" vectorEffect="non-scaling-stroke" />)}
          <path d={path('before')} fill="none" stroke="#BFB3A2" strokeWidth="1.5" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
          <path d={path('after')} fill="none" stroke={afterColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <g key={p.label}>
              <circle cx={x(i)} cy={y(p.after)} r="1.6" fill="#FFF9EF" stroke={afterColor} strokeWidth="1.4" vectorEffect="non-scaling-stroke">
                <title>{`${p.label}개월: 기준 ${p.before}${unit}, 장착 후 ${p.after}${unit}`}</title>
              </circle>
            </g>
          ))}
        </svg>
        <div style={{ position: 'absolute', left: 28, right: 0, bottom: 0, display: 'flex', justifyContent: 'space-between' }}>
          {points.map((p, i) => <span key={p.label} style={{ fontSize: 8.5, fontWeight: 800, color: i % 3 === 0 || i === points.length - 1 ? '#B9B0A4' : 'transparent' }}>{p.label}월</span>)}
        </div>
      </div>
    </div>
  );
}

function RiskGauge({ before, after }) {
  const beforeValue = Math.round(before * 10) / 10;
  const afterValue = Math.round(after * 10) / 10;
  const level = (v) => (v < 20 ? '낮음' : v < 40 ? '주의' : '높음');
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
      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 800, color: '#A79C8E' }}>
        <span>0% 낮음</span><span>20% 주의</span><span>40% 이상 높음</span>
      </div>
      <p style={{ marginTop: 8, fontSize: 10.5, color: '#8A8178', lineHeight: 1.45 }}>
        회색선은 현재 기준 {beforeValue}%, 테두리 표시는 상품 장착 후 {afterValue}%예요.
      </p>
    </div>
  );
}
