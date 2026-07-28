import { useState } from 'react';
import { summarizeSimulationForAdvisor } from './sim';
import { requestPortfolioDetail } from '../../api/portfolio';

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

const RANK_TONE = ['#FFD873', '#D8DEE6', '#E7C7A2'];

// 카드를 누르면 펼쳐져서 AI에게 이 조합만 더 자세히 설명해달라고 온디맨드로 요청한다.
// (Top3 산정 때 이미 계산해둔 조합별 지표를 그대로 재사용 — 새 숫자를 만들지 않는다)
function ComboAnalysisCard({ combo, isEquipped, riskProfile, simulation }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const fetchDetail = async () => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const metrics = summarizeSimulationForAdvisor(simulation);
      const res = await requestPortfolioDetail({
        riskProfile,
        candidate: {
          comboId: combo.comboId,
          products: combo.items.map((item) => ({ id: item.id, name: item.short || item.name, type: item.type })),
          metrics,
        },
        headline: combo.headline,
        reason: combo.reason,
        caution: combo.caution || '',
      });
      setDetail(res && (res.fit || res.strength) ? res : { fit: combo.reason, strength: '', caution: combo.caution || '' });
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && !detail && !detailLoading) fetchDetail();
  };

  return (
    <div style={{
      border: isEquipped ? '1.5px solid var(--gold-deep)' : '1.5px solid var(--border)',
      background: isEquipped ? '#FFF6DD' : '#fff', borderRadius: 16, padding: '12px 14px',
    }}>
      <button type="button" onClick={toggleOpen} style={{
        width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            flex: 'none', width: 22, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center',
            background: RANK_TONE[combo.rank - 1] || '#EEF0F3', fontSize: 11, fontWeight: 900, color: '#191B1F',
          }}>{combo.rank}</span>
          <p style={{ fontSize: 13, fontWeight: 900, color: '#191B1F', flex: 1, minWidth: 0 }}>{combo.headline}</p>
          {isEquipped && <span style={{ flex: 'none', fontSize: 10, fontWeight: 900, color: 'var(--gold-link)' }}>지금 보는 조합</span>}
          <span aria-hidden="true" style={{ flex: 'none', fontSize: 11, fontWeight: 900, color: '#B0B8C1' }}>{open ? '▲' : '▼'}</span>
        </div>
        <p style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.55, fontWeight: 600, color: '#525A64' }}>{combo.reason}</p>
        {combo.caution && <p style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: 'var(--danger)' }}>{combo.caution}</p>}
        <p style={{ marginTop: 6, fontSize: 10.5, fontWeight: 800, color: 'var(--gold-link)' }}>
          {open ? '분석 결과 접기' : '분석 결과 자세히 보기'}
        </p>
      </button>

      {open && (
        <div className="evidence-box" style={{ marginTop: 8 }}>
          {detailLoading && (
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>AI가 더 자세히 분석하고 있어요…</p>
          )}
          {!detailLoading && detailError && (
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>
              불러오지 못했어요: {detailError}{' '}
              <button type="button" onClick={fetchDetail} style={{ border: 'none', background: 'none', color: 'var(--gold-link)', fontWeight: 800, cursor: 'pointer', padding: 0 }}>다시 시도</button>
            </p>
          )}
          {!detailLoading && !detailError && detail && (
            <>
              {detail.fit && (
                <div className="evidence-row">
                  <span className="evidence-k">왜 맞나요</span>
                  <span className="evidence-v">{detail.fit}</span>
                </div>
              )}
              {detail.strength && (
                <div className="evidence-row">
                  <span className="evidence-k">장점</span>
                  <span className="evidence-v">{detail.strength}</span>
                </div>
              )}
              {detail.caution && (
                <div className="evidence-row">
                  <span className="evidence-k">확인할 점</span>
                  <span className="evidence-v">{detail.caution}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortfolioScreen({
  equipped = [], simRows = [], percentile, simulation, topCombos = [], equippedComboId,
  riskProfile, comboSimulations = {},
}) {
  const primaryMetric = simRows[0];
  const constraint = simulation?.constraints?.violations?.[0];
  const selectedProducts = equipped;

  return (
    <div className="scr" style={{ padding: '14px 22px 112px', gap: 14 }}>
      <section style={{ overflow: 'hidden', borderRadius: 22, padding: '19px 18px 18px', color: '#fff', background: 'linear-gradient(135deg,#191B1F,#2E323A)' }}>
        <p style={{ fontSize: 11.5, fontWeight: 900, color: '#FFD873' }}>나의 금융 실행 계획</p>
        {primaryMetric ? (
          <>
            <p style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: '#C7CDD3' }}>{primaryMetric.name}</p>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 9 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: -.4 }}>{primaryMetric.after}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: primaryMetric.deltaColorDark || '#FFD873' }}>{primaryMetric.delta}</span>
            </div>
          </>
        ) : (
          <p style={{ marginTop: 9, fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.4 }}>상품을 선택하면<br />실행 계획을 보여드려요</p>
        )}
      </section>

      {topCombos.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ padding: '3px 1px 0', fontSize: 13, fontWeight: 900, color: '#191B1F' }}>AI 조합 분석</p>
          {topCombos.map((combo) => (
            <ComboAnalysisCard key={combo.comboId} combo={combo} isEquipped={equippedComboId === combo.comboId}
              riskProfile={riskProfile} simulation={comboSimulations[combo.comboId]} />
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
