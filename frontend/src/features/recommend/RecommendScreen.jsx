import { useEffect, useRef, useState } from 'react';

// 상품 → 카테고리
// 예전에는 isFinance(=돈이 오가는 지원인지)만 보고 'loan'으로 몰아넣어서, 컨설팅·창업지원처럼
// 보증·교육이 섞인 비대출 지원사업이나 KB 적금·예금 상품까지 전부 "대출" 탭에 들어가는 문제가 있었다.
// 실제 추천 API 상품/정책은 subcategory(예: "일반·소상공인 대출", "사업자 적금·예비자금")가 내려오므로
// 이걸로 먼저 정확히 나누고, subcategory가 없는 예전 정적 카탈로그(products.js)만 tag 문구로 판단한다.
const CATS = [['all', '전체'], ['loan', '대출'], ['save', '적금'], ['ins', '보험'], ['gov', '정부 지원']];
const LOAN_HINTS = ['대출', '신용', '보증', '채무조정', '셀러 금융', '공급망 금융', '융자'];
const SAVE_HINTS = ['적금', '예금', '입출금', '유동성', '예비자금', '목돈'];
const INS_HINTS = ['보험'];
const hasHint = (text, hints) => hints.some((k) => text.includes(k));
const catOf = (p) => {
  if (p.subcategory) {
    if (hasHint(p.subcategory, SAVE_HINTS)) return 'save';
    if (hasHint(p.subcategory, INS_HINTS)) return 'ins';
    if (hasHint(p.subcategory, LOAN_HINTS)) return 'loan';
    return 'gov'; // 컨설팅·교육·창업지원 등 — isFinance가 true여도 대출이 아니라 정부 지원으로 분류
  }
  const tag = p.tag || '';
  if (tag.includes('대출')) return 'loan';
  if (tag.includes('적금')) return 'save';
  if (tag.includes('보험')) return 'ins';
  if (p.isFinance) return 'loan';
  return 'gov';
};

const PAGE_SIZE = 8; // 처음 노출 개수, 바닥 도달 시 같은 개수만큼 추가

