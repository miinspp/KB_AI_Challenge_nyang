import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import LinkCard from './LinkCard';
import { topPercentOf } from './percentile';
import { manToWon, fmtMan } from '../../shared/format';

/*
 * 프로토타입 연동 결과(시뮬레이션). 실서비스에서는 본인인증 + 마이데이터/스크래핑 API로 교체된다.
 * 진단 v2 역할 분담: 홈택스 = 업종·매출·지출·지출세부·6개월 이력 / KB = 보유현금·기존 대출(accountMock.KB_LINK).
 */
const HOMETAX_FINANCIALS = {
  industryCode: 'CS100001',        // 한식음식점
  maskedBusinessNumber: '123-45-*****',
  basisPeriod: '최근 6개월',
  monthlySalesAvg: 25_000_000,
  totalMonthlyExpense: 19_000_000,
  rent: 2_500_000,
  laborCost: 4_000_000,
  purchaseCost: 9_000_000,
  otherExpense: 3_500_000,
  salesHistory: [23_800_000, 24_100_000, 25_600_000, 24_900_000, 26_200_000, 25_400_000],
};

// 관심사 칩 — api/recommend.js NEED_PHRASES 와 키를 맞춘다 (need_keywords 로 전달됨)
const NEEDS = [
  { key: 'funding', label: '자금·대출' },
  { key: 'cost', label: '비용 절감' },
  { key: 'growth', label: '매출 성장' },
  { key: 'digital', label: '디지털 전환' },
  { key: 'consulting', label: '컨설팅·교육' },
];

const AREA_OPTIONS = [
  { value: '', label: '서울 전체', desc: '서울 모든 상권과 비교' },
  { value: '골목상권', label: '골목상권', desc: '주택가 이면도로 상권' },
  { value: '발달상권', label: '발달상권', desc: '역세권·번화가 상권' },
  { value: '전통시장', label: '전통시장', desc: '시장 내 점포' },
];

const GROUP_TABS = [['CS1', '외식업'], ['CS2', '서비스업'], ['CS3', '소매업']];

// 연동 소스별로 자동 채워지는 필드 (배지 표시용)
const HOMETAX_FIELDS = ['industryCode', 'salesMan', 'expenseMan', 'rentMan', 'laborMan', 'purchaseMan', 'otherMan'];
const KB_FIELDS = ['currentCashMan', 'existingDebtMan', 'existingMonthlyPaymentMan', 'existingLoanRatePct', 'existingLoanRemainingMonths'];

const manText = (v) => (v === '' || v == null ? '' : `${Number(v).toLocaleString()}만원`);

/**
 * 화면 0 — 진단 입력 v2 (재현본 이식).
 * 필수 3항목(업종·월매출·월지출)만 채우면 바로 진단. 입력은 전부 바텀시트에서 받고,
 * 목록 화면은 "무엇이 채워졌고 무엇이 남았는지"만 보여준다.
 *   선택 입력: 상권 유형(지역 보정) · 지출 세부(비용구조 축) · 자금 상황(시뮬레이터) · 관심사·업력(추천 필터)
 */
