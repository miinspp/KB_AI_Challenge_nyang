// "신청하기" 탭 — 시뮬레이터의 AI 분석은 이제 Top3 리스트 자체에서 바로 보여주므로(시트),
// 여기서는 중복 설명 대신 "실제로 신청까지 이어지는 정보"만 모아 보여준다:
// 지금 장착한 상품과, 마감이 다가오는 지원제도 + 신청 링크.
const ROLE_LABELS = {
  LOAN: '운영 현금 마련',
  GRANT: '지원금 활용',
  SAVINGS: '현금 여유 준비',
  MUTUAL_AID: '안전망 준비',
  INSURANCE: '위험 대비',
};

function eligibility(product) {
  if (product.eligibilityStatus === 'PASS') return { label: '신청 조건에 맞아요', color: '#5E8A3E', background: '#EDF5E1' };
  if (product.eligibilityStatus === 'FAIL') return { label: '현재 조건과 맞지 않아요', color: '#D0564C', background: '#FDE8E6' };
  return { label: '신청 전 조건 확인', color: '#8B95A1', background: '#EEF0F3' };
}

function preparation(product) {
  if (product.type === 'LOAN') return '최근 매출과 기존 대출 내역';
  if (product.type === 'GRANT') return '사업자등록 정보와 지원 요건';
  if (product.type === 'SAVINGS') return 'KB 계좌 정보';
  return '공고에 안내된 신청 서류';
}

// eslint-disable-next-line no-unused-vars -- simRows/percentile/simulation: "나의 금융 실행 계획" 히어로 카드와
// 상위 N% 안내 문구를 뺀 상태(요청에 따라 일단 제외) — 나중에 다시 붙일 때 바로 쓸 수 있게 시그니처는 유지한다.
export default function PortfolioScreen({ equipped = [], simRows = [], percentile, simulation, products = [] }) {
  const selectedProducts = equipped;

  // 마감이 다가오는 지원제도 — 장착 여부와 무관하게, 서둘러야 할 것부터 위로 올린다.
  const urgent = products
    .filter((p) => typeof p.daysLeft === 'number' && p.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  return (
    <div className="scr" style={{ padding: '14px 22px 112px', gap: 14 }}>
      {urgent.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ padding: '3px 1px 0', fontSize: 13, fontWeight: 900, color: '#191B1F' }}>마감 임박 지원제도</p>
          {urgent.map((product) => (
            <a key={product.id} className="press-fx-row" href={product.link || undefined} target={product.link ? '_blank' : undefined} rel={product.link ? 'noreferrer' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px', border: '1.5px solid #EAECEF', borderRadius: 17, background: '#fff', textDecoration: 'none' }}>
              <span className="icon-badge" style={{ flex: 'none', width: 34, height: 34, borderRadius: 11, background: product.iconBg, color: product.iconColor, fontSize: 15 }}>{product.icon}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#191B1F', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{product.name}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, fontWeight: 800, color: '#8B95A1' }}>{product.tag}</span>
              </span>
              <span style={{
                flex: 'none', fontSize: 10.5, fontWeight: 900, padding: '4px 8px', borderRadius: 8,
                color: product.daysLeft <= 7 ? 'var(--danger)' : '#8A7A55',
                background: product.daysLeft <= 7 ? 'var(--danger-bg)' : '#FFF6DD',
              }}>{product.daysLeft === 0 ? '오늘 마감' : `D-${product.daysLeft}`}</span>
              {product.link && <span style={{ flex: 'none', color: '#C98A00', fontSize: 11, fontWeight: 900 }}>신청하기 ↗</span>}
            </a>
          ))}
        </section>
      )}

      {equipped.length > 0 ? (
        <>
          <p style={{ padding: '3px 1px 0', fontSize: 13, fontWeight: 900, color: '#191B1F' }}>선택한 상품 {selectedProducts.length}개</p>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedProducts.map((product) => {
              const status = eligibility(product);
              const role = ROLE_LABELS[product.type] || product.category || '맞춤 상품';
              const docs = preparation(product);
              return (
                <a key={product.key || product.id} className="press-fx-row" href={product.link || undefined} target={product.link ? '_blank' : undefined} rel={product.link ? 'noreferrer' : undefined} style={{ display: 'block', padding: '12px', border: '1.5px solid #EAECEF', borderRadius: 17, background: '#fff', textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="icon-badge" style={{ flex: 'none', width: 34, height: 34, borderRadius: 11, background: product.iconBg, color: product.iconColor, fontSize: 15 }}>{product.icon}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#191B1F', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{product.name || product.short}</span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, fontWeight: 800, color: '#8B95A1' }}>{product.reason || role}</span>
                    </span>
                    <span style={{ flex: 'none', color: '#C98A00', fontSize: 11, fontWeight: 900 }}>{product.link ? '신청하기 ↗' : '확인하기 ›'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 10 }}>
                    <span style={{ padding: '6px 7px', borderRadius: 9, background: status.background, color: status.color, fontSize: 9.5, fontWeight: 900 }}>{status.label}</span>
                    <span style={{ padding: '6px 7px', borderRadius: 9, background: '#FFF6DD', color: '#8A7A55', fontSize: 9.5, fontWeight: 900 }}>{role}</span>
                    <span style={{ gridColumn: '1 / -1', padding: '6px 7px', borderRadius: 9, background: '#F1F3F5', color: '#8B95A1', fontSize: 9.5, fontWeight: 800 }}>신청 전 준비: {docs}</span>
                  </div>
                </a>
              );
            })}
          </section>
        </>
      ) : (
        urgent.length === 0 && (
          <section style={{ padding: 26, border: '1.5px dashed #D3D7DC', borderRadius: 20, background: '#fff', textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 900, color: '#525A64' }}>아직 선택한 상품이 없어요</p>
            <p style={{ marginTop: 5, fontSize: 11.5, fontWeight: 700, color: '#9FA6B0' }}>시뮬레이터에서 상품을 골라보세요.</p>
          </section>
        )
      )}
    </div>
  );
}
