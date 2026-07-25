import { useEffect, useRef, useState } from 'react';
import { fmtWon } from '../../shared/format';
import { KB_ACCOUNT } from '../account/accountMock';

// 홈 메뉴 — [배지 글자, 배지색, 제목, 설명, 이동할 화면 index]
const MENU = [
  ['진', 'var(--green-bright)', '우리 가게 진단', '상권 속 내 위치 · 매출 등급', 0],
  ['비', 'var(--blue)', '비용 리포트', '돈이 어디로 새는지 한눈에', 2],
  ['추', '#C4884A', '맞춤 지원 추천', '정책 · 대출 딱 맞는 것만', 3],
  ['시', '#C4564C', '금융 시뮬레이터', '고르면 어떻게 바뀔지 미리', 4],
];

/**
 * 연동 전: 계좌 연결 유도 카드 / 연동 후: 잔액 카드(탭하면 거래내역).
 * 연동 자체는 프로토타입이라 1.2초 지연 후 완료 처리한다(LinkCard 와 동일한 흐름).
 */
function AccountCard({ linked, onLink, onOpen }) {
  const [linking, setLinking] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const link = () => {
    setLinking(true);
    timerRef.current = setTimeout(() => { setLinking(false); onLink(); }, 1200);
  };

  if (!linked) {
    return (
      <div className="acct-card">
        <span className="kb-badge">KB</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>KB 계좌 연결하기</p>
          <p style={{ fontSize: 11.5, color: 'var(--muted-mid)', marginTop: 3 }}>조회 전용 · 출금 불가</p>
        </div>
        {linking
          ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
          : <button className="link-btn" style={{ flex: 'none', width: 'auto', padding: '9px 16px' }} onClick={link}>연결</button>}
      </div>
    );
  }

  return (
    <button className="acct-card is-linked" onClick={onOpen}>
      <span className="kb-badge">KB</span>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <p className="acct-card-balance">{fmtWon(KB_ACCOUNT.balance)}</p>
        <p style={{ fontSize: 12, color: 'var(--muted-mid)', marginTop: 3 }}>{KB_ACCOUNT.name}</p>
      </div>
      <span className="acct-card-cta">내역</span>
    </button>
  );
}

/**
 * 홈 — 앱의 첫 화면. 계좌 요약 · 진단 유도 · 4개 메뉴만 두고 나머지는 각 화면으로 넘긴다.
 * onGo(screenIndex) 로 기존 6단계 플로우의 해당 화면으로 진입한다.
 */
export default function HomeScreen({ kbLinked, onLinkKb, onOpenAccount, onGo }) {
  return (
    <div className="home">
      <p className="home-logo">든든이</p>

      <div>
        <h1 className="h1">혼자 고민하지 마세요<br />우리 가게, 같이 챙길게요</h1>
        <p className="sub" style={{ marginTop: 6 }}>진단부터 비용 점검, 맞춤 지원까지 든든이가 도와드려요</p>
      </div>

      <AccountCard linked={kbLinked} onLink={onLinkKb} onOpen={onOpenAccount} />

      <button className="home-cta" onClick={() => onGo(0)}>
        <p style={{ fontSize: 18.5, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.4 }}>우리 가게부터 진단해요</p>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#7A6420', marginTop: 6 }}>1분이면 상권 속 내 위치를 알 수 있어요</p>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="label-sm" style={{ marginBottom: 2 }}>메뉴</p>
        {MENU.map(([mark, color, title, desc, target]) => (
          <button key={title} className="menu-item" onClick={() => onGo(target)}>
            <span className="menu-badge" style={{ background: color }}>{mark}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{title}</p>
              <p style={{ fontSize: 11.5, color: 'var(--muted-mid)', marginTop: 3 }}>{desc}</p>
            </div>
            <span className="menu-chev">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