export default function InfoScreen({
  industries, diag, setDiag, detail, needs, setNeeds,
  kbLinked, onKbLinked, onUnlinkKb,
  hometaxLinked, onHometaxLinked, onUnlinkHometax,
}) {
  const [sources, setSources] = useState({});   // { field: 'kb' | 'hometax' }
  const [sheet, setSheet] = useState(null);     // industry | area | sales | cost | finance | needs
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('CS1');

  const selected = useMemo(
    () => industries.find((i) => i.code === diag.industryCode),
    [industries, diag.industryCode],
  );

  // 연동 상태는 App 이 들고 있다(홈에서도 KB 연동 가능). 어디서 연동됐든 배지를 맞춘다.
  useEffect(() => {
    if (!kbLinked) return;
    setSources((s) => ({ ...s, ...Object.fromEntries(KB_FIELDS.map((k) => [k, 'kb'])) }));
  }, [kbLinked]);
  useEffect(() => {
    if (!hometaxLinked) return;
    setSources((s) => ({ ...s, ...Object.fromEntries(HOMETAX_FIELDS.map((k) => [k, 'hometax'])) }));
  }, [hometaxLinked]);

  // 직접 수정하면 해당 필드의 '불러옴' 배지는 사라진다
  const set = (patch) => {
    setSources((s) => {
      const n = { ...s };
      Object.keys(patch).forEach((k) => delete n[k]);
      return n;
    });
    setDiag((d) => ({ ...d, ...patch }));
  };
  const dropSources = (src) => setSources((s) => {
    const n = { ...s };
    Object.keys(n).forEach((k) => { if (n[k] === src) delete n[k]; });
    return n;
  });

  const unlinkKb = () => { onUnlinkKb && onUnlinkKb(); dropSources('kb'); };
  const unlinkHometax = () => { onUnlinkHometax && onUnlinkHometax(); dropSources('hometax'); };

  // ── 필수 진행 상황 ──
  const hasSales = Number(diag.salesMan) > 0;
  const hasExpense = diag.expenseMan !== '';
  const requiredDone = (selected ? 1 : 0) + (hasSales ? 1 : 0) + (hasExpense ? 1 : 0);

  // ── 실시간 미리보기 (실측 분포 격자 역보간 — percentile.js) ──
  const livePreview = useMemo(() => {
    const q = detail?.code === diag.industryCode ? detail?.quantiles : null;
    const salesWon = manToWon(diag.salesMan);
    if (!q || !(salesWon > 0)) return null;
    return topPercentOf(q, salesWon);
  }, [detail, diag.industryCode, diag.salesMan]);

  // ── 선택 행 요약문 ──
  const costFilled = diag.rentMan !== '' || diag.laborMan !== '' || diag.purchaseMan !== '';
  const financeFilled = diag.currentCashMan !== '' || diag.existingDebtMan !== '';
  const needLabels = needs.map((k) => NEEDS.find((n) => n.key === k)?.label).filter(Boolean).join(' · ');
  const optionalRows = [
    {
      mark: '상', badgeBg: 'var(--green-bright)', label: '상권 유형', sheet: 'area',
      filled: diag.areaType !== '',
      desc: diag.areaType === '' ? '같은 유형 상권끼리 비교하고 싶다면' : `${diag.areaType} 안에서도 순위를 알려드려요`,
    },
    {
      mark: '비', badgeBg: '#E0A93C', label: '지출 세부', sheet: 'cost',
      sourced: sources.rentMan === 'hometax', srcLabel: '홈택스', filled: costFilled,
      desc: costFilled
        ? `임대료 ${manText(diag.rentMan || 0)} · 인건비 ${manText(diag.laborMan || 0)} · 재료비 ${manText(diag.purchaseMan || 0)}`
        : '넣으면 비용구조 진단이 추가돼요',
    },
    {
      mark: '자', badgeBg: 'var(--blue)', label: '자금 상황', sheet: 'finance',
      sourced: sources.currentCashMan === 'kb', srcLabel: 'KB', filled: financeFilled,
      desc: financeFilled
        ? `보유현금 ${manText(diag.currentCashMan || 0)} · 대출 ${manText(diag.existingDebtMan || 0)}`
        : '시뮬레이터 계산에 쓰여요 · KB 연동 시 자동',
    },
    {
      mark: '관', badgeBg: '#C4884A', label: '관심사 · 업력', sheet: 'needs',
      filled: needs.length > 0 || diag.bizAgeYears !== '',
      desc: (needs.length > 0 || diag.bizAgeYears !== '')
        ? [needLabels, diag.bizAgeYears !== '' ? `업력 ${diag.bizAgeYears}년` : ''].filter(Boolean).join(' · ')
        : '고르면 딱 맞는 정책만 추려서 보여드려요',
    },
  ];

  // ── 바텀시트 필드 정의 ──
  const numField = (key, label, { unit = '만원', ph = '0', hint = '' } = {}) => {
    const src = sources[key];
    return { key, label, unit, ph, hint, src, srcLabel: src === 'kb' ? 'KB' : '홈택스' };
  };
  const SHEETS = {
    industry: { title: '어떤 업종인가요?', desc: '서울시 상권분석 데이터에 있는 업종끼리 비교해요.' },
    area: { title: '상권 유형', desc: '고르면 같은 유형 상권 안에서의 순위도 함께 알려드려요.' },
    sales: {
      title: '한 달 매출과 지출', desc: '대략적인 평균이면 충분해요. 홈택스를 연동하면 자동으로 채워져요.',
      fields: [
        numField('salesMan', '월 평균 매출', { ph: '예: 2,500' }),
        numField('expenseMan', '월 평균 지출', { ph: '예: 1,900', hint: '임대료·인건비·재료비를 모두 합친 금액이에요.' }),
      ],
    },
    cost: {
      title: '지출은 어디에 쓰나요?', desc: '임대료가 있으면 업종 평균과 비교한 비용구조 진단이 추가돼요.',
      fields: [
        numField('rentMan', '월 임대료', { ph: '예: 250' }),
        numField('laborMan', '월 인건비', { ph: '예: 400' }),
        numField('purchaseMan', '월 재료비(매입)', { ph: '예: 900' }),
        numField('otherMan', '그 밖의 지출', { ph: '예: 350' }),
      ],
    },
    finance: {
      title: '자금 상황', desc: '시뮬레이터가 현금흐름·상환부담을 계산할 때 쓰는 값이에요.',
      fields: [
        numField('currentCashMan', '현재 보유 현금', { ph: '예: 1,500' }),
        numField('existingDebtMan', '기존 대출 잔액', { ph: '없으면 0' }),
        numField('existingMonthlyPaymentMan', '월 대출 상환액', { ph: '없으면 0' }),
        numField('existingLoanRatePct', '기존 대출 금리', { unit: '%', ph: '예: 5.2' }),
        numField('existingLoanRemainingMonths', '남은 상환기간', { unit: '개월', ph: '예: 24' }),
      ],
    },
    needs: {
      title: '어떤 도움이 필요하세요?', desc: '고른 관심사에 맞는 정책·상품만 추려서 추천해요.',
      fields: [numField('bizAgeYears', '사업 운영 기간', { unit: '년', ph: '예: 2', hint: '업력 요건이 있는 정책을 걸러내는 데 써요.' })],
    },
  };
  const activeSheet = sheet ? SHEETS[sheet] : null;

  const qStr = query.trim();
  const industryOptions = industries.filter((i) => (qStr ? i.name.includes(qStr) : i.code.startsWith(tab)));

  return (
    <div className="scr" style={{ paddingBottom: 150 }}>
      <div>
        <h1 className="h1">3가지만 알려주시면<br />바로 진단해 드려요</h1>
        <p className="sub">홈택스를 연동하면 매출·지출·6개월 추이까지 한 번에 채워져요.</p>
      </div>

      {/* 필수 진행바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((requiredDone / 3) * 100)}%` }} /></div>
        <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 800, color: 'var(--muted)' }}>필수 {requiredDone}/3</span>
      </div>

      {/* 정보제공 동의 — 홈택스(매출·지출·이력) / KB(보유현금·기존대출) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <LinkCard
          iconLabel="홈택스" iconBg="var(--green)"
          title="국세청 홈택스 연동"
          desc="매출·지출·6개월 추이 한 번에"
          summary={`${HOMETAX_FINANCIALS.maskedBusinessNumber} · ${HOMETAX_FINANCIALS.basisPeriod} 불러옴`}
          linked={hometaxLinked}
          buildFinancials={() => HOMETAX_FINANCIALS}
          onLinked={onHometaxLinked}
          onUnlink={unlinkHometax}
        />
        <LinkCard
          iconLabel="KB" iconBg="var(--green-bright)"
          title="KB 계좌 연동"
          desc="보유현금 · 기존 대출 (홈택스엔 없어요)"
          summary="보유현금 · 기존 대출까지 불러옴"
          linked={kbLinked}
          buildFinancials={() => null /* 값은 App 의 KB_LINK 사용 */}
          onLinked={() => onKbLinked()}
          onUnlink={unlinkKb}
        />
      </div>

      {/* ── 필수 3항목 ── */}
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted-mid)', marginBottom: 8 }}>필수</p>
        <div className="list-box">
          {[
            {
              label: '업종', value: selected?.name, ph: '업종을 선택해 주세요',
              sourced: sources.industryCode === 'hometax',
              open: () => { setSheet('industry'); setQuery(''); setTab(selected ? selected.code.slice(0, 3) : 'CS1'); },
            },
            { label: '월 평균 매출', value: hasSales ? manText(diag.salesMan) : null, ph: '입력해 주세요', sourced: sources.salesMan === 'hometax', open: () => setSheet('sales') },
            { label: '월 평균 지출', value: hasExpense ? manText(diag.expenseMan) : null, ph: '입력해 주세요', sourced: sources.expenseMan === 'hometax', open: () => setSheet('sales') },
          ].map((r) => (
            <button key={r.label} className="list-row" style={{ padding: 16 }} onClick={r.open}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{r.label}</span>
                  {r.sourced && <span className="src-badge">홈택스</span>}
                </div>
                <p style={{ marginTop: 4, fontSize: 16, fontWeight: 800, letterSpacing: -.3, color: r.value ? 'var(--ink)' : 'var(--muted-faint)' }}>
                  {r.value || r.ph}
                </p>
              </div>
              <span className="menu-chev">›</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 선택 입력 ── */}
      <div>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted-mid)', marginBottom: 8 }}>
          더 정확하게 <span style={{ fontWeight: 500, color: 'var(--muted-faint)' }}>· 선택</span>
        </p>
        <div className="list-box">
          {optionalRows.map((r) => (
            <button key={r.label} className="list-row" onClick={() => setSheet(r.sheet)}>
              <span style={{
                flex: 'none', width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff', background: r.badgeBg,
              }}>{r.mark}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{r.label}</p>
                  {r.sourced && <span className="src-badge">{r.srcLabel} 자동</span>}
                </div>
                <p style={{
                  marginTop: 3, fontSize: 11.5, color: r.filled ? 'var(--green-text)' : 'var(--muted-mid)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.desc}</p>
              </div>
              <span className="menu-chev">›</span>
            </button>
          ))}
        </div>
        <p style={{ marginTop: 9, fontSize: 11, color: 'var(--muted-soft)', lineHeight: 1.6 }}>
          지출 세부를 넣으면 <b style={{ color: 'var(--muted)' }}>비용구조</b> 축이, 6개월 매출이 있으면 <b style={{ color: 'var(--muted)' }}>매출안정성</b> 축이 진단에 추가돼요.
        </p>
      </div>

      {/* 실시간 미리보기 */}
      {livePreview != null && (
        <div className="pop" style={{
          background: 'linear-gradient(165deg,var(--green-bg),var(--canvas))', border: '1.5px solid var(--green-border)',
          borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>✨</span>
          <div>
            <p style={{ fontSize: 12.5, color: '#5E6E4A', fontWeight: 600 }}>
              입력하신 매출이면 <b style={{ color: 'var(--ink)' }}>{selected?.name}</b> 매출 기준
            </p>
            <p style={{ fontSize: 17, fontWeight: 900, color: 'var(--ink)', marginTop: 2 }}>
              대략 상위 {livePreview}%
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted-mid)' }}> · 중위 {fmtMan(selected?.medianMonthlySales)}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── 바텀시트 — .scr 의 transform(scrIn)이 fixed 를 가두므로 portal 로 body에 렌더 ── */}
      {activeSheet && createPortal(
        <div className="sheet-dim" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip"><span /></div>
            <p style={{ fontSize: 19, fontWeight: 900, color: 'var(--ink)', letterSpacing: -.4 }}>{activeSheet.title}</p>
            <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{activeSheet.desc}</p>

            {sheet === 'industry' && (
              <>
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 14, padding: '12px 15px' }}>
                  <span style={{ fontSize: 14, color: 'var(--muted-faint)' }}>🔍</span>
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="업종 검색 (예: 한식, 커피)"
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 700, color: 'var(--ink)', minWidth: 0 }} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                  {GROUP_TABS.map(([prefix, label]) => (
                    <button key={prefix} className={`ind-tab${tab === prefix && !qStr ? ' on' : ''}`}
                      onClick={() => { setTab(prefix); setQuery(''); }}>{label}</button>
                  ))}
                </div>
                <div className="list-box" style={{ marginTop: 12 }}>
                  {industryOptions.map((i) => {
                    const on = diag.industryCode === i.code;
                    return (
                      <button key={i.code} className="list-row" style={{ padding: '14px 16px', background: on ? 'var(--green-bg-soft)' : '#fff' }}
                        onClick={() => set({ industryCode: i.code, areaType: '' })}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{i.name}</p>
                          <p style={{ marginTop: 3, fontSize: 11.5, color: 'var(--muted-mid)' }}>
                            {i.nStores != null ? `서울 ${i.nStores.toLocaleString()}곳 · ` : ''}중위 {fmtMan(i.medianMonthlySales)}
                          </p>
                        </div>
                        {on && <span style={{ flex: 'none', fontSize: 15, fontWeight: 900, color: 'var(--green-deep)' }}>✓</span>}
                      </button>
                    );
                  })}
                  {industryOptions.length === 0 && (
                    <p style={{ padding: 18, fontSize: 12.5, color: 'var(--muted-mid)', textAlign: 'center' }}>검색 결과가 없어요.</p>
                  )}
                </div>
              </>
            )}

            {sheet === 'area' && (
              <div className="list-box" style={{ marginTop: 16 }}>
                {AREA_OPTIONS
                  .filter((a) => a.value === '' || !selected?.areaTypes || selected.areaTypes.includes(a.value))
                  .map((a) => {
                    const on = diag.areaType === a.value;
                    return (
                      <button key={a.label} className="list-row" style={{ background: on ? 'var(--green-bg-soft)' : '#fff' }}
                        onClick={() => set({ areaType: a.value })}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{a.label}</p>
                          <p style={{ marginTop: 3, fontSize: 11.5, color: 'var(--muted-mid)' }}>{a.desc}</p>
                        </div>
                        {on && <span style={{ flex: 'none', fontSize: 15, fontWeight: 900, color: 'var(--green-deep)' }}>✓</span>}
                      </button>
                    );
                  })}
              </div>
            )}

            {sheet === 'needs' && (
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {NEEDS.map((n) => {
                  const on = needs.includes(n.key);
                  return (
                    <button key={n.key} className={`chip${on ? ' on' : ''}`} style={{ borderRadius: 13, padding: '11px 15px', fontSize: 13.5 }}
                      onClick={() => setNeeds((prev) => (prev.includes(n.key) ? prev.filter((x) => x !== n.key) : [...prev, n.key]))}>
                      {n.label}
                    </button>
                  );
                })}
              </div>
            )}

            {activeSheet.fields && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeSheet.fields.map((fd) => (
                  <div key={fd.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)' }}>{fd.label}</span>
                      {fd.src && <span className="src-badge">{fd.srcLabel}</span>}
                    </div>
                    <div className={`input-row${fd.src ? ' filled' : ''}`} style={{ padding: '13px 16px' }}>
                      <input
                        value={diag[fd.key] ?? ''}
                        onChange={(e) => set({ [fd.key]: e.target.value.replace(/[^\d.]/g, '') })}
                        placeholder={fd.ph} inputMode="decimal"
                        style={{ fontSize: 17, fontWeight: 800 }}
                      />
                      <span className="u" style={{ color: 'var(--muted-mid)', fontWeight: 700 }}>{fd.unit}</span>
                    </div>
                    {fd.hint && <p style={{ fontSize: 11, color: 'var(--muted-soft)', lineHeight: 1.5 }}>{fd.hint}</p>}
                  </div>
                ))}
              </div>
            )}

            <button className="sheet-confirm" onClick={() => setSheet(null)}>확인</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
