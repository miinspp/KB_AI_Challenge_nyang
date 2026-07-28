import { useMemo, useState } from 'react';
import { fmtWon } from '../../shared/format';
import { KB_ACCOUNT, KB_TXNS, withBalance } from './accountMock';

const FILTERS = [
  ['all', '전체'],
  ['in', '입금'],
  ['out', '출금'],
];

/** "2026-07-25" → "7.25" (토스처럼 좌측 날짜 컬럼에 짧게 표기) */
const shortDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}.${Number(d)}`;
};

/** 한 거래 행 — 왼쪽 날짜(같은 날의 첫 행에만) · 상호/시각 · 금액/거래후잔액 */
function TxnRow({ txn, showDate }) {
  const income = txn.amount > 0;
  return (
    <div className="txn-row">
      <span className="txn-date">{showDate ? shortDate(txn.date) : ''}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="txn-name">{txn.name}</p>
        <p className="txn-time">{txn.time}</p>
      </div>
      <div style={{ flex: 'none', textAlign: 'right' }}>
        <p className="txn-amount" style={{ color: income ? 'var(--green-deep)' : 'var(--ink)' }}>
          {income ? '+' : '−'}{fmtWon(Math.abs(txn.amount))}
        </p>
        <p className="txn-balance">{fmtWon(txn.balance)}</p>
      </div>
    </div>
  );
}

/**
 * KB 사업자계좌 거래내역 — 토스뱅크 통장 화면 구성을 든든이 팔레트로 옮긴 화면.
 * 표시 전용이며 송금·출금 같은 자금 이동 기능은 두지 않는다(조회 전용 연동).
 */
export default function AccountScreen({ onBack, onOpenCostReport }) {
  const [filter, setFilter] = useState('all');

  // 거래후잔액은 항상 전체 내역 기준으로 계산한 뒤 필터링한다(필터가 잔액을 바꾸면 안 됨).
  const rows = useMemo(() => {
    const all = withBalance(KB_TXNS, KB_ACCOUNT.balance);
    if (filter === 'in') return all.filter((t) => t.amount > 0);
    if (filter === 'out') return all.filter((t) => t.amount < 0);
    return all;
  }, [filter]);

  return (
    <div className="acct">
      <div className="acct-bar">
        <button className="hdr-back" onClick={onBack}>‹</button>
        <span className="hdr-title">{KB_ACCOUNT.name}</span>
        <span style={{ width: 38 }} />
      </div>

      {/* 잔액 헤드 */}
      <div className="acct-head">
        <p className="acct-num">{KB_ACCOUNT.bank} {KB_ACCOUNT.number}</p>
        <p className="acct-balance">{fmtWon(KB_ACCOUNT.balance)}</p>
        <p className="acct-rate">{KB_ACCOUNT.rateText}</p>
        <div className="safe-note" style={{ marginTop: 14 }}>
          <span>🔒</span> 조회 전용으로 연결됐어요 · 출금 불가
        </div>
      </div>

      {/* 거래내역 — 필터와 목록을 한 상자에, 같은 날짜는 첫 행에만 날짜를 노출 */}
      <section className="sec-card" style={{ margin: '0 22px' }}>
        <div className="sec-card-head"><p className="sec-card-title">거래내역</p></div>

        <div className="acct-filters" style={{ padding: '4px 0 2px' }}>
          {FILTERS.map(([key, label]) => (
            <button key={key} className={`acct-filter${filter === key ? ' on' : ''}`} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="txn-list">
          {rows.map((t, i) => (
            <TxnRow key={t.id} txn={t} showDate={i === 0 || rows[i - 1].date !== t.date} />
          ))}
          {rows.length === 0 && <p className="txn-empty">해당하는 거래가 없어요.</p>}
        </div>
      </section>

      {onOpenCostReport && (
        <div style={{ padding: '18px 22px 44px' }}>
          <button className="acct-link" onClick={onOpenCostReport}>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>이 거래로 비용 리포트 보기</p>
              <p style={{ fontSize: 11.5, color: 'var(--muted-mid)', marginTop: 3 }}>돈이 어디로 새는지 자동으로 분류해 드려요</p>
            </div>
            <span className="menu-chev">›</span>
          </button>
        </div>
      )}
    </div>
  );
}
