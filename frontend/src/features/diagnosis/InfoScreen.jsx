import { useEffect, useMemo, useState } from 'react';
import IndustryPicker from './IndustryPicker';
import LinkCard from './LinkCard';
import { topPercentOf } from './percentile';
import { manToWon, fmtMan } from '../../shared/format';

// 프로토타입 연동 결과(시뮬레이션). 실서비스에서는 본인인증 + 마이데이터/스크래핑 API로 교체된다.
const KB_FINANCIALS = {
  monthlySalesAvg: 24_800_000,
  totalMonthlyExpense: 18_500_000,
  monthlyLoanPayment: 1_800_000,
  cardCashRatio: '카드 72% · 현금 28%',
};
const HOMETAX_FINANCIALS = {
  industryName: '한식음식점',
  address: '강남구 역삼동',
  businessStart: '2021.03 (5년차)',
  monthlySalesAvg: 25_000_000,
  totalMonthlyExpense: 19_000_000,
  rent: 2_500_000,
  laborCost: 4_000_000,
  purchaseCost: 9_000_000,
  otherExpense: 3_500_000,
  maskedBusinessNumber: '123-45-6****',
  basisPeriod: '2025.07~2025.12',
  salesHistory: [23_800_000, 24_100_000, 25_600_000, 24_900_000, 26_200_000, 25_400_000],
};

/**
 * 화면 1 — 온보딩 입력.
 * 상단에 정보제공 동의(① KB 계좌 마이데이터 ② 국세청 홈택스)를 큰 카드 2개로 강조하고,
 * 연동하면 아래 항목이 자동으로 채워진다(불러옴 배지 + 직접 수정). 연동을 안 하면 직접 입력한다.
 *   [필수] 업종 · 사업장 지역 · 월 평균 매출 · 월 평균 지출
 *   [선택] 지출 세부(임대료·인건비·재료비) · 개업 시기 · 주 매출 채널 또는 카드·현금 비율 · 사업 자금·기존 대출
 */
