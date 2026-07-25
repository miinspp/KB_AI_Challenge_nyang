import { useEffect, useMemo, useState } from 'react';
import { fmtMan } from '../../shared/format';

// 서비스_업종_코드 앞자리 → 소비자 친화 대분류
const GROUPS = [
  { prefix: 'CS1', label: '외식업' },
  { prefix: 'CS2', label: '서비스업' },
  { prefix: 'CS3', label: '소매업' },
];

/**
 * 업종 선택 — 서울시 상권분석서비스에 존재하는 업종을 대분류 탭 + 칩(토글)으로 제공.
 * 선택 시 해당 업종의 실측 표본(서울 점포 수·중위 월매출)을 바로 보여준다.
 * 홈택스 연동으로 채워진 경우 '홈택스 불러옴' 배지를 노출하고, 다른 칩을 고르면 직접 수정으로 전환된다.
 */
export default function IndustryPicker({ industries, value, selected, onChange, sourced }) {
  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: industries
        .filter((i) => i.code.startsWith(g.prefix))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    })).filter((g) => g.items.length > 0);
  }, [industries]);

  const groupOfSelected = selected ? GROUPS.find((g) => selected.code.startsWith(g.prefix))?.prefix : null;
  const [tab, setTab] = useState(groupOfSelected || grouped[0]?.prefix || 'CS1');

  // 선택 업종이 (연동 등으로) 바뀌면 그 업종의 대분류 탭으로 이동
  useEffect(() => { if (groupOfSelected) setTab(groupOfSelected); }, [groupOfSelected]);

  const activeGroup = grouped.find((g) => g.prefix === tab) || grouped[0];
  // 세부 업종 목록은 토글로 접어둔다. 대분류를 바꾸거나 아직 선택 전이면 펼친다.
  const [open, setOpen] = useState(!selected);
  const pickTab = (prefix) => { setTab(prefix); setOpen(true); };
  const pick = (code) => { onChange(code); setOpen(false); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p className="label-sm">업종 <span style={{ color: '#D0564C' }}>*</span></p>
        {sourced && <span className="filled-badge">홈택스 불러옴</span>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {grouped.map((g) => (
          <button key={g.prefix} className={`ind-tab${tab === g.prefix ? ' on' : ''}`} onClick={() => pickTab(g.prefix)}>
            {g.label}
          </button>
        ))}
      </div>

      {/* 선택 후엔 접힘: 선택 업종 + 변경 버튼만 노출 */}
      {!open && selected ? (
        <button className="input-row" onClick={() => setOpen(true)}
          style={{ justifyContent: 'space-between', cursor: 'pointer', border: '1.5px solid #CFE3B8', background: '#F5FAEE' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#2B2825' }}>{selected.name}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#8DBB6C' }}>변경 ▾</span>
        </button>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {activeGroup?.items.map((i) => (
            <button key={i.code} className={`chip${value === i.code ? ' on' : ''}`} onClick={() => pick(i.code)}>
              {i.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="pop" style={{
          background: '#EDF5E1', border: '1.5px solid #CFE3B8', borderRadius: 14,
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
