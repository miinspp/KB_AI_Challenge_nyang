import { useEffect, useRef, useState } from 'react';
import { fmtWon } from '../../shared/format';
import { KB_ACCOUNT, HOMETAX_FINANCIALS, JOINED_PRODUCTS } from '../account/accountMock';
import bearOwner from '../../assets/simulator/bear-owner-cutout.png';

/**
 * 연동 한 줄 — 연동 전에는 '연결' 버튼, 연동 후에는 줄 전체가 상세 화면으로 가는 버튼이 된다.
 * 섹션 카드(.sec-card) 안에 여러 줄이 들어가므로 카드 테두리는 갖지 않는다.
 * 연동 자체는 프로토타입이라 1.2초 지연 후 완료 처리한다(LinkCard 와 동일한 흐름).
 */
function LinkRow({
  linked, badge, badgeBg, badgeColor = '#fff',
  title, desc, headline, sub, cta, onLink, onOpen,
}) {
  const [linking, setLinking] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const link = () => {
    setLinking(true);
    timerRef.current = setTimeout(() => { setLinking(false); onLink(); }, 1200);
  };

  const badgeEl = (
    <span className="kb-badge" style={{ background: badgeBg, color: badgeColor }}>{badge}</span>
  );

  if (linked) {
    return (
      <button className="sec-row" onClick={onOpen}>
        {badgeEl}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="acct-card-balance">{headline}</p>
          <p style={{ fontSize: 12, color: 'var(--muted-mid)', marginTop: 3 }}>{sub}</p>
        </div>
        <span className="acct-card-cta">{cta}</span>
      </button>
    );
  }

  return (
    <div className="sec-row">
      {badgeEl}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{title}</p>
        <p style={{ fontSize: 11.5, color: 'var(--muted-mid)', marginTop: 3 }}>{desc}</p>
      </div>
      {linking
        ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
        : <button className="link-btn" style={{ flex: 'none', width: 'auto', padding: '9px 16px' }} onClick={link}>연결</button>}
    </div>
  );
}

/**
 * 탭1 홈 — 진단 유도 · 연동 상태 · 이미 가입한 상품 · 진단 요약.
 * 연동(계좌·매출)과 가입 상품을 각각 하나의 섹션 카드로 묶어 보여준다.
 * 가입 상품은 KB 계좌를 연결해야 불러온다는 설정이라 연동 전에는 안내만 보여준다.
 * (시뮬레이터의 '장착'은 가상 실험이라 여기와 별개다 — accountMock.JOINED_PRODUCTS 참고)
 */
export default function HomeScreen({
  kbLinked, onLinkKb, onOpenAccount,
  hometaxLinked, onLinkHometax, onOpenHometax,
  rank, onGoDiagnose, onGoReport, onGoRecommend,
}) {
  // 연동 묶음의 '더 보기' — 연동된 쪽 상세로, 아무것도 없으면 진단 입력으로 보낸다.
  const openLinked = kbLinked ? onOpenAccount : (hometaxLinked ? onOpenHometax : onGoDiagnose);

  return (
    <div className="home home--hero">
      {/* 히어로 — 로고·말풍선은 왼쪽, 곰돌이는 오른쪽에 크게 */}
      <header className="hero">
        <div className="hero-copy">
          <p className="home-logo">든든이</p>
          <p className="hero-bubble">사장님, 1분이면 끝나요</p>
        </div>
        <img src={bearOwner} className="hero-char bear-sway" alt="" aria-hidden="true" />
      </header>

      <div className="home-body">
        {/* 진단 유도 — 다크 카드 */}
        <section className="cta-card">
          <p className="cta-card-eyebrow">{rank ? '진단 완료' : '진단 전'}</p>
          <p className="cta-card-title">
            {rank
              ? <>지금 <b>상위 {rank.topPercent}%</b><br />리포트를 다시 볼까요</>
              : <>업종 · 월매출 · 월지출<br />3개만 알려주세요</>}
          </p>
          <button className="cta-card-btn" onClick={rank ? onGoReport : onGoDiagnose}>
            {rank ? '진단 리포트 보기' : '진단 시작'}
          </button>
        </section>

        {/* 연동 — 계좌·매출 */}
        <section className="sec-card">
          <LinkRow
            linked={kbLinked} badge="KB" badgeBg="var(--kb)" badgeColor="var(--ink)"
            title="KB 계좌 연결" desc="보유현금 · 기존 대출 자동 입력"
            headline={fmtWon(KB_ACCOUNT.balance)} sub={KB_ACCOUNT.name} cta="내역"
            onLink={onLinkKb} onOpen={onOpenAccount}
          />
          <LinkRow
            linked={hometaxLinked} badge="홈택스" badgeBg="var(--hometax)"
            title="홈택스 연결" desc="매출 · 지출 · 12개월 추이"
            headline={fmtWon(HOMETAX_FINANCIALS.monthlySalesAvg)}
            sub={`${HOMETAX_FINANCIALS.basisPeriod} 월평균 매출 · 홈택스`} cta="상세"
            onLink={onLinkHometax} onOpen={onOpenHometax}
          />
          <button className="sec-more" onClick={openLinked}>
            내 계좌 · 매출 · 지출 보기 <span aria-hidden="true">›</span>
          </button>
        </section>

      {/* 가입 상품 묶음 — 마이데이터로 불러온 것(mock) */}
      <section className="sec-card">
        <div className="sec-card-head">
          <p className="sec-card-title">현재 가입한 상품</p>
          {kbLinked && <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted-faint)' }}>{JOINED_PRODUCTS.length}개</p>}
        </div>

        {kbLinked ? JOINED_PRODUCTS.map((p) => (
          <div key={p.id} className="sec-row">
            <span className="icon-badge" style={{ width: 40, height: 40, fontSize: 18, background: p.iconBg, color: p.iconColor }}>{p.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', letterSpacing: -.3 }}>{p.name}</p>
              <p style={{ fontSize: 11.5, color: 'var(--muted-mid)', marginTop: 3 }}>{p.spec}</p>
            </div>
            <span className="src-badge" style={{ flex: 'none' }}>{p.status}</span>
          </div>
        )) : (
          <div className="sec-empty">
            <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--muted)' }}>KB 계좌를 연결하면 보여드려요</p>
            <p style={{ fontSize: 12, color: 'var(--muted-faint)', marginTop: 5 }}>이용 중인 대출·공제·카드를 한눈에</p>
          </div>
        )}

        <button className="sec-more" onClick={onGoRecommend}>
          맞춤 상품 추천 보기 <span aria-hidden="true">›</span>
        </button>
      </section>

        {/* 내 가게 진단 요약 — 진단을 마쳤을 때만 */}
        {rank && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="label-sm">내 가게 진단</p>
            <button className="rank-card" onClick={onGoReport}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--muted)' }}>{rank.industryName} 업종에서</p>
              <p style={{ marginTop: 6, fontSize: 38, fontWeight: 900, color: 'var(--blue)', letterSpacing: -1.4, lineHeight: 1.1 }}>
                상위 {rank.topPercent}%
              </p>
              <p style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--muted)' }}>종합 {rank.compositeScore}점 / 100</p>
              <p style={{ marginTop: 14, fontSize: 12, fontWeight: 800, color: 'var(--gold-link)' }}>진단 리포트 자세히 보기 ›</p>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
