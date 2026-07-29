import { useState } from 'react';
import { fmtMan, fmtRate } from '../../shared/format';

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * 화면 1 — 진단 리포트 v2. 전적으로 백엔드 /api/rank 응답으로 구성된다.
 * 재현본 이식: 지표마다 "근거 보기"를 펼치면 계산 단계(내 입력값 → 비교 대상 → 계산 → 종합 반영)와
 * 출처를 그대로 보여준다. 종합점수 = 기본 3축(매출 50 · 순수익 30 · 비용효율 20)
 * × (1 − 보정축 비중) + 보정축(비용구조 15 · 매출안정성 15, 자료가 있을 때만).
 */
export default function ReportScreen({ rank, meta, salesHistory }) {
  const [openMetric, setOpenMetric] = useState(null);
  const [showNotes, setShowNotes] = useState(false);   // 산출 기준·방법론 각주 (기본 접힘)

  if (!rank) {
    return (
      <div className="scr" style={{ alignItems: 'center', paddingTop: 80 }}>
        <span className="spinner" />
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>서울시 공공데이터와 비교 분석 중이에요…</p>
      </div>
    );
  }

  const { sales, profit, margin, areaRank, peer, costHealth, stability } = rank;
  const expenseWon = sales.value - profit.value;

  // 근거 문구의 가중치는 백엔드가 실제로 적용한 값(weightsUsed)을 그대로 쓴다.
  // 여기서 기본값을 다시 계산하면 가중치 조절 기능이 붙는 순간 화면 숫자는 맞는데
  // 설명만 조용히 틀어지므로, 응답이 없을 때만 RankService 기본값으로 폴백한다.
  const W = rank.weightsUsed ?? {
    sales: 0.5, profit: 0.3, margin: 0.2,
    ...(costHealth ? { cost: 0.15 } : {}),
    ...(stability ? { stability: 0.15 } : {}),
  };
  const extraW = (W.cost ?? 0) + (W.stability ?? 0);
  const baseScale = 1 - extraW;                       // 보정축 때문에 기본 3축에 곱해진 비율
  const pctText = (v) => `${r1((v ?? 0) * 100)}%`;
  const contrib = (w, score) => r1((w ?? 0) * score); // 종합점수 기여도 = 가중치 × 점수
  // 표시용 원가중치 복원: weightsUsed 는 이미 baseScale 이 곱해진 값이라 되돌려야 "50% × 70%" 로 읽힌다
  const rawPctText = (w) => (baseScale > 0 ? pctText((w ?? 0) / baseScale) : '-');
  const basisText = (w, score) => (extraW > 0
    ? `가중치 ${rawPctText(w)} × ${pctText(baseScale)} = ${contrib(w, score)}점 기여`
    : `가중치 ${pctText(w)} = ${contrib(w, score)}점 기여`);

  const metrics = [
    {
      key: 'sales', name: '매출',
      valueText: `상위 ${sales.topPercent}%`, pct: sales.percentile,
      sub: `${fmtMan(sales.value)} · 업종 중위 ${fmtMan(sales.peerMedian)}`,
      steps: [
        { k: '내 입력값', v: `월 매출 ${fmtMan(sales.value)}` },
        { k: '비교 대상', v: `서울 ${rank.industryName} ${peer.nStores.toLocaleString()}곳 (중위 ${fmtMan(sales.peerMedian)} · P25 ${fmtMan(sales.peerP25)} · P75 ${fmtMan(sales.peerP75)})` },
        { k: '계산', v: `실측 분포 격자에서 내 매출 위치를 역보간 → 백분위 ${r1(sales.percentile)}점 = 상위 ${sales.topPercent}%` },
        { k: '종합 반영', v: basisText(W.sales, sales.percentile) },
      ],
      source: '출처: 서울시 상권분석서비스 추정매출(OA-15572) 점포당 월매출 분포',
    },
    {
      key: 'profit', name: '순수익',
      valueText: `상위 ${profit.topPercent}%`, pct: profit.percentile,
      sub: `${fmtMan(profit.value)} · 업종 평균 이익률 ${fmtRate(margin.benchmark)} 기준 분포`,
      steps: [
        { k: '내 순수익', v: `매출 ${fmtMan(sales.value)} − 지출 ${fmtMan(expenseWon)} = ${fmtMan(profit.value)}` },
        { k: '비교 분포', v: `매출 분포 × 업종 평균 영업이익률 ${fmtRate(margin.benchmark)} → 동종 순수익 중위 ${fmtMan(profit.peerMedian)}` },
        { k: '계산', v: `유도 분포에서 역보간 → 백분위 ${r1(profit.percentile)}점 = 상위 ${profit.topPercent}%` },
        { k: '종합 반영', v: basisText(W.profit, profit.percentile) },
      ],
      source: '출처: 서울시 추정매출 분포 × 소상공인실태조사 업종 평균 영업이익률',
    },
    {
      key: 'margin', name: '비용 효율',
      valueText: `${r1(margin.score)}점`, pct: margin.score,
      sub: `내 이익률 ${fmtRate(margin.value)} vs 업종 ${fmtRate(margin.benchmark)} (평균=50점)`,
      steps: [
        { k: '내 이익률', v: `순수익 ÷ 매출 = ${fmtRate(margin.value)}` },
        { k: '업종 벤치마크', v: `${rank.benchmarkGroupLabel} 평균 영업이익률 ${fmtRate(margin.benchmark)}` },
        { k: '계산', v: `50 × (내 이익률 ÷ 벤치마크) = ${r1(margin.score)}점 (평균이면 50점, 2배면 100점)` },
        { k: '종합 반영', v: basisText(W.margin, margin.score) },
      ],
      source: '출처: 소상공인실태조사(중소벤처기업부·통계청) 업종 평균 영업이익률',
    },
  ];

  if (costHealth) {
    const b = costHealth.benchmark;
    const rentBench = b ? (b.rentRatioAdjusted != null ? b.rentRatioAdjusted : b.rentRatio) : null;
    const adjusted = b && b.rentRatioAdjusted != null;
    const steps = [
      {
        k: '임차료율',
        v: `${fmtRate(costHealth.rentBurden)}${rentBench != null ? ` vs 업종 ${fmtRate(rentBench)}` : ' (10% 이하 건전 경험칙)'}`
          + (adjusted ? ` (${b.areaType} 임대료 ×${b.areaRentMultiplier} 보정)` : ''),
      },
    ];
    if (costHealth.laborRatio != null && b?.laborRatio != null) steps.push({ k: '인건비율', v: `${fmtRate(costHealth.laborRatio)} vs 업종 ${fmtRate(b.laborRatio)}` });
    if (costHealth.purchaseRatio != null && b?.purchaseRatio != null) steps.push({ k: '원가율', v: `${fmtRate(costHealth.purchaseRatio)} vs 업종 ${fmtRate(b.purchaseRatio)}` });
    steps.push({ k: '계산', v: `항목별 50 × (2 − 내 비율 ÷ 업종 평균) 점수를 평균 → ${r1(costHealth.score)}점` });
    steps.push({ k: '종합 반영', v: `보정축 가중치 ${pctText(W.cost)} = ${contrib(W.cost, costHealth.score)}점 기여` });
    metrics.push({
      key: 'cost', name: '비용 구조',
      valueText: `${r1(costHealth.score)}점`, pct: costHealth.score,
      sub: `임차료율 ${fmtRate(costHealth.rentBurden)}${rentBench != null ? ` vs 업종 ${fmtRate(rentBench)}` : ''}${adjusted ? ` (${b.areaType} 보정)` : ''}`,
      steps,
      source: '출처: KOSIS 소상공인실태조사 2023 비용구조 + 한국부동산원 서울 상가 임대료',
    });
  }

  if (stability) {
    const historyText = (salesHistory || [])
      .map((m) => (m && typeof m === 'object' ? m.amount : m))
      .filter((v) => Number.isFinite(v))
      .map((v) => `${Math.round(v / 1_000_000) / 10}천만`)
      .join(' → ');
    const trendText = `${stability.trendPerMonth >= 0 ? '+' : ''}${fmtRate(stability.trendPerMonth)}`;
    metrics.push({
      key: 'stability', name: '매출 안정성',
      valueText: `${r1(stability.score)}점`, pct: stability.score,
      sub: `최근 ${stability.months}개월 추세 ${trendText}/월 · 변동성 ${fmtRate(stability.volatility)}`,
      steps: [
        { k: '사용 데이터', v: `홈택스 최근 ${stability.months}개월 매출${historyText ? ` (${historyText})` : ''}` },
        { k: '추세', v: `회귀 기울기 ÷ 평균 = ${trendText}/월 → ${r1(stability.trendScore)}점 (0%=50점, ±5%에서 포화)` },
        { k: '변동성', v: `표준편차 ÷ 평균 = ${fmtRate(stability.volatility)} → ${r1(stability.volatilityScore)}점 (5% 이하 100점, 30% 이상 0점)` },
        { k: '계산', v: `추세·변동성 50:50 평균 = ${r1(stability.score)}점` },
        { k: '종합 반영', v: `보정축 가중치 ${pctText(W.stability)} = ${contrib(W.stability, stability.score)}점 기여` },
      ],
      source: '출처: 국세청 홈택스 연동 월별 매출 신고자료',
    });
  }

  return (
    <div className="scr">
      {/* 헤드라인 */}
      <div className="card" style={{ padding: 22 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--muted)' }}>{rank.industryName} 업종에서</p>
        <p style={{ marginTop: 6, fontSize: 38, fontWeight: 900, color: 'var(--blue)', letterSpacing: -1.4, lineHeight: 1.1 }}>
          상위 {rank.topPercent}%
        </p>
        <p style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--muted)' }}>종합 {rank.compositeScore}점 / 100</p>
      </div>

      {/* 지표별 근거 — 지표들을 한 상자에 모으고 줄 사이는 옅은 선으로 나눈다 */}
      <section className="sec-card">
        <div className="sec-card-head"><p className="sec-card-title">지표별 진단</p></div>
        {metrics.map((m, i) => {
          const open = openMetric === m.key;
          return (
            <div key={m.key} style={{
              padding: '14px 2px',
              borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            }}>
              <button onClick={() => setOpenMetric(open ? null : m.key)}
                style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{m.name}</span>
                  <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 800, color: 'var(--muted-faint)' }}>{open ? '근거 접기 ▲' : '근거 보기 ▼'}</span>
                  <span style={{ marginLeft: 'auto', flex: 'none', fontSize: 14.5, fontWeight: 900, color: 'var(--blue)' }}>{m.valueText}</span>
                </div>
                <div style={{ marginTop: 8, height: 9, background: '#EFE8DB', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 5, transition: 'width .6s', background: '#5B8AC4', width: `${Math.max(2, Math.min(100, m.pct))}%` }} />
                </div>
                <p style={{ marginTop: 6, fontSize: 11.5, color: '#A39B8C' }}>{m.sub}</p>
              </button>
              {open && (
                <div className="evidence-box">
                  <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--muted)' }}>이렇게 계산했어요</p>
                  {m.steps.map((st) => (
                    <div key={st.k} className="evidence-row">
                      <span className="evidence-k">{st.k}</span>
                      <span className="evidence-v">{st.v}</span>
                    </div>
                  ))}
                  <p className="evidence-src">{m.source}</p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 산출 기준 · 방법론 — 각주가 길어 기본은 접어두고, 요약 한 줄만 항상 보여준다 */}
      <section className="sec-card">
        <button onClick={() => setShowNotes((v) => !v)}
          style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <div className="sec-card-head" style={{ marginBottom: 0 }}>
            <p className="sec-card-title">산출 기준 · 방법론</p>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--muted-faint)' }}>
              {showNotes ? '접기 ▲' : '자세히 ▼'}
            </span>
          </div>
        </button>

        <p style={{
          background: 'var(--green-bg)', borderRadius: 12, padding: '12px 14px', marginTop: 10,
          fontSize: 12.5, color: 'var(--green)', fontWeight: 700, lineHeight: 1.6,
        }}>
          서울시 상권분석서비스 실측 데이터 기준으로 산출했어요{areaRank ? ` · ${areaRank.areaType} 비교 포함` : ''}
        </p>

        {showNotes && (
        <div className="pop" style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12, padding: '0 2px' }}>
          {[
            ...(rank.notes || []),
            ...(areaRank ? [`${areaRank.areaType}만 비교하면 상위 ${areaRank.topPercent}% (매출 상위 ${areaRank.salesTopPercent}%) 예요.`] : []),
            `비교 모집단: 서울시 ${rank.industryName} 점포 ${peer.nStores.toLocaleString()}개 (상권 ${peer.nAreas.toLocaleString()}곳, 점포수 가중)`,
            ...(meta?.meta ? [`출처: ${meta.meta.sourceDataset} (기준 분기 ${Array.isArray(meta.meta.quartersCovered) ? meta.meta.quartersCovered.join(', ') : ''})`] : []),
          ].map((t, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, paddingLeft: 11, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#CBC3B3' }}>·</span>{t}
            </p>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
