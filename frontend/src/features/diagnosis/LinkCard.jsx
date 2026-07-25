import { useEffect, useRef, useState } from 'react';

/**
 * 정보제공 동의 카드 — KB 계좌 마이데이터 / 국세청 홈택스 연동을 한 장의 큰 카드로 표현.
 *   off → linking(확인 중) → done(연동 완료·요약 노출)
 * "조회 전용·출금 불가·언제든 해지" 안심 문구를 항상 노출하고,
 * 연동이 완료되면 buildFinancials()가 만든 재무 요약을 onLinked(f)로 상위에 전달해
 * 아래 입력 항목이 자동으로 채워진다. (프로토타입: 시뮬레이션 데이터, 실서비스는 인증·스크래핑으로 교체)
 */
export default function LinkCard({ iconLabel, iconBg, title, desc, summary, buildFinancials, onLinked, onUnlink }) {
  const [status, setStatus] = useState('off'); // off | linking | done
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

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

  return (
    <div className="link-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
      <span style={{
        flex: 'none', width: 40, height: 40, borderRadius: 12, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12.5, color: '#fff',
      }}>{iconLabel}</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14.5, fontWeight: 800, color: '#2B2825' }}>{title}</p>
        <p style={{ fontSize: 11.5, color: '#A79C8E', marginTop: 2 }}>조회 전용 · 출금 불가</p>
      </div>

      {status === 'off' && (
        <button className="link-btn" style={{ flex: 'none', width: 'auto', padding: '9px 16px' }} onClick={link}>연동</button>
      )}
      {status === 'linking' && (
        <span className="spinner" style={{ flex: 'none', width: 20, height: 20, borderWidth: 3 }} />
      )}
      {status === 'done' && (
        <button className="unlink-link" style={{ flex: 'none' }} onClick={unlink}>
          <span style={{ color: '#4F7139', fontWeight: 900, marginRight: 4 }}>✓</span>연동됨
        </button>
      )}
    </div>
  );
}
