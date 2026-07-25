import { useEffect, useState } from 'react';
import { fmtMan } from '../../shared/format';
import { postTxnCorrection } from '../../api/txn';

// 교정 시 고를 수 있는 카테고리(코드, 라벨) — taxonomy 주요 항목.
const PICK = [
  ['SALES_CASH', '현금·계좌 매출'], ['SALES_CARD', '카드매출'], ['SALES_DELIVERY', '배달매출'],
  ['OTHER_INCOME', '기타수입'], ['RENT', '임대료(월세)'], ['LABOR', '인건비'],
  ['SUPPLIES', '매입·원재료'], ['UTILITIES', '공과금'], ['COMMS', '통신비'],
  ['INSURANCE', '보험료'], ['TAX', '세금·4대보험'], ['LOAN_INTEREST', '대출이자'],
  ['MARKETING', '광고·마케팅'], ['PLATFORM_FEE', '수수료'], ['MISC_EXPENSE', '기타지출'],
];

// 카테고리 그룹별 색상 — 리포트 막대·라벨에 공통 사용.
const GROUP_META = {
  수입: { color: 'var(--green-soft)', bg: '#F2F7EC' },
  고정비: { color: 'var(--danger)', bg: '#FBEEEC' },
  변동비: { color: '#E0A93C', bg: '#FBF4E6' },
  금융: { color: '#7E8BC4', bg: '#EEF0F8' },
};
const GROUP_ORDER = ['수입', '고정비', '변동비', '금융'];

// KOSIS 소상공인실태조사 2023 음식점업 비용 비중(%) — 개선 제안의 비교 기준.
const KOSIS_BENCH = { labor: 18.4, rent: 9.3, purchase: 43.7 };

/**
 * 개선 제안의 "근거 보기" 단계 — 실제 분류 금액으로 계산/업종평균/차이/조언을 구성한다.
 * 백엔드 suggestion.value 는 전체 기간(모든 월) 합계 기준이라, 단계 계산도 같은 기준으로 맞춘다.
 */
