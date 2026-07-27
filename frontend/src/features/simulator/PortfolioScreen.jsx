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

export default function PortfolioScreen({ equipped = [], simRows = [], percentile, simulation }) {
  const primaryMetric = simRows[0];
  const summary = simRows.slice(0, 2);
  const constraint = simulation?.constraints?.violations?.[0];
  const selectedProducts = equipped;
  const headline = primaryMetric
    ? `이번 조합은 ${primaryMetric.name}을\n${primaryMetric.delta} 바꿔요`
    : '선택한 상품으로\n실행 계획을 만들어요';

  return (
    <div className="scr" style={{ padding: '14px 22px 112px', gap: 14 }}>
      <section style={{ overflow: 'hidden', borderRadius: 22, padding: '19px 18px 16px', color: '#fff', background: 'linear-gradient(135deg,#191B1F,#2E323A)' }}>
        <p style={{ fontSize: 11.5, fontWeight: 900, color: '#FFD873' }}>나의 금융 실행 계획</p>
        <p style={{ marginTop: 7, fontSize: 19, fontWeight: 900, lineHeight: 1.38, whiteSpace: 'pre-line' }}>{headline}</p>
        {summary.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${summary.length}, minmax(0, 1fr))`, gap: 8, marginTop: 15 }}>
            {summary.map((metric) => (
              <div key={metric.name} style={{ minWidth: 0, padding: '10px 11px', borderRadius: 13, background: 'rgba(255,255,255,.09)' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#C7CDD3', lineHeight: 1.35 }}>{metric.name}</p>
                <p style={{ marginTop: 4, fontSize: 14, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>{metric.after}</p>
                <p style={{ marginTop: 2, fontSize: 10, fontWeight: 800, color: metric.deltaColorDark || '#FFD873' }}>{metric.delta}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {equipped.length > 0 ? (
        <>
          <p style={{ padding: '3px 1px 0', fontSize: 13, fontWeight: 900, color: '#191B1F' }}>선택한 상품 {selectedProducts.length}개</p>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedProducts.map((product) => {
              const status = eligibility(product);
              const role = ROLE_LABELS[product.type] || product.category || '맞춤 상품';
              const docs = preparation(product);
              return (
                <a key={product.key || product.id} href={product.link || undefined} target={product.link ? '_blank' : undefined} rel={product.link ? 'noreferrer' : undefined} style={{ display: 'block', padding: '12px', border: '1.5px solid #EAECEF', borderRadius: 17, background: '#fff', textDecoration: 'none' }}>
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

          <section style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 13px', borderRadius: 15, background: '#EDF5E1' }}>
            <span style={{ flex: 'none', marginTop: 1, color: '#5E8A3E', fontSize: 14 }}>✓</span>
            <p style={{ fontSize: 11, lineHeight: 1.55, fontWeight: 700, color: '#5E6E4A' }}>
              {constraint || (percentile != null ? `현재 업종·매출 기준 상위 ${percentile}% 위치예요. 실제 조건은 상품 페이지에서 확인하세요.` : '실제 조건은 상품 페이지에서 확인하세요.')}
            </p>
          </section>
        </>
      ) : (
        <section style={{ padding: 26, border: '1.5px dashed #D3D7DC', borderRadius: 20, background: '#fff', textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 900, color: '#525A64' }}>아직 선택한 상품이 없어요</p>
          <p style={{ marginTop: 5, fontSize: 11.5, fontWeight: 700, color: '#9FA6B0' }}>시뮬레이터에서 상품을 골라보세요.</p>
        </section>
      )}
    </div>
  );
}
