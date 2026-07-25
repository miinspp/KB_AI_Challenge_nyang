// 앱 첫 표지 화면 — 단색 골드 배경 + 둥근 글씨(Jua) 로고. 탭하면 시작.
export default function SplashScreen({ onStart }) {
  return (
    <div
      onClick={onStart}
      style={{
        position: 'absolute', inset: 0, background: '#FFC01E',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Jua', sans-serif", fontSize: 60, color: 'var(--ink)', letterSpacing: '-1px' }}>
          든든이
        </div>
        <div style={{ marginTop: 14, fontFamily: "'Jua', sans-serif", fontSize: 17, color: '#6B5A1E', letterSpacing: '.5px' }}>
          우리 가게, 든든하게
        </div>
      </div>
      <span style={{
        position: 'absolute', bottom: 40, fontFamily: "'Jua', sans-serif",
        fontSize: 14, color: '#A5811A',
      }}>
        시작하기
      </span>
    </div>
  );
}
