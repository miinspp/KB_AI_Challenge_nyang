/**
 * 탭 안의 단계 전환 세그먼트 (진단: 입력·리포트·비용 / 시뮬: 시뮬레이터·포트폴리오).
 * steps: [{ key, label, locked }] — locked 인 단계는 아직 볼 수 없어 회색으로 잠근다.
 */
export default function StepTabs({ steps, value, onChange }) {
  return (
    <div className="steptabs" style={{ gridTemplateColumns: `repeat(${steps.length},1fr)` }}>
      {steps.map((s) => {
        const on = value === s.key && !s.locked;
        return (
          <button key={s.key} className={`steptab${on ? ' on' : ''}`}
            disabled={s.locked}
            title={s.locked ? '진단을 마치면 볼 수 있어요' : undefined}
            onClick={() => { if (!s.locked) onChange(s.key); }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