export default function InfoScreen({ industries, diag, setDiag, detail, onHometaxLinked, onKbLinked }) {
  // 어떤 필드가 어떤 연동으로 채워졌는지: { [key]: 'kb' | 'hometax' }
  const [sources, setSources] = useState({});
  const [chMode, setChMode] = useState('channel'); // channel | ratio
  const [showDetail, setShowDetail] = useState(false); // 세부 정보 토글(접힘 기본)

  const clearSource = (key) => setSources((s) => {
    if (!s[key]) return s;
    const n = { ...s }; delete n[key]; return n;
  });
  // 직접 입력하면 해당 필드의 '불러옴' 표시는 사라진다
  const set = (patch) => {
    setSources((s) => {
      const n = { ...s }; Object.keys(patch).forEach((k) => delete n[k]); return n;
    });
    setDiag((d) => ({ ...d, ...patch }));
  };

  const selected = useMemo(
    () => industries.find((i) => i.code === diag.industryCode),
    [industries, diag.industryCode],
  );

  useEffect(() => { if (sources.cardCashRatio) setChMode('ratio'); }, [sources.cardCashRatio]);

  const livePreview = useMemo(() => {
    const q = detail?.code === diag.industryCode ? detail?.quantiles : null;
    const salesWon = manToWon(diag.salesMan);
    if (!q || !(salesWon > 0)) return null;
    return topPercentOf(q, salesWon);
  }, [detail, diag.industryCode, diag.salesMan]);

  // ── 연동 완료 핸들러: 상위(App)로 재무값 전달 + 로컬로 소스(배지) 표시 ──
  const handleKbLinked = (f) => {
    onKbLinked(f);
    setSources((s) => ({ ...s, salesMan: 'kb', expenseMan: 'kb', existingMonthlyPaymentMan: 'kb', cardCashRatio: 'kb' }));
    setShowDetail(true);  // 연동으로 세부 필드가 채워졌으니 펼쳐서 보여준다
  };
  const unlinkKb = () => setSources((s) => {
    const n = { ...s };
    ['salesMan', 'expenseMan', 'existingMonthlyPaymentMan', 'cardCashRatio'].forEach((k) => { if (n[k] === 'kb') delete n[k]; });
    return n;
  });

  const handleHometaxLinked = (f) => {
    onHometaxLinked(f);
    const ind = industries.find((i) => i.name === f.industryName);
    setDiag((d) => ({
      ...d,
      industryCode: ind ? ind.code : d.industryCode,
      areaText: f.address,
      bizAge: f.businessStart,
    }));
    setSources((s) => ({
      ...s,
      industryCode: 'hometax', areaText: 'hometax', bizAge: 'hometax',
      salesMan: 'hometax', expenseMan: 'hometax',
      rentMan: 'hometax', laborMan: 'hometax', purchaseMan: 'hometax',
    }));
    setShowDetail(true);  // 홈택스 연동 시 지출세부·개업시기가 채워지니 펼쳐서 보여준다
  };
  const unlinkHometax = () => setSources((s) => {
    const n = { ...s };
    Object.keys(n).forEach((k) => { if (n[k] === 'hometax') delete n[k]; });
    return n;
  });

  // 공용 입력 행 (불러옴 배지 + 직접 수정)
  const field = (key, { label, ph, unit = '만원', required = false, decimal = false, text = false } = {}) => {
    const src = sources[key];
    const rx = text ? null : decimal ? /[^\d.]/g : /[^\d]/g;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="label-sm">{label}{required && <span style={{ color: '#D0564C' }}> *</span>}</span>
          {src && <span className="filled-badge">{src === 'hometax' ? '홈택스' : 'KB'} 불러옴</span>}
          {src && <button className="edit-link" onClick={() => clearSource(key)}>직접 수정</button>}
        </div>
        <div className={`input-row${src ? ' filled' : ''}`}>
          <input
            value={diag[key] ?? ''}
            readOnly={!!src}
            onChange={(e) => set({ [key]: rx ? e.target.value.replace(rx, '') : e.target.value })}
            placeholder={ph}
            inputMode={text ? 'text' : decimal ? 'decimal' : 'numeric'}
          />
          {unit && <span className="u">{unit}</span>}
        </div>
      </div>
    );
  };

  const ratioSourced = sources.cardCashRatio === 'kb';

  return (
    <div className="scr">
      <div>
        <h1 className="h1">사장님, 반가워요!<br />우리 가게 운영, 저희가 도와드릴게요</h1>
        <p className="sub">
          사장님 정보를 바탕으로 우리 가게에 꼭 맞는 진단과 운영 관리를 도와드려요.<br />
          연동하거나 직접 입력해서 시작해 보세요.
        </p>
      </div>

      <LinkCard
        iconLabel="KB" iconBg="#6FA85A"
        title="KB 계좌 마이데이터 연동"
        desc="사장님 계좌 흐름을 바탕으로, 우리 가게에 더 정확하고 확실한 운영 도움을 드려요."
        summary="월매출 · 월지출 · 카드/현금 비율 · 대출상환액"
        buildFinancials={() => KB_FINANCIALS}
        onLinked={handleKbLinked}
        onUnlink={unlinkKb}
      />
      <LinkCard
        iconLabel="홈택스" iconBg="#4F7139"
        title="국세청 홈택스 연동"
        desc="사업자 등록·세금계산서 자료를 바탕으로, 우리 가게에 딱 맞는 진단과 운영 도움을 드려요."
        summary="업종 · 지역 · 매출 · 지출 · 지출세부 · 개업시기"
        buildFinancials={() => HOMETAX_FINANCIALS}
        onLinked={handleHometaxLinked}
        onUnlink={unlinkHometax}
      />

      {/* ── 필수 정보 ── */}
      <p className="label-sm" style={{ marginTop: 4 }}>필수 정보 <span style={{ color: '#D0564C' }}>*</span></p>

      <IndustryPicker
        industries={industries}
        value={diag.industryCode}
        selected={selected}
        sourced={sources.industryCode === 'hometax'}
        onChange={(code) => { clearSource('industryCode'); set({ industryCode: code, areaType: '' }); }}
      />

      {/* 상권 유형(선택) — 선택 시 같은 유형 안에서의 상위 %도 산출(백엔드 지역 보정) */}
      {selected?.areaTypes?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p className="label-sm">상권 유형 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· 선택</span></p>
            <p style={{ fontSize: 11.5, color: '#C4BAAD', marginTop: 3 }}>선택하면 같은 유형 상권 안에서의 순위도 함께 알려드려요</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={`ind-tab${diag.areaType === '' ? ' on' : ''}`} onClick={() => set({ areaType: '' })}>서울 전체</button>
            {['골목상권', '발달상권', '전통시장'].filter((t) => selected.areaTypes.includes(t)).map((t) => (
              <button key={t} className={`ind-tab${diag.areaType === t ? ' on' : ''}`} onClick={() => set({ areaType: t })}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {field('areaText', { label: '사업장 지역(자치구·동)', ph: '예: 강남구 역삼동', unit: '', text: true, required: true })}
      {field('salesMan', { label: '월 평균 매출', ph: '예: 2,500', required: true })}
      {field('expenseMan', { label: '월 평균 지출', ph: '예: 1,900', required: true })}
      {field('currentCashMan', { label: '현재 보유 현금', ph: '예: 1,500', required: true })}
      <p style={{ fontSize: 11.5, color: '#A79C8E', lineHeight: 1.55 }}>
        현재 보유 현금은 월 순이익과 다른 값이에요. 실제 통장·현금 잔액을 입력해야 현금 부족 위험이 정확해져요.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="label-sm">
          우리 가게 월 매출·지출 <span style={{ color: '#D0564C', fontWeight: 800 }}>*</span>
          <span style={{ fontWeight: 500, color: '#C4BAAD' }}> · 최근 월평균 기준</span>
        </p>
        <div className="input-row">
          <span className="k" style={{ width: 96 }}>월 평균 매출</span>
          <input value={diag.salesMan} onChange={(e) => set({ salesMan: e.target.value.replace(/[^\d]/g, '') })}
            placeholder="예: 2,500" inputMode="numeric" />
          <span className="u">만원</span>
        </div>
        <div className="input-row">
          <span className="k" style={{ width: 96 }}>월 평균 지출</span>
          <input value={diag.expenseMan} onChange={(e) => set({ expenseMan: e.target.value.replace(/[^\d]/g, '') })}
            placeholder="예: 1,900" inputMode="numeric" />
          <span className="u">만원</span>
        </div>
        <div className="input-row">
          <span className="k" style={{ width: 96 }}>사업 운영 기간</span>
          <input value={diag.bizAgeYears} onChange={(e) => set({ bizAgeYears: e.target.value.replace(/[^\d.]/g, '') })}
            placeholder="예: 2" inputMode="decimal" />
          <span className="u">년</span>
        </div>
        <p style={{ fontSize: 11.5, color: '#C4BAAD', lineHeight: 1.55 }}>
          지출(재료비·인건비·임대료 등)을 넣으면 순수익·비용효율까지 함께 진단해요.
          운영 기간은 창업 초기 전용 지원사업 매칭에 쓰여요.
        </p>
      </div>


      {showDetail && (
        <>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: '#A79C8E', margin: '2px 0 -4px' }}>지출 세부 (임대료 · 인건비 · 재료비)</p>
          {field('rentMan', { label: '월 임대료', ph: '예: 250' })}
          {field('laborMan', { label: '월 인건비', ph: '예: 400' })}
          {field('purchaseMan', { label: '월 재료비(매입)', ph: '예: 900' })}

          <p style={{ fontSize: 11.5, fontWeight: 800, color: '#A79C8E', margin: '2px 0 -4px' }}>개업 시기</p>
          {field('bizAge', { label: '개업 시기(업력)', ph: '예: 2021년 3월', unit: '', text: true })}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <p style={{ fontSize: 11.5, fontWeight: 800, color: '#A79C8E' }}>주 매출 채널 또는 카드·현금 비율</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`ind-tab${chMode === 'channel' ? ' on' : ''}`} onClick={() => setChMode('channel')}>홀·포장·배달 비중</button>
              <button className={`ind-tab${chMode === 'ratio' ? ' on' : ''}`} onClick={() => setChMode('ratio')}>카드·현금 비율</button>
            </div>
            {chMode === 'ratio' && ratioSourced && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="filled-badge">KB 불러옴</span>
                <button className="edit-link" onClick={() => clearSource('cardCashRatio')}>직접 수정</button>
              </div>
            )}
            {chMode === 'channel' ? (
              <div className="input-row">
                <input value={diag.salesChannel ?? ''} onChange={(e) => set({ salesChannel: e.target.value })}
                  placeholder="예: 홀 60 · 포장 30 · 배달 10" />
              </div>
            ) : (
              <div className={`input-row${ratioSourced ? ' filled' : ''}`}>
                <input value={diag.cardCashRatio ?? ''} readOnly={ratioSourced}
                  onChange={(e) => set({ cardCashRatio: e.target.value })}
                  placeholder="예: 카드 70 · 현금 30" />
              </div>
            )}
          </div>

          <p style={{ fontSize: 11.5, fontWeight: 800, color: '#A79C8E', margin: '2px 0 -4px' }}>
            기존 대출 <span style={{ fontWeight: 500, color: '#C4BAAD' }}>· 시뮬레이션 기준값</span>
          </p>
          {field('existingDebtMan', { label: '기존 대출 잔액', ph: '없으면 0' })}
          {field('existingMonthlyPaymentMan', { label: '월 대출 상환액', ph: '없으면 0' })}
          {field('existingLoanRatePct', { label: '기존 대출 금리', ph: '예: 5.2', unit: '%', decimal: true })}
          {field('existingLoanRemainingMonths', { label: '남은 상환기간', ph: '예: 24', unit: '개월', decimal: true })}
        </>
      )}

      {livePreview != null && (
        <div className="pop" style={{
          background: 'linear-gradient(165deg,#EDF5E1,#FFF9EF)', border: '1.5px solid #CFE3B8',
          borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>✨</span>
          <div>
            <p style={{ fontSize: 12.5, color: '#5E6E4A', fontWeight: 600 }}>
              입력하신 매출이면 <b style={{ color: '#2B2825' }}>{selected?.name}</b> 매출 기준
            </p>
            <p style={{ fontSize: 17, fontWeight: 900, color: '#2B2825', marginTop: 2 }}>
              대략 상위 {livePreview}%
              <span style={{ fontSize: 12, fontWeight: 700, color: '#A79C8E' }}>
                {' '}· 중위 {fmtMan(selected?.medianMonthlySales)}
              </span>
            </p>
            <p style={{ fontSize: 11, color: '#B9B0A4', marginTop: 3 }}>
              분석하기를 누르면 순수익·비용효율까지 합쳐 정밀 진단해요
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
