// 상권유형 선택 — 서울시 데이터의 상권 구분(골목/발달/전통시장) 중
// 해당 업종에 표본이 충분한 유형만 노출. 선택 시 같은 유형 내 상위 %도 함께 산출된다.
const ALL = ['골목상권', '발달상권', '전통시장'];
const DESC = {
  골목상권: '주택가 인근 생활 상권',
  발달상권: '역세권·번화가 상권',
  전통시장: '전통시장 내 점포',
};

export default function AreaTypeTabs({ available, value, onChange }) {
  if (!available || available.length === 0) return null;
  const types = ALL.filter((t) => available.includes(t));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p className="label-sm">
          상권 유형 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· 선택</span>
        </p>
        <p style={{ fontSize: 11.5, color: '#C4BAAD', marginTop: 3 }}>
          선택하면 같은 유형 상권 안에서의 순위도 함께 알려드려요
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${types.length + 1}, 1fr)`, gap: 6 }}>
        <Chip active={value === ''} title="서울 전체" desc="기본" onClick={() => onChange('')} />
        {types.map((t) => (
          <Chip key={t} active={value === t} title={t} desc={DESC[t]} onClick={() => onChange(t)} />
        ))}
      </div>
    </div>
  );
}

function Chip({ active, title, desc, onClick }) {
  return (
    <button onClick={onClick} style={{
      border: active ? '1.5px solid #E8B93E' : '1.5px solid #F0E7D6',
      background: active ? '#FFF6DD' : '#fff',
      borderRadius: 13, padding: '10px 6px', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'center', transition: 'all .18s',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: active ? '#2B2825' : '#8A8178' }}>{title}</span>
      <span style={{ fontSize: 9.5, color: active ? '#B08A2E' : '#C4BAAD', lineHeight: 1.3 }}>{desc}</span>
    </button>
  );
}
