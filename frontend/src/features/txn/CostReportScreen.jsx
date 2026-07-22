import { useState } from 'react';
import { fmtMan } from '../../shared/format';

// 카테고리 그룹별 색상 — 리포트 막대·라벨에 공통 사용.
const GROUP_META = {
  수입: { color: '#8DBB6C', bg: '#F2F7EC' },
  고정비: { color: '#D0564C', bg: '#FBEEEC' },
  변동비: { color: '#E0A93C', bg: '#FBF4E6' },
  금융: { color: '#7E8BC4', bg: '#EEF0F8' },
};
const EXPENSE_GROUPS = ['고정비', '변동비', '금융'];

/** 상단 요약 숫자 카드 */
function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ flex: 1, padding: '12px 10px', textAlign: 'center', gap: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8178' }}>{label}</p>
      <p style={{ fontSize: 15.5, fontWeight: 900, color, letterSpacing: -.3 }}>{value}</p>
    </div>
  );
}

/** 한 카테고리 = 라벨 + 금액 막대 (막대 폭은 그 달 최대 카테고리 대비 비율) */
function CategoryBar({ cat, max }) {
  const meta = GROUP_META[cat.group] || GROUP_META.변동비;
  const pct = max > 0 ? Math.max(4, Math.round((cat.amount / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ flex: 'none', width: 92, fontSize: 12, fontWeight: 700, color: '#2B2825' }}>{cat.label}</span>
      <div style={{ flex: 1, height: 18, background: '#F5EFE2', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 6 }} />
      </div>
      <span style={{ flex: 'none', width: 78, textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: '#4A453E' }}>
        {fmtMan(cat.amount)}
      </span>
    </div>
  );
}

/** 그룹 소계 헤더 + 그 그룹 카테고리 막대들 */
function GroupBlock({ group, cats, max }) {
  const meta = GROUP_META[group];
  const subtotal = cats.reduce((s, c) => s + c.amount, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className="tag" style={{ color: meta.color, background: meta.bg }}>{group}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 900, color: meta.color }}>{fmtMan(subtotal)}</span>
      </div>
      {cats.map((c) => <CategoryBar key={c.code} cat={c} max={max} />)}
    </div>
  );
}

export default function CostReportScreen({ report }) {
  const [sel, setSel] = useState(null);

  if (!report) {
    return <div className="scr"><p style={{ color: '#8A8178', fontSize: 13 }}>비용 리포트를 불러오는 중이에요…</p></div>;
  }

  const months = report.months;
  const idx = sel == null ? months.length - 1 : Math.min(sel, months.length - 1);  // 기본: 최근 달
  const m = months[idx];
  const maxAmount = Math.max(...m.categories.map((c) => c.amount), 1);

  const incomeCats = m.categories.filter((c) => c.group === '수입');
  const expenseByGroup = EXPENSE_GROUPS
    .map((g) => ({ group: g, cats: m.categories.filter((c) => c.group === g) }))
    .filter((x) => x.cats.length > 0);

  return (
    <div className="scr" style={{ gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 900, color: '#2B2825', letterSpacing: -.4, lineHeight: 1.4 }}>
          우리 가게 비용 리포트
        </h2>
        <p style={{ marginTop: 6, fontSize: 13, color: '#8A8178' }}>
          마이데이터 거래 {report.meta.txnCount}건을 자동으로 분류했어요.
        </p>
      </div>

      {/* 월 선택 탭 */}
      <div style={{ display: 'flex', gap: 6 }}>
        {months.map((mm, i) => {
          const active = i === idx;
          return (
            <button key={mm.month} onClick={() => setSel(i)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 800, letterSpacing: -.2,
                background: active ? '#FFBC00' : '#F5EFE2', color: active ? '#2B2825' : '#A79C8E',
              }}>
              {mm.month.slice(5)}월
            </button>
          );
        })}
      </div>

      {/* 손익 요약 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <StatCard label="수입" value={fmtMan(m.income)} color="#5C9A3A" />
        <StatCard label="비용" value={fmtMan(m.expense)} color="#D0564C" />
        <StatCard label="손익" value={fmtMan(m.profit)} color={m.profit >= 0 ? '#5C9A3A' : '#D0564C'} />
      </div>
      <p style={{ fontSize: 11.5, color: '#8A7A55', background: '#FBF7EE', borderRadius: 10, padding: '9px 12px', lineHeight: 1.5, fontWeight: 600 }}>
        💡 손익은 대출 원금상환을 뺀 실제 손익이에요. 통장 기준 순현금은 <b>{fmtMan(m.netCash)}</b>.
      </p>

      {/* 수입 */}
      <div className="card" style={{ gap: 11 }}>
        <GroupBlock group="수입" cats={incomeCats} max={maxAmount} />
      </div>

      {/* 비용(그룹별) */}
      <div className="card" style={{ gap: 15 }}>
        {expenseByGroup.map(({ group, cats }) => (
          <GroupBlock key={group} group={group} cats={cats} max={maxAmount} />
        ))}
      </div>

      {/* 개선 제안 */}
      {report.suggestions?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 900, color: '#2B2825' }}>이렇게 개선해 보세요</p>
          {report.suggestions.map((s) => {
            const warn = s.status === 'warn';
            return (
              <div key={s.metric} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
                <span style={{ flex: 'none', fontSize: 16 }}>{warn ? '⚠️' : '✅'}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 800, color: '#2B2825' }}>
                    {s.metric} <span style={{ color: warn ? '#D0564C' : '#5C9A3A' }}>{s.value}%</span>
                  </p>
                  <p style={{ fontSize: 11.5, color: '#8A8178', marginTop: 2 }}>{s.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 확인 필요 거래 */}
      {report.reviewQueue?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 900, color: '#2B2825' }}>
            확인이 필요한 거래 <span style={{ color: '#B08F3C' }}>{report.reviewQueue.length}건</span>
          </p>
          <p style={{ fontSize: 11.5, color: '#8A8178', marginTop: -4 }}>분류가 애매한 거래예요. 맞는 항목으로 바로잡아 주세요.</p>
          {report.reviewQueue.map((r) => (
            <div key={r.txnId} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 13px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: '#2B2825' }}>{r.merchant}</p>
                <p style={{ fontSize: 11, color: '#A79C8E', marginTop: 2 }}>{r.date} · {fmtMan(r.amount)}</p>
              </div>
              <span className="spec" style={{ fontSize: 10.5, color: '#B08F3C' }}>{r.guess}?</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
