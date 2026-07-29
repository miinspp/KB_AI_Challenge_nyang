import { IconHome, IconDiagnose, IconStar, IconTrendUp, IconPerson } from './Icons';

// 하단 5탭 내비게이션. 오버레이(계좌·홈택스)가 떠 있으면 어떤 탭도 활성으로 보이지 않게 한다.
const TABS = [
  { id: 1, Icon: IconHome, label: '홈' },
  { id: 2, Icon: IconDiagnose, label: '진단' },
  { id: 3, Icon: IconStar, label: '추천' },
  { id: 4, Icon: IconTrendUp, label: '시뮬레이터' },
  { id: 5, Icon: IconPerson, label: '내 정보' },
];

export default function TabBar({ tab, overlay, onGo }) {
  return (
    <nav className="tabbar">
      {TABS.map(({ id, Icon, label }) => {
        const on = tab === id && !overlay;
        return (
          <button key={id} className={`tabbar-item${on ? ' on' : ''}`} onClick={() => onGo(id)}
            aria-current={on ? 'page' : undefined}>
            <span className="tabbar-icon"><Icon size={22} /></span>
            <span className="tabbar-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
