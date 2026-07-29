import { useEffect, useRef, useState } from 'react';
import { IconTip, IconArrowRight } from '../../shared/Icons';

// 상품 → 카테고리 (재현본 규칙 + 실제 추천 API 상품의 isFinance 반영)
const CATS = [['all', '전체'], ['loan', '대출'], ['save', '적금'], ['ins', '보험'], ['gov', '정부 지원']];
const catOf = (p) => {
  const tag = p.tag || '';
  if (tag.includes('대출') || p.isFinance) return 'loan';
  if (tag.includes('적금')) return 'save';
  if (tag.includes('보험')) return 'ins';
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
        <div style={{ background: '#FFF6DD', border: '1.5px solid #F3E4C0', borderRadius: 14, padding: '12px 15px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            flex: 'none', width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', background: 'var(--gold-link)',
          }}><IconTip size={15} /></span>
          <p style={{ fontSize: 12.5, color: '#8A7A55', lineHeight: 1.55, fontWeight: 600 }}>
            아래 체험 상품을 탭하면 간략한 정보를 볼 수 있어요.<br />다음 화면에서 직접 <b style={{ color: 'var(--ink)' }}>장착해 보며 체험</b>할 수 있어요!
          </p>
        </div>
      ) : (
        /* 진단 전 — 지금 목록이 개인화된 게 아니라는 걸 밝히고 진단으로 유도한다 */
        <div style={{ background: '#FFF6DD', border: '1.5px solid #F3E4C0', borderRadius: 14, padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{
              flex: 'none', width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', background: 'var(--gold-link)',
            }}><IconTip size={15} /></span>
            <p style={{ fontSize: 12.5, color: '#8A7A55', lineHeight: 1.55, fontWeight: 600 }}>
              아직 진단 전이라 <b style={{ color: 'var(--ink)' }}>일반 안내</b>로 보여드리고 있어요.<br />
              진단하면 적합도와 추천 이유까지 알려드려요.
            </p>
          </div>
          <button onClick={onGoDiagnose} style={{
            width: '100%', height: 46, border: 'none', borderRadius: 13, cursor: 'pointer',
            background: 'var(--gold)', color: 'var(--ink)', fontSize: 14, fontWeight: 900, letterSpacing: -.3,
          }}>
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
              <span className="icon-badge" style={{ width: 40, height: 40, background: p.iconBg, color: p.iconColor, fontSize: 18 }}>{p.icon}</span>
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
                {p.details.map((d) => (
                  <div key={d.k} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                    <span style={{ flex: 'none', width: 64, fontWeight: 800, color: 'var(--muted-mid)' }}>{d.k}</span>
                    <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.55 }}>{d.v}</span>
                  </div>
                ))}
                <p style={{ fontSize: 11.5, color: '#8A7A55', background: '#FFF6DD', borderRadius: 10, padding: '9px 11px', lineHeight: 1.55, fontWeight: 600, display: 'flex', gap: 7 }}>
                  <IconArrowRight size={14} style={{ flex: 'none', marginTop: 2 }} />
                  <span>
                    {diagnosed
                      ? '다음 화면의 시뮬레이터에서 이 상품을 장착하면, 우리 가게 현금흐름이 어떻게 바뀌는지 미리 체험할 수 있어요.'
                      : '진단을 마치면 이 상품이 우리 가게 현금흐름을 어떻게 바꾸는지 시뮬레이터에서 체험할 수 있어요.'}
                  </span>
                </p>
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