import { useEffect, useRef, useState } from 'react';

/**
 * 정보제공 동의 카드 — KB 계좌 마이데이터 / 국세청 홈택스 연동을 한 장의 큰 카드로 표현.
 *   off → linking(확인 중) → done(연동 완료·요약 노출)
 * "조회 전용·출금 불가·언제든 해지" 안심 문구를 항상 노출하고,
 * 연동이 완료되면 buildFinancials()가 만든 재무 요약을 onLinked(f)로 상위에 전달해
 * 아래 입력 항목이 자동으로 채워진다. (프로토타입: 시뮬레이션 데이터, 실서비스는 인증·스크래핑으로 교체)
 *
 * linked: 홈 화면 등 이 카드 밖에서 이미 연동된 경우 done 상태로 시작·동기화한다.
 * row:    섹션 카드(.sec-card) 안에 여러 개를 줄로 넣을 때 — 카드 테두리를 벗는다.
 */
export default function LinkCard({ iconLabel, iconBg, iconColor = '#fff', title, desc, summary, linked = false, row = false, buildFinancials, onLinked, onUnlink }) {
  const [status, setStatus] = useState(linked ? 'done' : 'off'); // off | linking | done
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  // 외부에서 연동되면 즉시 done 으로 맞춘다(해제는 이 카드의 unlink 가 담당).
  useEffect(() => { if (linked) setStatus('done'); }, [linked]);

  const link = () => {
    setStatus('linking');
    timerRef.current = setTimeout(() => {
      onLinked(buildFinancials());
      setStatus('done');
    }, 1200);
  };

  const unlink = () => {
    clearTimeout(timerRef.current);
    setStatus('off');
    onUnlink && onUnlink();
  };

  // desc: 상태별 안내문(예: 연동 전 "매출·지출·12개월 추이 한 번에" / 완료 "…불러옴"). 없으면 기본 안심 문구.
  const descText = (status === 'done' ? summary : desc) || desc || '조회 전용 · 출금 불가';

  return (
    <div
      className={row ? 'sec-row' : 'link-card'}
      style={!row && status === 'done' ? { borderColor: 'var(--green-border)' } : undefined}
    >
      <span style={{
        flex: 'none', width: 40, height: 40, borderRadius: 12, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12.5, color: iconColor,
      }}>{iconLabel}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{title}</p>
        <p style={{ fontSize: 11.5, color: status === 'done' ? 'var(--green)' : 'var(--muted-mid)', marginTop: 2 }}>{descText}</p>
      </div>

      {status === 'off' && (
        <button className="link-btn" style={{ flex: 'none', width: 'auto', padding: '9px 16px' }} onClick={link}>연동</button>
      )}
      {status === 'linking' && (
        <span className="spinner" style={{ flex: 'none', width: 20, height: 20, borderWidth: 3 }} />
      )}
      {status === 'done' && (
        <button className="unlink-link" onClick={unlink}>✓ 연동됨</button>
      )}
    </div>
  );
}
