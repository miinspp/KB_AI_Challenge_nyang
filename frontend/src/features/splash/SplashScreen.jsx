import bearOwner from '../../assets/simulator/bear-owner-cutout.png';

/**
 * 앱 첫 표지 — 크림 단색 1장 위에 워드마크(상단)와 곰돌이(하단)만 둔다.
 * 새싹 아이콘 대신 곰돌이가 로고 역할을 하므로 AppIcon 은 쓰지 않는다.
 * '시작'은 곰돌이가 든 하트 위에 얹는다 — 하트 중심은 원본 이미지의 (49.5%, 62.2%) 지점.
 * 화면 아무 곳이나 탭하면 시작.
 */
export default function SplashScreen({ onStart }) {
  return (
    <div className="splash" onClick={onStart} role="button" tabIndex={0} aria-label="든든이 시작하기"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStart(); }}>
      <div className="splash-mark">
        <p className="splash-title">든든이</p>
        <p className="splash-sub">우리 가게, 든든하게</p>
      </div>
      <div className="splash-char-wrap bear-sway">
        <img className="splash-char" src={bearOwner} alt="" aria-hidden="true" />
        <span className="splash-start" aria-hidden="true">시작</span>
      </div>
    </div>
  );
}
