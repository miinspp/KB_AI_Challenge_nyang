import { useState } from 'react';

export default function RecommendScreen({ products, percentile }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="scr" style={{ gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 900, color: '#2B2825', letterSpacing: -.4, lineHeight: 1.4 }}>
          상위 {percentile}% 사장님께<br />딱 맞는 상품을 골랐어요
        </h2>
        <p style={{ marginTop: 6, fontSize: 13, color: '#8A8178' }}>진단 결과를 바탕으로 우선순위 순서예요.</p>
      </div>

      <div style={{ background: '#FFF6DD', border: '1.5px solid #F3E4C0', borderRadius: 14, padding: '12px 15px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ flex: 'none', fontSize: 16 }}>💡</span>
        <p style={{ fontSize: 12.5, color: '#8A7A55', lineHeight: 1.55, fontWeight: 600 }}>
          아래 체험 상품을 탭하면 간략한 정보를 볼 수 있어요.<br />다음 화면에서 직접 <b style={{ color: '#2B2825' }}>장착해 보며 체험</b>할 수 있어요!
        </p>
      </div>

      {products.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} onClick={() => setOpenId(open ? null : p.id)} className="card" style={{
            border: open ? '1.5px solid #E8B93E' : '1.5px solid #F0E7D6',
            display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="icon-badge" style={{ width: 40, height: 40, background: p.iconBg, color: p.iconColor, fontSize: 18 }}>{p.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#2B2825', letterSpacing: -.3 }}>{p.name}</p>
                <span className="tag" style={{ color: p.tagColor, background: p.tagBg }}>{p.tag}</span>
                {typeof p.daysLeft === 'number' && p.daysLeft >= 0 && (
                  <span className="tag" style={{
                    marginLeft: 6,
                    color: p.daysLeft <= 7 ? '#D0564C' : '#8A7A55',
                    background: p.daysLeft <= 7 ? '#FDE8E6' : '#FFF6DD',
                  }}>{p.daysLeft === 0 ? '오늘 마감' : `D-${p.daysLeft}`}</span>
                )}
              </div>
              <span style={{ flex: 'none', fontSize: 12, fontWeight: 800, color: '#8DBB6C' }}>적합 {p.fit}%</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#8A8178', lineHeight: 1.6 }}>{p.reason}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="spec">{p.spec1}</span>
              <span className="spec">{p.spec2}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#C4BAAD' }}>{open ? '접기 ▲' : '자세히 ▼'}</span>
            </div>
            {open && (
              <div className="pop" style={{ background: '#FBF7EE', borderRadius: 14, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {p.details.map((d) => (
                  <div key={d.k} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ flex: 'none', width: 64, fontWeight: 800, color: '#A79C8E' }}>{d.k}</span>
                    <span style={{ flex: 1, color: '#2B2825', fontWeight: 600, lineHeight: 1.55 }}>{d.v}</span>
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