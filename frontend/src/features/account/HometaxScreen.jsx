import { fmtWon, fmtMan } from '../../shared/format';
import { HOMETAX_FINANCIALS as HT } from './accountMock';

/**
 * 홈택스 연동 정보 — 홈에서 홈택스 카드를 탭하면 열리는 상세 화면.
 * 연동으로 무엇을 가져왔는지(손익 항목 + 12개월 추이)를 그대로 펼쳐 보여준다.
 * 12개월 이력은 진단과 시뮬레이션의 추세·변동성 입력으로 사용한다.
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
    { k: '카드·결제 수수료', v: fmtMan(HT.cardFee) },
    { k: '그 밖의 지출', v: fmtMan(HT.otherExpense) },
    { k: '월 순수익', v: fmtMan(netProfit), strong: true },
  ];
  const monthlyHistory = HT.monthlyHistory || [];
  const maxMonthlyAmount = Math.max(...monthlyHistory.flatMap((row) => [row.sales, row.totalExpense]), 1);

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
          <p className="label-sm" style={{ marginBottom: 8 }}>최근 12개월 매출·지출 추이</p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {monthlyHistory.map((row) => (
              <div key={row.month} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ flex: 'none', width: 42, fontSize: 10.5, fontWeight: 800, color: 'var(--muted-soft)' }}>{row.month.slice(5)}월</span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ height: 6, background: '#F5EFE2', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: 'var(--green-soft)', width: `${Math.round((row.sales / maxMonthlyAmount) * 100)}%` }} />
                  </div>
                  <div style={{ height: 6, background: '#F5EFE2', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: '#E0A93C', width: `${Math.round((row.totalExpense / maxMonthlyAmount) * 100)}%` }} />
                  </div>
                </div>
                <span style={{ flex: 'none', width: 92, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: '#4A453E' }}>{fmtMan(row.sales)} / {fmtMan(row.totalExpense)}</span>
              </div>
            ))}
            <p className="evidence-src" style={{ marginTop: 2 }}>
              초록은 매출, 노랑은 지출이에요. 이 12개월 이력이 매출 추세와 비용 변동성 계산에 쓰여요.
            </p>
          </div>
        </div>

        <div>
          <p className="label-sm" style={{ marginBottom: 8 }}>확인된 세금 일정</p>
          <div className="list-box">
            {HT.scheduledTaxPayments.map((payment) => (
              <div key={`${payment.type}-${payment.dueDate}`} className="list-row" style={{ cursor: 'default' }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{payment.type}<br /><small>{payment.dueDate}</small></span>
                <span style={{ flex: 'none', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{fmtMan(payment.amount)}</span>
              </div>
            ))}
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
