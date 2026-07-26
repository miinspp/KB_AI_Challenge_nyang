import { fmtWon, fmtMan } from '../../shared/format';
import { HOMETAX_FINANCIALS as HT } from './accountMock';

/**
 * 홈택스 연동 정보 — 홈에서 홈택스 카드를 탭하면 열리는 상세 화면.
 * 연동으로 무엇을 가져왔는지(손익 항목 + 6개월 추이)를 그대로 펼쳐 보여준다.
 * 6개월 이력은 진단 리포트의 '매출 안정성' 축 입력이라 그 연결을 명시한다.
 */
export default function HometaxScreen({ onBack, onGoDiagnose, onUnlink }) {
  const netProfit = HT.monthlySalesAvg - HT.totalMonthlyExpense;
  const rows = [
    { k: '업종', v: HT.industryName },
    { k: '월 평균 매출', v: fmtMan(HT.monthlySalesAvg) },
    { k: '월 평균 지출', v: fmtMan(HT.totalMonthlyExpense) },
    { k: '임대료', v: fmtMan(HT.rent) },
    { k: '인건비', v: fmtMan(HT.laborCost) },
    { k: '재료비(매입)', v: fmtMan(HT.purchaseCost) },
    { k: '그 밖의 지출', v: fmtMan(HT.otherExpense) },
    { k: '월 순수익', v: fmtMan(netProfit), strong: true },
  ];
  const maxSales = Math.max(...HT.salesHistory);

  return (
    <div className="acct">
      <div className="acct-bar">
        <button className="hdr-back" onClick={onBack}>‹</button>
        <span className="hdr-title">홈택스 연동 정보</span>
        <span style={{ width: 38 }} />
      </div>

      <div className="acct-head">
        <p className="acct-num" style={{ textDecoration: 'none' }}>국세청 홈택스 · 사업자 {HT.maskedBusinessNumber}</p>
        <p className="acct-balance">{fmtWon(HT.monthlySalesAvg)}</p>
        <p className="acct-rate">{HT.basisPeriod} 월평균 매출</p>
        <div className="safe-note" style={{ marginTop: 14 }}>
          <span>🔒</span> 조회 전용으로 연결됐어요 · 신고 대행 불가
        </div>
      </div>

      <div style={{ padding: '0 22px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p className="label-sm" style={{ marginBottom: 8 }}>불러온 손익</p>
          <div className="list-box">
            {rows.map((r) => (
              <div key={r.k} className="list-row" style={{ cursor: 'default' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{r.k}</span>
                <span style={{ flex: 'none', fontSize: 14.5, fontWeight: 800, color: r.strong ? 'var(--green-deep)' : 'var(--ink)' }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="label-sm" style={{ marginBottom: 8 }}>최근 6개월 매출 추이</p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {HT.salesHistory.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ flex: 'none', width: 40, fontSize: 11.5, fontWeight: 800, color: 'var(--muted-soft)' }}>{i + 1}개월</span>
                <div style={{ flex: 1, height: 14, background: '#F5EFE2', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 6, background: 'var(--green-soft)', width: `${Math.round((v / maxSales) * 100)}%` }} />
                </div>
                <span style={{ flex: 'none', width: 78, textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: '#4A453E' }}>{fmtMan(v)}</span>
              </div>
            ))}
            <p className="evidence-src" style={{ marginTop: 2 }}>
              이 6개월 이력이 진단 리포트의 <b>매출 안정성</b> 축(추세·변동성)에 쓰여요.
            </p>
          </div>
        </div>

        <button className="acct-link" onClick={onGoDiagnose}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>이 자료로 진단 이어하기</p>
            <p style={{ fontSize: 11.5, color: 'var(--muted-mid)', marginTop: 3 }}>업종·매출·지출이 이미 채워져 있어요</p>
          </div>
          <span className="menu-chev">›</span>
        </button>

        <button className="ghost-btn" onClick={onUnlink}>홈택스 연동 해제</button>
      </div>
    </div>
  );
}
