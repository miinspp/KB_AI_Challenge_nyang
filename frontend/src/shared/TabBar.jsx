// 하단 5탭 내비게이션. 오버레이(계좌·홈택스)가 떠 있으면 어떤 탭도 활성으로 보이지 않게 한다.
const TABS = [
  { id: 1, mark: '홈', label: '홈' },
  { id: 2, mark: '진', label: '우리 가게 진단' },
  { id: 3, mark: '추', label: '맞춤 추천' },
  { id: 4, mark: '시', label: '시뮬레이터' },
  { id: 5, mark: '나', label: '내 정보' },
];

export default function TabBar({ tab, overlay, onGo }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => {
        const on = tab === t.id && !overlay;
        return (
          <button key={t.id} className="tabbar-item" onClick={() => onGo(t.id)} aria-current={on ? 'page' : undefined}>
            <span className="tabbar-badge" style={{
              background: on ? 'var(--gold)' : '#F5EFE2',
              color: on ? 'var(--ink)' : 'var(--muted-soft)',
            }}>{t.mark}</span>
            <span className="tabbar-label" style={{ color: on ? 'var(--ink)' : 'var(--muted-soft)' }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
