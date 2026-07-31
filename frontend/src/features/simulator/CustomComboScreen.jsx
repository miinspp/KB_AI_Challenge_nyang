import { useState } from 'react';
import { SimulationSummaryPanel } from './SimulatorScreen';

// 맞춤 추천 화면(RecommendScreen)과 같은 방식으로 묶는 카테고리 필터.
const PRODUCT_CATS = [
  ['all', '전체'],
  ['LOAN', '대출'],
  ['GRANT', '지원금'],
  ['SAVINGS', '적금'],
  ['MUTUAL_AID', '공제'],
  ['INSURANCE', '보험'],
];

/**
 * "내가 원하는 상품으로 직접 조합하기" 전용 페이지 — 상황 실험실과 같은 방식으로 시뮬레이터
 * 화면에서 분리했다. 상품 목록을 페이지에 전부 나열하는 대신, 카테고리 안에서도 일정 높이만
 * 보여주고 나머지는 목록 안에서만 스크롤하게 해 한 화면에 너무 많은 상품이 쌓이지 않게 한다.
 * equipped/toggle은 App.jsx가 들고 있는 상태를 그대로 쓰므로, 추천 조합(Top3)에서 이미 선택된
 * 상품이 있다면 여기 들어와도 선택 상태가 그대로 유지된다.
 */
export default function CustomComboScreen({ options, equipped, toggle, simRows, simulation, loading, error, onBack }) {
  const [customCat, setCustomCat] = useState('all');

  const availableCats = PRODUCT_CATS.filter(([key]) => key === 'all' || options.some((item) => item.type === key));
  const visibleOptions = options.filter((item) => customCat === 'all' || item.type === customCat);

  return (
    <div className="acct">
      <div className="acct-bar">
        <button className="hdr-back" onClick={onBack}>‹</button>
        <span className="hdr-title">직접 조합하기</span>
        <span style={{ width: 38 }} />
      </div>

      <div style={{ padding: '2px 22px 0' }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, fontWeight: 700, color: 'var(--muted)' }}>
          {options.length}개 상품 중 원하는 만큼 골라 나만의 조합을 만들어보세요.
        </p>
      </div>

      <div style={{ margin: '14px 22px 0', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 16, padding: '10px 12px 4px' }}>
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

        {/* 드롭다운처럼 일정 부분만 보여주고 나머지는 이 목록 안에서만 스크롤한다 —
            카테고리를 눌러도 페이지 전체가 상품으로 뒤덮이지 않게. */}
        <div className="combo-picker-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
          {visibleOptions.map((item) => {
            const selected = equipped.some((equippedItem) => equippedItem.key === item.key);
            const conflicts = !selected && item.duplicateGroup
              && equipped.some((equippedItem) => equippedItem.duplicateGroup === item.duplicateGroup);
            const eligibility = eligibilityLabel(item.eligibilityStatus);
            const terms = productTerms(item);
            return (
              <button key={item.key} className="press-fx-row" onClick={() => toggle(item)} type="button" aria-pressed={selected} title={item.name || item.short} style={{
                flex: 'none',
                border: selected ? '1.5px solid #E8B93E' : conflicts ? '1.5px solid #E7C7C2' : '1.5px solid #EFE8DB',
                background: selected ? '#FFF6DD' : conflicts ? '#FBF3F1' : '#fff', borderRadius: 14, padding: '11px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', minHeight: 60,
              }}>
                <span className="icon-badge" style={{ flex: 'none', width: 30, height: 30, borderRadius: 10, fontSize: 14, background: item.iconBg, color: item.iconColor, marginTop: 1 }}>{item.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#1E1A14', lineHeight: 1.42, overflowWrap: 'anywhere' }}>{item.name || item.short}</span>
                  {item.reason && <span style={{ display: '-webkit-box', marginTop: 3, overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 1, fontSize: 10.5, lineHeight: 1.35, fontWeight: 700, color: '#8F8779' }}>{item.reason}</span>}
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                    <span style={{ padding: '3px 6px', borderRadius: 7, background: '#F3EEE4', color: '#8F8779', fontSize: 9.5, fontWeight: 800 }}>{terms}</span>
                    <span style={{ padding: '3px 6px', borderRadius: 7, background: eligibility.background, color: eligibility.color, fontSize: 9.5, fontWeight: 800 }}>{eligibility.label}</span>
                  </span>
                  {(conflicts || item.duplicateNotice) && (
                    <span style={{ display: 'block', marginTop: 2, fontSize: 9.5, fontWeight: 800, color: '#B45A51' }}>
                      중복 가입 불가
                    </span>
                  )}
                </span>
                <span style={{ flex: 'none', fontSize: 13, fontWeight: 900, color: selected ? '#C98A00' : '#CBC3B3' }}>{selected ? '✓' : '+'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {equipped.length > 0 ? (
        <SimulationSummaryPanel simulation={simulation} simRows={simRows} loading={loading} error={error} variant="standalone" items={equipped} />
      ) : (
        <section style={{ margin: '14px 22px 0', padding: 24, border: '1.5px dashed var(--border-deep)', borderRadius: 18, textAlign: 'center', background: '#fff' }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#5C5449' }}>상품을 골라보면 예상 결과가 여기 나와요</p>
        </section>
      )}
    </div>
  );
}

function eligibilityLabel(status) {
  if (status === 'PASS') return { label: '조건 충족', background: '#EDF5E1', color: '#5E8A3E' };
  if (status === 'FAIL') return { label: '조건 확인 필요', background: '#FDE8E6', color: '#D0564C' };
  return { label: '조건 확인', background: '#F2ECE1', color: '#8F8779' };
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
