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
    <div className="link-card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{
          flex: 'none', width: 44, height: 44, borderRadius: 14, background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: '#fff',
        }}>{iconLabel}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 15.5, fontWeight: 800, color: '#2B2825' }}>{title}</p>
          <p style={{ fontSize: 12.5, color: '#A79C8E', marginTop: 4, lineHeight: 1.55 }}>{desc}</p>
        </div>
      </div>

      <div className="safe-note">
        <span style={{ color: '#4F7139', fontWeight: 900, fontSize: 12 }}>✓</span>
        <span>조회 전용 · 출금 불가 · 언제든 해지</span>
      </div>

      {status === 'off' && (
        <button className="link-btn" onClick={link}>연동하기</button>
      )}
      {status === 'linking' && (
        <div className="link-btn is-loading">
          <span className="spinner" style={{ width: 18, height: 18, borderWidth: 3 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#8A8178' }}>연동 확인 중…</span>
        </div>
      )}
      {status === 'done' && (
        <div className="link-done">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,.2)',
              color: '#fff', fontWeight: 900, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
            }}>✓</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff', lineHeight: 1.35 }}>연동 완료 · {summary} 반영</span>
          </div>
          <button className="unlink-link" onClick={unlink}>해지</button>
        </div>
      )}
    </div>
  );
}
