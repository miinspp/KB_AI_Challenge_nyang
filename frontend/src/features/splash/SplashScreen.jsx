import bearOwner from '../../assets/simulator/bear-owner-cutout.png';

/**
 * 앱 첫 표지 — 크림 단색 1장 위에 워드마크(상단)와 곰돌이(하단)만 둔다.
 * 새싹 아이콘 대신 곰돌이가 로고 역할을 하므로 AppIcon 은 쓰지 않는다.
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
      <img className="splash-char" src={bearOwner} alt="" aria-hidden="true" />
    </div>
  );
}
