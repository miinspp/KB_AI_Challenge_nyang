// 공용 라인 아이콘 — 이모지/텍스트 배지 대신 쓰는 단순 도형 아이콘.
// 전부 24x24 viewBox, currentColor 스트로크라 부모의 color 값을 그대로 물려받는다.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Svg({ size = 18, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} {...rest}>
      {children}
    </svg>
  );
}

// 상권 유형 — 위치 핀
export function IconMapPin(props) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.3" />
    </Svg>
  );
}

// 지출 세부 — 영수증
export function IconReceipt(props) {
  return (
    <Svg {...props}>
      <path d="M6 3h12v17l-2.3-1.4L13.4 20l-2.3-1.4L8.7 20 6.4 18.6 6 3z" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </Svg>
  );
}

// 자금 상황 — 지갑
export function IconWallet(props) {
  return (
    <Svg {...props}>
      <path d="M3 7.5A2 2 0 0 1 5 5.5h13a1 1 0 0 1 1 1V9" />
      <path d="M3 7.5v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z" />
      <circle cx="16.3" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// 관심사 · 업력 — 별
export function IconStar(props) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9L12 3.5z" />
    </Svg>
  );
}

// 든든이 앱 아이콘 — 라운드 스퀘어 골드 배지 + 새싹(성장을 든든하게 받친다).
// assets/logo-deundeuni.svg 의 "아이콘 단독(앱 아이콘용)" 그룹과 동일한 마크.
export function AppIcon({ size = 88 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="72" height="72" rx="20" fill="#FFBC00" />
      <rect x="19.5" y="49" width="33" height="7" rx="3.5" fill="#fff" />
      <rect x="33.4" y="25" width="5.2" height="26" rx="2.6" fill="#fff" />
      <path d="M36 30 C36 19.5 27 16.5 19.5 18 C19.5 28.5 28.5 33 36 31.5 Z" fill="#fff" />
      <path d="M36 33 C36 24 45 21 52.5 22.5 C52.5 31.5 43.5 36 36 34.5 Z" fill="#fff" />
    </svg>
  );
}

// 우리 가게 진단 — 체크리스트(문진표)
export function IconDiagnose(props) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="4" width="13" height="17" rx="2.2" />
      <rect x="9" y="2.4" width="6" height="3" rx="1" fill="currentColor" stroke="none" />
      <path d="M8.7 12.3l2.1 2.1 4.5-4.8" />
    </Svg>
  );
}

// 실시간 미리보기 — 상승 추세
export function IconTrendUp(props) {
  return (
    <Svg {...props}>
      <path d="M4 16l6-6 4 4 6-7" />
      <path d="M15 7h5v5" />
    </Svg>
  );
}

// 팁 · 안내 — 전구
export function IconTip(props) {
  return (
    <Svg {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.95v.15h5v-.15c0-.8.4-1.5 1-1.95A6 6 0 0 0 12 3z" />
    </Svg>
  );
}

// AI 기능 표시 — 스파클
export function IconSparkle(props) {
  return (
    <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l1.5 4.8L18 9.3l-4.5 1.5L12 15.6l-1.5-4.8L6 9.3l4.5-1.5L12 3z" />
      <path d="M19 14.5l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3z" opacity=".75" />
    </svg>
  );
}

// 탭바 — 홈(집)
export function IconHome(props) {
  return (
    <Svg {...props}>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" />
    </Svg>
  );
}

// 탭바 — 내 정보(사람)
export function IconPerson(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8" />
    </Svg>
  );
}

// 다음 화면 안내 — 화살표
export function IconArrowRight(props) {
  return (
    <Svg {...props}>
      <line x1="4" y1="12" x2="18" y2="12" />
      <path d="M13 6l6 6-6 6" />
    </Svg>
  );
}
