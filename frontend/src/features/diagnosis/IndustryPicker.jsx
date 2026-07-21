import { useMemo } from 'react';
import { fmtMan } from '../../shared/format';

// 서비스_업종_코드 앞자리 → 소비자 친화 대분류
const GROUPS = [
  { prefix: 'CS1', label: '외식업' },
  { prefix: 'CS2', label: '서비스업' },
  { prefix: 'CS3', label: '소매업' },
];

/**
 * 업종 선택 — 서울시 상권분석서비스에 존재하는 60개 업종을 대분류로 묶어 제공.
 * 선택 시 해당 업종의 실측 표본(서울 점포 수·중위 월매출)을 바로 보여준다.
 */
export default function IndustryPicker({ industries, value, selected, onChange }) {
  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: industries
        .filter((i) => i.code.startsWith(g.prefix))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    })).filter((g) => g.items.length > 0);
  }, [industries]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <p className="label-sm">업종 <span style={{ color: '#D0564C' }}>*</span></p>
        <p style={{ fontSize: 11.5, color: '#C4BAAD', marginTop: 3 }}>
          같은 업종 점포들의 실제 매출 분포와 비교해요
        </p>
      </div>

      <div className="select-wrap">
        <select
          className="select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">업종을 선택해 주세요</option>
          {grouped.map((g) => (
            <optgroup key={g.prefix} label={g.label}>
              {g.items.map((i) => (
                <option key={i.code} value={i.code}>{i.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="select-caret">▾</span>
      </div>

      {selected && (
        <div className="pop" style={{
          background: '#FFF6DD', border: '1.5px solid #F3E4C0', borderRadius: 14,
          padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>📊</span>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#2B2825' }}>
              {selected.name} · 서울시 실측 데이터
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Stat label="비교 점포" value={`${selected.nStores.toLocaleString()}곳`} />
            <Stat label="중위 월매출" value={fmtMan(selected.medianMonthlySales)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1, background: '#fff', borderRadius: 11, padding: '9px 11px' }}>
      <p style={{ fontSize: 10.5, color: '#A79C8E', fontWeight: 700 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 900, color: '#2B2825', marginTop: 2 }}>{value}</p>
    </div>
  );
}
