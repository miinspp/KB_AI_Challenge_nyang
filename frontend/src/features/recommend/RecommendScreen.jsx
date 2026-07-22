import { useState } from 'react';

/** "지원:/대상:/신청:" 3줄 요약(파인튜닝 KoBART 생성)을 라벨-내용 행으로 렌더 */
function SummaryLines({ text }) {
  if (!text) return null;
  const rows = text.split('\n').map((line) => {
    const idx = line.indexOf(':');
    return idx > 0 ? [line.slice(0, idx), line.slice(idx + 1).trim()] : ['', line];
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          {k && <span style={{ flex: 'none', width: 30, fontWeight: 800, color: '#A79C8E' }}>{k}</span>}
          <span style={{ flex: 1, color: '#2B2825', fontWeight: 600, lineHeight: 1.5 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/** AI 추천 카드 — 정책·지원제도 / KB 금융상품 공용 */
function RecoCard({ item, badge, badgeBg, badgeColor }) {
  return (
    <a href={item.url || undefined} target="_blank" rel="noreferrer" className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 9, border: '1.5px solid #F0E7D6', textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="tag" style={{ flex: 'none', color: badgeColor, background: badgeBg }}>{badge}</span>
        <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 11.5, fontWeight: 800, color: '#8DBB6C' }}>
          매칭 {Math.round(item.score * 100)}%
        </span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 800, color: '#2B2825', letterSpacing: -.3, lineHeight: 1.45 }}>{item.title}</p>
      <SummaryLines text={item.summaryShort} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(item.keywords || []).slice(0, 4).map((k) => (
          <span key={k} className="spec" style={{ fontSize: 10.5 }}>#{k}</span>
        ))}
        {item.maxAmountManwon && <span className="spec" style={{ fontSize: 10.5, color: '#B08F3C' }}>최대 {item.maxAmountManwon.toLocaleString()}만원</span>}
        {item.deadline && <span className="spec" style={{ fontSize: 10.5 }}>~{item.deadline}</span>}
      </div>
      <p style={{ fontSize: 11.5, color: '#8A7A55', background: '#FBF7EE', borderRadius: 10, padding: '8px 11px', lineHeight: 1.5, fontWeight: 600 }}>
        🤖 {item.reason}
      </p>
    </a>
  );
}

export default function RecommendScreen({ products, percentile, reco }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="scr" style={{ gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 900, color: '#2B2825', letterSpacing: -.4, lineHeight: 1.4 }}>
          상위 {percentile}% 사장님께<br />딱 맞는 상품을 골랐어요
        </h2>
        <p style={{ marginTop: 6, fontSize: 13, color: '#8A8178' }}>진단 결과를 바탕으로 우선순위 순서예요.</p>
      </div>

      {reco && (reco.policies?.length > 0 || reco.products?.length > 0) && (
        <>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 900, color: '#2B2825' }}>🤖 AI 맞춤 추천</span>
            {(reco.profileSignals || []).map((s) => (
              <span key={s} className="tag" style={{ color: '#7A6A3E', background: '#FFF6DD' }}>{s}</span>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: '#A79C8E', marginTop: -8 }}>
            진단 신호를 임베딩으로 매칭하고, 자체 학습한 요약 모델이 공고 핵심을 3줄로 정리했어요.
          </p>
          {(reco.policies || []).map((it) => (
            <RecoCard key={it.id} item={it} badge={`정책 · ${it.agency || '정부지원'}`} badgeBg="#E8F1E2" badgeColor="#5E8C46" />
          ))}
          {(reco.products || []).map((it) => (
            <RecoCard key={it.id} item={it} badge={`KB · ${it.category || '금융상품'}`} badgeBg="#FFF0D4" badgeColor="#B08F3C" />
          ))}
        </>
      )}

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