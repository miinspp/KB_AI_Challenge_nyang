import bearOwner from '../../assets/simulator/bear-owner-cutout.png';
import rabbitOwner from '../../assets/simulator/rabbit-owner-cutout-v2.png';

/**
 * 앱 첫 표지 — 크림에서 잔디로 이어지는 배경 위에 워드마크(상단)와
 * 사장님 부부(토끼·곰돌이)를 세우고, 아래에 '시작하기' 버튼을 둔다.
 * 화면 아무 곳이나 탭해도 시작되고, 버튼은 눌러야 한다는 걸 명확히 보여주는 역할이다.
 */
export default function SplashScreen({ onStart }) {
  return (
    <div className="splash" onClick={onStart} role="button" tabIndex={0} aria-label="든든이 시작하기"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStart(); }}>
      <div className="splash-mark">
        <p className="splash-title">든든이</p>
        <p className="splash-sub">우리 가게, 든든하게</p>
      </div>

      <div className="splash-stage">
        {/* 발끝을 같은 바닥선에 맞춰 세운다 — 토끼는 귀 때문에 원본이 더 높다 */}
        <div className="splash-couple">
          <img className="splash-char splash-char--rabbit bear-sway" src={rabbitOwner} alt="" aria-hidden="true" />
          <img className="splash-char splash-char--bear bear-sway" src={bearOwner} alt="" aria-hidden="true" />
        </div>
        <span className="splash-caption">우리 동네 사장님 부부</span>
      </div>

      <button className="splash-btn" onClick={onStart}>시작하기</button>
    </div>
  );
}
