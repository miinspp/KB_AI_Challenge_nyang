import { useState } from 'react';
import LinkCard from '../diagnosis/LinkCard';
import { HOMETAX_FINANCIALS, KB_LINK } from '../account/accountMock';

const manText = (v) => (v === '' || v == null ? null : `${Number(v).toLocaleString()}만원`);

/**
 * 탭5 내 정보 — 가게 상태 요약 · 연동 관리 · 출처.
 * 설정은 실제로 동작하는 것만 둔다(관심사는 진단 입력과 같은 값을 쓰고, 출처는 /api/meta).
 * 알림·약관처럼 아직 구현이 없는 항목은 넣지 않았다.
 */
export default function ProfileScreen({
  diag, rank, industries, needs, meta,
  kbLinked, onLinkKb, onUnlinkKb,
  hometaxLinked, onLinkHometax, onUnlinkHometax,
  onOpenNeeds, onReset,
}) {
  const [showSource, setShowSource] = useState(false);
  const selected = industries.find((i) => i.code === diag.industryCode);

  const storeRows = [
    { k: '업종', v: selected?.name },
    { k: '상권 유형', v: diag.areaType || '서울 전체' },
    { k: '월 평균 매출', v: manText(diag.salesMan) },
    { k: '월 평균 지출', v: manText(diag.expenseMan) },
    { k: '업력', v: diag.bizAgeYears !== '' ? `${diag.bizAgeYears}년` : null },
    { k: '진단 결과', v: rank ? `상위 ${rank.topPercent}%` : null, strong: !!rank },
  ];

  return (
    <div className="home" style={{ paddingTop: 6 }}>
      <div className="acct-bar" style={{ justifyContent: 'center', padding: '8px 0 4px' }}>
        <span className="hdr-title">사장님 프로필</span>
      </div>

      <div className="acct-card" style={{ gap: 14, padding: 18 }}>
        <span style={{
          flex: 'none', width: 56, height: 56, borderRadius: 20, background: '#FFC01E',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Jua', sans-serif", fontSize: 22, color: 'var(--ink)',
        }}>든</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.4 }}>김민서 사장님</p>
          <p style={{ marginTop: 4, fontSize: 12.5, color: 'var(--muted-mid)' }}>
            {selected ? `${selected.name} · 서울` : '업종 미설정 · 서울'}
          </p>
        </div>
      </div>

      <div>
        <p className="label-sm" style={{ marginBottom: 8 }}>우리 가게</p>
        <div className="list-box">
          {storeRows.map((r) => (
            <div key={r.k} className="list-row" style={{ cursor: 'default' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{r.k}</span>
              <span style={{
                flex: 'none', fontSize: 14, fontWeight: 800,
                color: r.v == null ? 'var(--muted-faint)' : r.strong ? 'var(--blue)' : 'var(--ink)',
              }}>{r.v ?? '미설정'}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="label-sm" style={{ marginBottom: 8 }}>연동 관리</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LinkCard
            iconLabel="홈택스" iconBg="var(--green)"
            title="국세청 홈택스 연동"
            desc="매출·지출·6개월 추이 한 번에"
            summary={`${HOMETAX_FINANCIALS.maskedBusinessNumber} · ${HOMETAX_FINANCIALS.basisPeriod} 불러옴`}
            linked={hometaxLinked}
            buildFinancials={() => HOMETAX_FINANCIALS}
            onLinked={onLinkHometax}
            onUnlink={onUnlinkHometax}
          />
          <LinkCard
            iconLabel="KB" iconBg="var(--green-bright)"
            title="KB 계좌 연동"
            desc="보유현금 · 기존 대출 · 가입 상품"
            summary="보유현금 · 기존 대출까지 불러옴"
            linked={kbLinked}
            buildFinancials={() => KB_LINK}
            onLinked={onLinkKb}
            onUnlink={onUnlinkKb}
          />
        </div>
      </div>

      <div>
        <p className="label-sm" style={{ marginBottom: 8 }}>설정</p>
        <div className="list-box">
          <button className="list-row" onClick={onOpenNeeds}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>관심사</span>
            <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: 'var(--muted-mid)' }}>
              {needs.length > 0 ? `${needs.length}개 선택` : '미설정'}
            </span>
            <span className="menu-chev">›</span>
          </button>
          <button className="list-row" onClick={() => setShowSource((v) => !v)}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>데이터 출처 · 방법론</span>
            <span style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: 'var(--muted-mid)' }}>{showSource ? '접기' : '보기'}</span>
            <span className="menu-chev">›</span>
          </button>
        </div>
        {showSource && meta?.meta && (
          <div className="evidence-box">
            <div className="evidence-row">
              <span className="evidence-k">매출 분포</span>
              <span className="evidence-v">{meta.meta.sourceDataset}</span>
            </div>
            {Array.isArray(meta.meta.quartersCovered) && (
              <div className="evidence-row">
                <span className="evidence-k">기준 분기</span>
                <span className="evidence-v">{meta.meta.quartersCovered.join(', ')}</span>
              </div>
            )}
            {meta.meta.methodology && (
              <div className="evidence-row">
                <span className="evidence-k">산출 방법</span>
                <span className="evidence-v">{meta.meta.methodology}</span>
              </div>
            )}
            {meta.meta.benchmarkSource && (
              <div className="evidence-row">
                <span className="evidence-k">벤치마크</span>
                <span className="evidence-v">{meta.meta.benchmarkSource.name} · {meta.meta.benchmarkSource.detail}</span>
              </div>
            )}
          </div>
        )}
        {showSource && !meta?.meta && (
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted-mid)' }}>출처 정보를 불러오지 못했어요.</p>
        )}
      </div>

      <button className="ghost-btn" onClick={onReset}>처음부터 다시 하기</button>
    </div>
  );
}
