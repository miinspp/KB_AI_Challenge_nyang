import { AppIcon } from '../../shared/Icons';

// 앱 첫 표지 화면 — 화이트→골드 그라데이션 배경 + 앱 아이콘. 탭하면 시작.
export default function SplashScreen({ onStart }) {
  return (
    <div
      onClick={onStart}
      style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFBF0 45%, #FFF3D2 78%, #FFE9AE 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', filter: 'drop-shadow(0 10px 20px rgba(255,188,0,.35))' }}>
          <AppIcon size={88} />
        </div>
        <div style={{ marginTop: 18, fontWeight: 800, fontSize: 20, color: 'var(--ink)', letterSpacing: '-.4px' }}>
          든든이
        </div>
        <div style={{ marginTop: 6, fontWeight: 600, fontSize: 13.5, color: 'var(--muted)', letterSpacing: '-.1px' }}>
          우리 가게, 든든하게
        </div>
      </div>
      <span style={{
        position: 'absolute', bottom: 40, fontWeight: 700,
        fontSize: 13.5, color: '#A5811A',
      }}>
        시작하기
      </span>
    </div>
  );
}