// aiRanked: 추천 서비스(임베딩 모델)가 순위를 매긴 결과인지. 규칙기반 폴백이면 false.
// signals  : 규칙 엔진이 잡은 진단 신호. 조건에 하나도 안 걸리면 비어 있을 수 있다.
export default function RecommendScreen({ products, percentile, signals = [], aiRanked = false, onGoDiagnose }) {
  // 진단 전에는 이 목록이 개인화된 결과가 아니다(recommendProducts(null) = 정적 카탈로그).
  // 그래서 '맞춤 추천'이 아니라 '자주 찾는 상품' 안내로 성격을 바꾸고,
  // 계산되지 않은 적합도·개인화 사유는 감춘다. 진단 후 화면은 기존과 동일하다.
  const diagnosed = percentile != null;
  const [openId, setOpenId] = useState(null);
  const [cat, setCat] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);
  const filtered = products.filter((p) => cat === 'all' || catOf(p) === cat);
  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  useEffect(() => setLimit(PAGE_SIZE), [cat]); // 카테고리 바꾸면 처음부터

  // 바닥 문구가 화면 근처(120px)에 들어오면 다음 페이지 노출
  useEffect(() => {
    if (!hasMore) return;
    const check = () => {
      const el = sentinelRef.current;
      if (el && el.getBoundingClientRect().top < window.innerHeight + 120) {
        setLimit((l) => l + PAGE_SIZE);
      }
    };
    check(); // 첫 페이지가 화면을 다 못 채우는 경우 즉시 추가
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [hasMore, cat]);
  return (
    <div className="scr" style={{ gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.4, lineHeight: 1.4 }}>
          {diagnosed
            ? <>상위 {percentile}% 사장님께<br />딱 맞는 상품을 골랐어요</>
            : <>소상공인이<br />자주 찾는 상품이에요</>}
        </h2>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--muted)' }}>
          {diagnosed
            ? '진단 결과를 바탕으로 우선순위 순서예요.'
            : '진단하면 사장님 상황에 맞는 순서로 다시 골라드려요.'}
        </p>

        {/* 배지는 모델이 순위를 매겼는지에만 달려 있다. 그 아래 신호 문장은 규칙이 잡혔을 때만
            덧붙는다 — 상품별이 아니라 사장님 재무상황 설명이라 목록에 한 번만 노출한다. */}
        {diagnosed && aiRanked && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span style={{
              flex: 'none', fontSize: 10.5, fontWeight: 900, letterSpacing: -.2, padding: '3px 8px',
              borderRadius: 8, color: 'var(--green-deep)', background: 'var(--green-bg)',
              border: '1px solid var(--green-border)',
            }}>AI 추천 · 규칙 검증</span>
            {signals.length > 0 && (
              <p style={{ flex: '1 1 100%', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                {signals.join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>

      {diagnosed ? (
        <div style={{ background: '#FFF6DD', border: '1.5px solid #F3E4C0', borderRadius: 14, padding: '12px 15px' }}>
          <p style={{ fontSize: 12.5, color: '#8A7A55', lineHeight: 1.55, fontWeight: 600 }}>
            아래 상품을 탭하면 자세한 정보를 볼 수 있어요.
          </p>
        </div>
      ) : (
        /* 진단 전 — 지금 목록이 개인화된 게 아니라는 걸 밝히고 진단으로 유도한다 */
        /* 흰 카드 안내 + 노란 버튼 — 목록 카드와 같은 결로 두되 버튼만 색으로 띄운다 */
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, fontWeight: 600 }}>
            아직 진단 전이라 <b style={{ color: 'var(--ink)' }}>일반 안내</b>로 보여드리고 있어요.<br />
            진단하면 적합도와 추천 이유까지 알려드려요.
          </p>
          <button className="cta-card-btn" style={{ height: 48, marginTop: 0, fontSize: 15 }} onClick={onGoDiagnose}>
            진단하고 맞춤 추천 받기
          </button>
        </div>
      )}

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {CATS.map(([key, label]) => {
          const on = cat === key;
          const count = key === 'all' ? products.length : products.filter((p) => catOf(p) === key).length;
          return (
            <button key={key} onClick={() => setCat(key)} style={{
              flex: 'none', borderRadius: 11, padding: '8px 14px', fontSize: 12.5, fontWeight: 800,
              cursor: 'pointer', whiteSpace: 'nowrap',
              border: on ? '1.5px solid var(--green-deep)' : '1.5px solid var(--border)',
              background: on ? 'var(--green-deep)' : '#fff', color: on ? '#fff' : 'var(--muted)',
            }}>
              {label} <span style={{ fontWeight: 700, opacity: .65 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {visible.map((p) => {
        const open = openId === p.id;
        return (
          <div key={p.id} onClick={() => setOpenId(open ? null : p.id)} className="card" style={{
            border: open ? '1.5px solid var(--gold-deep)' : '1.5px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border .2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', letterSpacing: -.3 }}>{p.name}</p>
                <span className="tag" style={{ color: p.tagColor, background: p.tagBg }}>{p.tag}</span>
                {typeof p.daysLeft === 'number' && p.daysLeft >= 0 && (
                  <span className="tag" style={{
                    marginLeft: 6,
                    color: p.daysLeft <= 7 ? 'var(--danger)' : '#8A7A55',
                    background: p.daysLeft <= 7 ? 'var(--danger-bg)' : '#FFF6DD',
                  }}>{p.daysLeft === 0 ? '오늘 마감' : `D-${p.daysLeft}`}</span>
                )}
              </div>
              {/* 적합도는 진단 결과로 계산된 값이라 진단 전에는 감춘다(카탈로그 기본값이 노출되면 거짓 표기) */}
              {diagnosed && (
                <span style={{ flex: 'none', fontSize: 12, fontWeight: 800, color: 'var(--green-soft)' }}>적합 {p.fit}%</span>
              )}
            </div>
            {/* 규칙기반 폴백 상품에만 상품별 근거가 있다. 추천 서비스 상품은 헤더 signals 로 대체.
                진단 전에는 이 문장이 사장님 상황을 단정하는 것처럼 읽혀서 내보내지 않는다. */}
            {diagnosed && p.reason && <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{p.reason}</p>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="spec">{p.spec1}</span>
              <span className="spec">{p.spec2}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--muted-faint)' }}>{open ? '접기 ▲' : '자세히 ▼'}</span>
            </div>
            {open && (
              <div className="pop" style={{ background: 'var(--warm)', borderRadius: 14, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {/* 파인튜닝 KoBART 3줄 요약 — 형식 검증을 통과한 정책만 값이 온다 */}
                {p.summaryShort && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 9, borderBottom: '1px solid var(--border-strong)' }}>
                    {p.summaryShort.split('\n').filter(Boolean).map((line) => {
                      const [head, ...rest] = line.split(':');
                      return (
                        <div key={line} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                          <span style={{ flex: 'none', width: 64, fontWeight: 800, color: 'var(--green)' }}>{head}</span>
                          <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.55 }}>{rest.join(':').trim()}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* AI 3줄 요약(초록 라벨)이 있으면 같은 내용을 반복하는 회색 상세 목록은 보여주지 않는다.
                    summaryShort가 없는 상품(주로 규칙기반 폴백)에는 details가 유일한 정보라 그대로 둔다. */}
                {!p.summaryShort && p.details.map((d) => (
                  <div key={d.k} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ flex: 'none', width: 64, fontWeight: 800, color: 'var(--muted-mid)' }}>{d.k}</span>
                    <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.55 }}>{d.v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {hasMore && (
        <div ref={sentinelRef} style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted-faint)' }}>
          스크롤하면 더 볼 수 있어요 ({visible.length}/{filtered.length})
        </div>
      )}
    </div>
  );
}