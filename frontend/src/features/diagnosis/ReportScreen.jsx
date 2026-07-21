import { useState } from 'react';
import DistributionChart from './DistributionChart';
import { fmtMan, fmtRate } from '../../shared/format';

/**
 * 화면 2 — 진단 리포트. 전적으로 백엔드 /api/rank 응답으로 구성된다.
 *   매출·순수익은 서울시 추정매출 실측 분포 기준 상위 %,
 *   비용효율은 업종 평균 영업이익률(소상공인실태조사) 대비 점수.
 *   costHealth(임대료 부담률)·stability(매출 추세·변동성)는 입력이 있을 때만 내려오는 보정축.
 */
export default function ReportScreen({ rank, detail, meta, salesHistory }) {
  const [showNotes, setShowNotes] = useState(false);

  if (!rank) {
    return (
      <div className="scr" style={{ alignItems: 'center', paddingTop: 80 }}>
        <span className="spinner" />
        <p style={{ fontSize: 13, color: '#8A8178' }}>서울시 공공데이터와 비교 분석 중이에요…</p>
      </div>
    );
  }

  const { sales, profit, margin, areaRank, peer, costHealth, stability } = rank;

  return (
    <div className="scr">
      {/* 헤드라인 */}
      <div style={{ background: 'linear-gradient(165deg,#FFE9A8,#FFF3D2)', borderRadius: 22, padding: 22 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#9A7B1E' }}>
          서울 {rank.industryName} {peer.nStores.toLocaleString()}곳 중
        </p>
        <p style={{ marginTop: 6, fontSize: 34, fontWeight: 900, color: '#2B2825', letterSpacing: -1 }}>
          상위 {rank.topPercent}%<span style={{ fontSize: 16, fontWeight: 800, color: '#6B6259' }}>&nbsp;사장님이에요</span>
        </p>
        <p style={{ marginTop: 8, fontSize: 12.5, color: '#8A7A55', lineHeight: 1.6 }}>
          매출·순수익·비용효율{costHealth ? '·비용구조' : ''}{stability ? '·매출안정성' : ''}을
          종합한 결과예요 (종합점수 {rank.compositeScore}점).
        </p>
      </div>

      {/* 실측 분포 곡선 */}
      {detail?.quantiles && (
        <DistributionChart
          quantiles={detail.quantiles}
          myValue={sales.value}
          salesPercentile={sales.percentile}
        />
      )}

      {/* 상권유형 비교 (선택 시) */}
      {areaRank && (
        <div style={{ background: '#EDF5E1', border: '1.5px solid #DCEBC6', borderRadius: 18, padding: '15px 17px' }}>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#5E8A3E' }}>같은 <b>{areaRank.areaType}</b>만 비교하면</p>
          <p style={{ marginTop: 5, fontSize: 22, fontWeight: 900, color: '#2B2825' }}>
            상위 {areaRank.topPercent}%
            <span style={{ fontSize: 12, fontWeight: 700, color: '#7C9463' }}>
              {' '}· 매출 상위 {areaRank.salesTopPercent}%
            </span>
          </p>
          <p style={{ marginTop: 4, fontSize: 11.5, color: '#7C9463' }}>
            {areaRank.areaType} 점포 {areaRank.nStores.toLocaleString()}곳 · 중위 월매출 {fmtMan(areaRank.peerMedian)}
          </p>
        </div>
      )}

      {/* 3대 지표 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MetricCard
          name="월 매출" topPercent={sales.topPercent} pct={sales.percentile}
          value={fmtMan(sales.value)} barColor="#FFC24B"
          note={`동종 중위 ${fmtMan(sales.peerMedian)}`}
          sub={`P25 ${fmtMan(sales.peerP25)} ~ P75 ${fmtMan(sales.peerP75)}`}
        />
        <MetricCard
          name="월 순수익" topPercent={profit.topPercent} pct={profit.percentile}
          value={fmtMan(profit.value)} barColor="#8DBB6C"
          note={`동종 추정 중위 ${fmtMan(profit.peerMedian)}`}
          sub="매출 − 지출 기준 · 업종 평균 이익률로 분포 추정"
        />
        <MetricCard
          name="비용 효율" topPercent={null} pct={margin.score} score={margin.score}
          value={fmtRate(margin.value)} barColor="#E8B93E"
          note={`업종 벤치마크 ${fmtRate(margin.benchmark)}`}
          sub={`${rank.benchmarkGroupLabel} 평균 영업이익률 대비 (평균=50점)`}
        />
      </div>

      {/* 보정축 — 비용 구조 (임대료 부담률) */}
      {costHealth && <CostHealthCard ch={costHealth} />}

      {/* 보정축 — 매출 안정성 (추세·변동성) */}
      {stability && <StabilityCard st={stability} history={salesHistory} />}

      {/* 모집단 */}
      <div style={{ background: '#FBF7EE', borderRadius: 14, padding: '12px 15px' }}>
        <p style={{ fontSize: 11.5, color: '#8A8178', lineHeight: 1.6 }}>
          비교 모집단 · 서울시 {rank.industryName} 점포 {peer.nStores.toLocaleString()}개
          (상권 {peer.nAreas.toLocaleString()}곳의 점포당 매출 분포, 점포수 가중)
        </p>
      </div>

      {/* 산출 근거 */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <button onClick={() => setShowNotes((s) => !s)} style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#8A8178' }}>산출 근거 · 방법론</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#C4BAAD' }}>{showNotes ? '접기 ▲' : '보기 ▼'}</span>
        </button>
        {showNotes && (
          <ul className="pop" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7, listStyle: 'none' }}>
            {rank.notes.map((n, i) => (
              <li key={i} style={{ fontSize: 11.5, color: '#8A8178', lineHeight: 1.6, paddingLeft: 12, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#D8CDBB' }}>·</span>{n}
              </li>
            ))}
            {meta?.meta && (
              <li style={{ fontSize: 11, color: '#B9B0A4', lineHeight: 1.6, paddingLeft: 12, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#D8CDBB' }}>·</span>
                출처: {meta.meta.sourceDataset} (기준 분기 {Array.isArray(meta.meta.quartersCovered) ? meta.meta.quartersCovered.join(', ') : ''})
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 임대료 부담률 게이지 — 0~25% 스케일에 10% 건전선 표시. */
function CostHealthCard({ ch }) {
  const burden = ch.rentBurden * 100;                       // %
  const pos = Math.min(100, (burden / 25) * 100);           // 게이지 상 위치 (25% = 끝)
  const healthy = burden <= 10;
  return (
    <div className="card" style={{ borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#8A8178' }}>
          비용 구조 건전성
          <span style={{ marginLeft: 7, fontSize: 11.5, fontWeight: 800, color: '#B08A2E' }}>{ch.score}점 / 100</span>
        </span>
        <span style={{ fontSize: 15, fontWeight: 900, color: healthy ? '#5E8A3E' : '#D0564C' }}>
          임대료 부담률 {burden.toFixed(1)}%
        </span>
      </div>
      <div style={{ marginTop: 12, height: 8, borderRadius: 4, position: 'relative',
        background: 'linear-gradient(90deg,#DCEBC6 0%,#DCEBC6 40%,#F3E4C0 40%,#F3E4C0 70%,#F5D9D6 70%)' }}>
        {/* 10% 건전선 (게이지의 40% 지점) */}
        <div style={{ position: 'absolute', left: '40%', top: -3, width: 2, height: 14, background: '#8DBB6C', borderRadius: 1 }} />
        <div style={{ position: 'absolute', left: `calc(${pos}% - 6px)`, top: -2, width: 12, height: 12,
          borderRadius: '50%', background: healthy ? '#8DBB6C' : '#D0564C', border: '2.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#B9B0A4' }}>
        <span>10% 이하 건전 · 25% 이상 위험 (경험칙)</span>
        <span>
          {ch.purchaseRatio != null && `재료비 ${(ch.purchaseRatio * 100).toFixed(0)}%`}
          {ch.purchaseRatio != null && ch.laborRatio != null && ' · '}
          {ch.laborRatio != null && `인건비 ${(ch.laborRatio * 100).toFixed(0)}%`}
        </span>
      </div>
    </div>
  );
}

/** 매출 안정성 — 최근 월별 매출 스파크라인 + 추세·변동성 점수. */
function StabilityCard({ st, history }) {
  const amounts = (history || []).map((m) => m.amount);
  let spark = null;
  if (amounts.length >= 3) {
    const W = 120, H = 34, min = Math.min(...amounts), max = Math.max(...amounts);
    const span = max - min || 1;
    const pts = amounts.map((v, i) => {
      const x = 4 + (i / (amounts.length - 1)) * (W - 8);
      const y = H - 5 - ((v - min) / span) * (H - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    spark = (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 120, height: 34, flex: 'none' }}>
        <polyline points={pts} fill="none" stroke="#E8B93E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const trendPct = (st.trendPerMonth * 100).toFixed(1);
  const up = st.trendPerMonth >= 0;
  return (
    <div className="card" style={{ borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#8A8178' }}>
            매출 안정성
            <span style={{ marginLeft: 7, fontSize: 11.5, fontWeight: 800, color: '#B08A2E' }}>{st.score}점 / 100</span>
          </span>
          <p style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.7, color: '#6B6259' }}>
            추세 <b style={{ color: up ? '#5E8A3E' : '#D0564C' }}>{up ? '+' : ''}{trendPct}%/월</b>
            <span style={{ color: '#C4BAAD' }}> ({st.trendScore}점)</span>
            <br />
            변동성 <b style={{ color: st.volatility <= 0.15 ? '#5E8A3E' : '#D0564C' }}>{(st.volatility * 100).toFixed(1)}%</b>
            <span style={{ color: '#C4BAAD' }}> ({st.volatilityScore}점)</span>
          </p>
        </div>
        {spark}
      </div>
      <p style={{ marginTop: 7, fontSize: 11, color: '#B9B0A4' }}>
        최근 {st.months}개월 매출 기준 · 홈택스 연동 자료
      </p>
    </div>
  );
}

function MetricCard({ name, topPercent, pct, value, barColor, note, sub, score }) {
  return (
    <div className="card" style={{ borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#8A8178' }}>
          {name}
          {topPercent != null
            ? <span style={{ marginLeft: 7, fontSize: 11.5, fontWeight: 800, color: '#5E8A3E' }}>상위 {topPercent}%</span>
            : <span style={{ marginLeft: 7, fontSize: 11.5, fontWeight: 800, color: '#B08A2E' }}>{score}점 / 100</span>}
        </span>
        <span style={{ fontSize: 15, fontWeight: 900, color: '#2B2825' }}>{value}</span>
      </div>
      <div style={{ marginTop: 10, height: 8, background: '#F5EFE3', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: 8, borderRadius: 4, background: barColor, width: `${Math.max(2, Math.min(100, pct))}%`, transition: 'width .6s' }} />
      </div>
      <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#B9B0A4' }}>
        <span>{sub}</span><span>{note}</span>
      </div>
    </div>
  );
}
