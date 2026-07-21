import { PRODUCTS } from '../recommend/products';
import { sumEffects, sign } from './sim';

export default function PortfolioScreen({ equipped, simRows, percentile }) {
  const eq = equipped.map((id) => PRODUCTS.find((p) => p.id === id));
  const d = sumEffects(equipped);
  const headline = eq.length === 0
    ? '상품을 장착하면 변화를 보여드려요'
    : '상품 ' + eq.length + '개 장착 시, 월 현금흐름이 ' + sign(d.cash) + '만원 변해요';

  return (
    <div className="scr">
      <div style={{ background: '#2B2825', borderRadius: 22, padding: '20px 22px', color: '#fff' }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#FFD873' }}>사장님의 최종 포트폴리오</p>
        <p style={{ marginTop: 8, fontSize: 20, fontWeight: 900, lineHeight: 1.45, letterSpacing: -.4 }}>{headline}</p>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {simRows.map((m) => (
            <div key={m.name} style={{ background: 'rgba(255,255,255,.07)', borderRadius: 14, padding: '12px 14px' }}>
              <p style={{ fontSize: 11, color: '#B9B0A4', fontWeight: 700 }}>{m.name}</p>
              <p style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: '#fff' }}>{m.after}</p>
              <p style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: m.deltaColorDark }}>
                {m.delta} <span style={{ color: '#8A8178', fontWeight: 500 }}>(기존 {m.before})</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {eq.length > 0 ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="label-sm">가입하러 가기 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· KB스타뱅킹으로 이동해요</span></p>
            {eq.map((p) => (
              <a key={p.id} href={p.link} target="_blank" rel="noreferrer" className="card" style={{ display: 'block' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="icon-badge" style={{ width: 40, height: 40, background: p.iconBg, color: p.iconColor, fontSize: 18 }}>{p.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#2B2825', letterSpacing: -.3 }}>{p.name}</p>
                    <p style={{ marginTop: 2, fontSize: 11.5, color: '#A79C8E' }}>{p.spec1} · {p.spec2}</p>
                  </div>
                  <span style={{ flex: 'none', fontSize: 13, fontWeight: 900, color: '#C98A00' }}>가입 ↗</span>
                </div>
                <div style={{ marginTop: 12, background: '#FFF9EA', borderRadius: 12, padding: '11px 13px' }}>
                  <p style={{ fontSize: 12, color: '#8A7A55', lineHeight: 1.65 }}>{p.effectText}</p>
                </div>
              </a>
            ))}
          </div>
          <div style={{ background: '#EDF5E1', borderRadius: 16, padding: '14px 16px' }}>
            <p style={{ fontSize: 12.5, color: '#5E6E4A', lineHeight: 1.65, fontWeight: 600 }}>
              사장님은 상위 {percentile}% 위치라 정책자금 우대 대상이에요. 대출성 상품은 부채비율 45%를 넘지 않는 선에서 이용하시길 권해드려요. 자세한 조건은 각 상품 페이지에서 확인하세요.
            </p>
          </div>
        </>
      ) : (
        <div style={{ background: '#fff', border: '1.5px dashed #E4D8C2', borderRadius: 20, padding: 28, textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#8A8178' }}>아직 장착한 상품이 없어요</p>
          <p style={{ marginTop: 6, fontSize: 12.5, color: '#C4BAAD' }}>이전 화면에서 상품을 장착해 보세요.</p>
        </div>
      )}
    </div>
  );
}