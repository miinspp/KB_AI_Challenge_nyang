import { useState } from 'react';

// 상품 → 카테고리 (재현본 규칙 + 실제 추천 API 상품의 isFinance 반영)
const CATS = [['all', '전체'], ['loan', '대출'], ['save', '적금'], ['ins', '보험'], ['gov', '정부 지원']];
const catOf = (p) => {
  const tag = p.tag || '';
  if (tag.includes('대출') || p.isFinance) return 'loan';
  if (tag.includes('적금')) return 'save';
  if (tag.includes('보험')) return 'ins';
  return 'gov';
};

export default function RecommendScreen({ products, percentile }) {
  const [openId, setOpenId] = useState(null);
  const [cat, setCat] = useState('all');
  const visible = products.filter((p) => cat === 'all' || catOf(p) === cat);
  return (
    <div className="scr" style={{ gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.4, lineHeight: 1.4 }}>
          상위 {percentile}% 사장님께<br />딱 맞는 상품을 골랐어요
        </h2>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>진단 결과를 바탕으로 우선순위 순서예요.</p>
      </div>

      <div style={{ background: '#FFF6DD', border: '1.5px solid #F3E4C0', borderRadius: 14, padding: '12px 15px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ flex: 'none', fontSize: 16 }}>💡</span>
        <p style={{ fontSize: 12.5, color: '#8A7A55', lineHeight: 1.55, fontWeight: 600 }}>
          아래 체험 상품을 탭하면 간략한 정보를 볼 수 있어요.<br />다음 화면에서 직접 <b style={{ color: 'var(--ink)' }}>장착해 보며 체험</b>할 수 있어요!
        </p>
      </div>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {CATS.map(([key, label]) => {
          const on = cat === key;
          const count = key === 'all' ? products.length : products.filter((p) => catOf(p) === key).length;
          return (
            <button key={key} onClick={() => setCat(key)} style={{
              flex: 'none', borderRadius: 11, padding: '8px 14px', fontSize: 12.5, fontWeight: 800,
              cursor: 'pointer', whiteSpace: 'nowrap',
              border: on ? '1.5px solid var(--green-deep)' : '1.5px solid var(--border)',
              background: on ? 'var(--green-deep)' : '#fff', color: on ? '#fff' : 'var(--muted)',
            }}>
              {label} <span style={{ fontWeight: 700, opacity: .65 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {visible.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} onClick={() => setOpenId(open ? null : p.id)} className="card" style={{
            border: open ? '1.5px solid var(--gold-deep)' : '1.5px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="icon-badge" style={{ width: 40, height: 40, background: p.iconBg, color: p.iconColor, fontSize: 18 }}>{p.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', letterSpacing: -.3 }}>{p.name}</p>
                <span className="tag" style={{ color: p.tagColor, background: p.tagBg }}>{p.tag}</span>
                {typeof p.daysLeft === 'number' && p.daysLeft >= 0 && (
                  <span className="tag" style={{
                    marginLeft: 6,
                    color: p.daysLeft <= 7 ? 'var(--danger)' : '#8A7A55',
                    background: p.daysLeft <= 7 ? 'var(--danger-bg)' : '#FFF6DD',
                  }}>{p.daysLeft === 0 ? '오늘 마감' : `D-${p.daysLeft}`}</span>
                )}
              </div>
              <span style={{ flex: 'none', fontSize: 12, fontWeight: 800, color: 'var(--green-soft)' }}>적합 {p.fit}%</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{p.reason}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="spec">{p.spec1}</span>
              <span className="spec">{p.spec2}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--muted-faint)' }}>{open ? '접기 ▲' : '자세히 ▼'}</span>
            </div>
            {open && (
              <div className="pop" style={{ background: 'var(--warm)', borderRadius: 14, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {p.details.map((d) => (
                  <div key={d.k} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ flex: 'none', width: 64, fontWeight: 800, color: 'var(--muted-mid)' }}>{d.k}</span>
                    <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.55 }}>{d.v}</span>
                  </div>
                ))}
                <p style={{ fontSize: 11.5, color: '#8A7A55', background: '#FFF6DD', borderRadius: 10, padding: '9px 11px', lineHeight: 1.55, fontWeight: 600 }}>
                  👉 다음 화면의 시뮬레이터에서 이 상품을 장착하면, 우리 가게 현금흐름이 어떻게 바뀌는지 미리 체험할 수 있어요.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}