function buildSuggestionSteps(sug, months) {
  const amountOf = (code) => {
    const total = months.reduce((s, mm) => s + (mm.categories.find((c) => c.code === code)?.amount ?? 0), 0);
    return total > 0 ? total : null;
  };
  const income = months.reduce((s, mm) => s + mm.income, 0);
  const period = `최근 ${months.length}개월 합계`;
  if (!income) return null;

  const make = (label, amount, benchPct, benchLabel, warnAdvice, okAdvice, judge) => {
    if (amount == null) return null;
    const myPct = (amount / income) * 100;
    const diff = myPct - benchPct;
    return [
      { k: '계산', v: `${label} ${fmtMan(amount)} ÷ 수입 ${fmtMan(income)} = ${myPct.toFixed(1)}% (${period})` },
      ...(judge ? [{ k: '판단 기준', v: judge }] : []),
      { k: '업종 평균', v: `음식점업 ${benchLabel} 비중 ${benchPct}% (KOSIS 소상공인실태조사 2023)` },
      { k: '차이', v: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%p · 월 ${fmtMan(Math.abs(income * diff / 100))} 수준` },
      { k: '그래서', v: sug.status === 'warn' ? warnAdvice : okAdvice },
    ];
  };

  if (sug.metric.includes('인건비')) {
    return make('인건비', amountOf('LABOR'), KOSIS_BENCH.labor, '인건비',
      '피크타임 위주로 근무 스케줄을 조정하거나 두루누리 사회보험료 지원(80%)을 신청해 보세요.',
      '현재 인력 구조는 유지해도 좋아요.');
  }
  if (sug.metric.includes('임대료')) {
    return make('임대료', amountOf('RENT'), KOSIS_BENCH.rent, '임차료',
      '매출 확대 없이는 고정비 압박이 커요. 착한임대인 세액공제 협의나 임대료 인하 요청, 배달·포장 매출 확대를 함께 검토해 보세요.',
      '임대료 부담은 안정권이에요.',
      '임차료율 10%가 소상공인 경영 안정 경계선 (진단 리포트 비용구조 축과 동일 기준)');
  }
  if (sug.metric.includes('원가') || sug.metric.includes('매입')) {
    return make('매입·원재료', amountOf('SUPPLIES'), KOSIS_BENCH.purchase, '재료비',
      '식자재 거래처를 2곳 이상 비교하거나 공동구매·식자재 카드 할인 활용으로 1~3%p 절감 여지가 있어요.',
      '원가는 안정적으로 관리되고 있어요.',
      '외식업 원가율 35% 초과 시 수익성 경고 구간');
  }
  return null;
}

/** 상단 요약 숫자 카드 */
function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ flex: 1, padding: '12px 10px', textAlign: 'center', gap: 4 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{label}</p>
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
      <span style={{ flex: 'none', width: 88, fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{cat.label}</span>
      <div style={{ flex: 1, height: 16, background: '#F5EFE2', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 6 }} />
      </div>
      <span style={{ flex: 'none', width: 76, textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: '#4A453E' }}>
        {fmtMan(cat.amount)}
      </span>
    </div>
  );
}

export default function CostReportScreen({ report }) {
  const [sel, setSel] = useState(null);
  const [openGroup, setOpenGroup] = useState('수입');  // 접이식 그룹 (기본: 수입 펼침)
  const [openTip, setOpenTip] = useState(null);        // 개선 제안 근거 펼침
  const [queue, setQueue] = useState([]);              // 확인필요 큐(교정하면 즉시 제거)
  const [savingId, setSavingId] = useState(null);
  const [resolved, setResolved] = useState(0);         // 이번 세션에 교정 완료한 건수

  // report 로드/변경 시 확인필요 큐 동기화.
  useEffect(() => {
    setQueue(report?.reviewQueue ?? []);
    setResolved(0);
  }, [report]);

  const saveCorrection = async (item, category) => {
    if (!category) return;
    setSavingId(item.txnId);
    try {
      await postTxnCorrection(item.merchant, category);
      // 교정은 상호 기준이라 같은 상호 거래가 함께 정리된다(백엔드와 동일 의미).
      const removed = queue.filter((x) => x.merchant === item.merchant).length;
      setQueue((q) => q.filter((x) => x.merchant !== item.merchant));
      setResolved((n) => n + removed);
    } catch { /* 실패 시 큐 유지 — 사용자가 재시도 */ } finally {
      setSavingId(null);
    }
  };

  if (!report) {
    return <div className="scr"><p style={{ color: 'var(--muted)', fontSize: 13 }}>비용 리포트를 불러오는 중이에요…</p></div>;
  }

  const months = report.months;
  const idx = sel == null ? months.length - 1 : Math.min(sel, months.length - 1);  // 기본: 최근 달
  const m = months[idx];
  const maxAmount = Math.max(...m.categories.map((c) => c.amount), 1);

  const groups = GROUP_ORDER
    .map((g) => ({ group: g, meta: GROUP_META[g], cats: m.categories.filter((c) => c.group === g) }))
    .filter((x) => x.cats.length > 0)
    .map((x) => ({
      ...x,
      subtotal: x.cats.reduce((s, c) => s + c.amount, 0),
      preview: x.cats.slice(0, 3).map((c) => c.label).join(' · ') + (x.cats.length > 3 ? ` 외 ${x.cats.length - 3}개` : ''),
    }));

  return (
    <div className="scr" style={{ gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.4, lineHeight: 1.4 }}>
          우리 가게 비용 리포트
        </h2>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
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
                background: active ? 'var(--gold)' : '#F5EFE2', color: active ? 'var(--ink)' : 'var(--muted-mid)',
              }}>
              {mm.month.slice(5)}월
            </button>
          );
        })}
      </div>

      {/* 손익 요약 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <StatCard label="수입" value={fmtMan(m.income)} color="var(--green-mid)" />
        <StatCard label="비용" value={fmtMan(m.expense)} color="var(--danger)" />
        <StatCard label="손익" value={fmtMan(m.profit)} color={m.profit >= 0 ? 'var(--green-mid)' : 'var(--danger)'} />
      </div>
      <p style={{ fontSize: 11.5, color: '#8A7A55', background: 'var(--warm)', borderRadius: 10, padding: '9px 12px', lineHeight: 1.5, fontWeight: 600 }}>
        💡 손익은 대출 원금상환을 뺀 실제 손익이에요. 통장 기준 순현금은 <b>{fmtMan(m.netCash)}</b>.
      </p>

      {/* 그룹별 분류 — 접이식 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((g) => {
          const open = openGroup === g.group;
          return (
            <div key={g.group} className="list-box">
              <button onClick={() => setOpenGroup(open ? null : g.group)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '15px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span className="tag" style={{ marginTop: 0, flex: 'none', color: g.meta.color, background: g.meta.bg, padding: '3px 9px' }}>{g.group}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#B0A697', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.preview}</span>
                <span style={{ flex: 'none', fontSize: 13.5, fontWeight: 900, color: g.meta.color }}>{fmtMan(g.subtotal)}</span>
                <span style={{ flex: 'none', fontSize: 12, color: 'var(--muted-faint)' }}>{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div className="pop" style={{ padding: '2px 16px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {g.cats.map((c) => <CategoryBar key={c.code} cat={c} max={maxAmount} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 개선 제안 — 펼치면 계산 근거 */}
      {report.suggestions?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)' }}>이렇게 개선해 보세요</p>
          {report.suggestions.map((s) => {
            const warn = s.status === 'warn';
            const steps = buildSuggestionSteps(s, months);
            const open = openTip === s.metric;
            return (
              <div key={s.metric} className="list-box" style={{ borderRadius: 20 }}>
                <button onClick={() => steps && setOpenTip(open ? null : s.metric)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'none', border: 'none', cursor: steps ? 'pointer' : 'default', textAlign: 'left' }}>
                  <span style={{ flex: 'none', fontSize: 16 }}>{warn ? '⚠️' : '✅'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>
                      {s.metric} <span style={{ color: warn ? 'var(--danger)' : 'var(--green-mid)' }}>{s.value}%</span>
                    </p>
                    <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{s.message}</p>
                  </div>
                  {steps && (
                    <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 800, color: 'var(--muted-faint)', whiteSpace: 'nowrap' }}>
                      {open ? '▲' : '근거 보기 ▼'}
                    </span>
                  )}
                </button>
                {open && steps && (
                  <div className="pop" style={{ padding: '2px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {steps.map((st) => (
                      <div key={st.k} style={{ display: 'flex', gap: 10, alignItems: 'baseline', borderTop: '1.5px solid #F6EFE2', paddingTop: 9 }}>
                        <span style={{ flex: 'none', width: 58, fontSize: 10.5, fontWeight: 800, color: 'var(--muted-mid)' }}>{st.k}</span>
                        <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55 }}>{st.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 확인 필요 거래 (레이어⑥ 교정) */}
      {(queue.length > 0 || resolved > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)' }}>
            확인이 필요한 거래 <span style={{ color: '#B08F3C' }}>{queue.length}건</span>
            {resolved > 0 && <span style={{ fontSize: 11.5, color: 'var(--green-mid)', marginLeft: 6 }}>· {resolved}건 정리됨</span>}
          </p>
          {queue.length > 0
            ? <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -4 }}>분류가 애매한 거래예요. 맞는 항목을 골라 바로잡아 주세요.</p>
            : <p style={{ fontSize: 12, color: 'var(--green-mid)', fontWeight: 700, marginTop: -4 }}>모두 확인했어요 🎉 다음부터 자동으로 분류돼요.</p>}
          {queue.map((r) => (
            <div key={r.txnId} className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '10px 13px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.merchant}</p>
                <p style={{ fontSize: 11, color: 'var(--muted-mid)', marginTop: 2 }}>{r.date} · {fmtMan(r.amount)}</p>
              </div>
              <select
                defaultValue=""
                disabled={savingId === r.txnId}
                onChange={(e) => saveCorrection(r, e.target.value)}
                style={{
                  flex: 'none', maxWidth: 130, padding: '7px 8px', borderRadius: 9,
                  border: '1.5px solid #EADFC8', background: 'var(--warm)', color: '#8A6E2E',
                  fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                }}>
                <option value="" disabled>{savingId === r.txnId ? '저장 중…' : `${r.guess} → 선택`}</option>
                {PICK.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
