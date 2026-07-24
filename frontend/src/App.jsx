import { useEffect, useMemo, useState } from 'react';
import Header from './shared/Header';
import { manToWon, wonToMan } from './shared/format';
import { getIndustries, getMeta, getIndustry, postRank } from './api/diagnosis';
import { getTxnReport } from './api/txn';
import { postSimulation } from './api/simulation';
import InfoScreen from './features/diagnosis/InfoScreen';
import ReportScreen from './features/diagnosis/ReportScreen';
import CostReportScreen from './features/txn/CostReportScreen';
import RecommendScreen from './features/recommend/RecommendScreen';
import { fetchRecommendations, rankToProfile } from './api/recommend';
import SimulatorScreen from './features/simulator/SimulatorScreen';
import PortfolioScreen from './features/simulator/PortfolioScreen';
import { buildSimRows, buildSimulationOptions, buildSimulationPayload } from './features/simulator/sim';

const TITLES = ['우리 가게 위치', '진단 리포트', '비용 리포트', '맞춤 상품 추천', '금융 시뮬레이터', '분석 포트폴리오'];
const CTAS = ['우리 가게 분석하기', '비용 리포트 보기', '맞춤 상품 추천 받기', '시뮬레이터에서 장착해보기', '포트폴리오 확인하기', '처음부터 다시 하기'];
// rentMan/laborMan/purchaseMan: 선택 입력 — 임대료가 있으면 비용구조 축이 추가된다 (백엔드 v2 보정)
// areaText/bizAgeYears는 추천·시뮬레이션까지 동일한 계약으로 전달한다.
const DIAG_INIT = {
  industryCode: '', areaType: '', salesMan: '', expenseMan: '', bizAgeYears: '',

  rentMan: '', laborMan: '', purchaseMan: '',
  hasExistingDebt: '',
  currentCashMan: '', existingDebtMan: '', existingMonthlyPaymentMan: '',
  existingLoanRatePct: '', existingLoanRemainingMonths: '',
  annualTaxPaidMan: '', desiredFundingMan: '1000', desiredGrantUseMan: '500', desiredSavingsMan: '30',
  fundingPurpose: 'OPERATING',
};

export default function App() {
  const [screen, setScreen] = useState(0);
  const [industries, setIndustries] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [diag, setDiag] = useState(DIAG_INIT);
  const [hometax, setHometax] = useState(null);  // 홈택스 연동 결과 financials (salesHistory → 안정성 축)
  const [detail, setDetail] = useState(null);   // 선택 업종 상세(분포 격자)
  const [rank, setRank] = useState(null);        // /api/rank 결과
  const [txnReport, setTxnReport] = useState(null);  // /api/txn/report 결과 (마이데이터 비용 분류 리포트)
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  const [equipped, setEquipped] = useState([]);
  const [apiProducts, setApiProducts] = useState([]);
  const [recommendationError, setRecommendationError] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState('');

  // 업종 목록·메타 최초 로드
  useEffect(() => {
    getIndustries().then(setIndustries).catch((e) => setLoadError('업종 목록을 불러오지 못했어요: ' + e.message));
    getMeta().then(setMeta).catch(() => {});
    getTxnReport().then(setTxnReport).catch(() => {});  // 마이데이터 비용 리포트(현재 mock)
  }, []);

  // 업종 선택 시 상세(분포 격자) 로드 — 입력 화면 실시간 미리보기 + 리포트 차트에 사용
  useEffect(() => {
    if (!diag.industryCode) { setDetail(null); return; }
    let alive = true;
    getIndustry(diag.industryCode).then((d) => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [diag.industryCode]);

  const products = apiProducts;
  const simulationOptions = useMemo(() => buildSimulationOptions(apiProducts), [apiProducts]);
  const topPercent = rank ? rank.topPercent : null;
  const simulationPayload = useMemo(
    () => rank ? buildSimulationPayload({ rank, diag, hometax, equipped }) : null,
    [rank, diag, hometax, equipped],
  );
  const simRows = useMemo(() => buildSimRows(simulation), [simulation]);

  useEffect(() => {
    if (!simulationPayload || screen < 4) return undefined;  // 시뮬레이터 화면(비용 리포트 삽입으로 3→4)
    let alive = true;
    setSimulationLoading(true);
    setSimulationError('');
    postSimulation(simulationPayload)
      .then((result) => { if (alive) setSimulation(result); })
      .catch((error) => { if (alive) setSimulationError(error.message); })
      .finally(() => { if (alive) setSimulationLoading(false); });
    return () => { alive = false; };
  }, [simulationPayload, screen]);

  const canAnalyze = diag.industryCode
    && String(diag.areaText || '').trim()
    && Number(diag.salesMan) > 0
    && diag.expenseMan !== ''
    && Number(diag.expenseMan) >= 0
    && diag.bizAgeYears !== ''
    && Number(diag.bizAgeYears) >= 0
    && diag.currentCashMan !== ''
    && Number(diag.currentCashMan) >= 0
    && (diag.hasExistingDebt === 'NONE'
      || (diag.hasExistingDebt === 'YES'
        && Number(diag.existingDebtMan) > 0
        && Number(diag.existingMonthlyPaymentMan) > 0
        && Number(diag.existingLoanRatePct) > 0
        && Number(diag.existingLoanRemainingMonths) > 0));

  const toggle = (optionOrId) => {
    const option = typeof optionOrId === 'string'
      ? simulationOptions.find((item) => item.id === optionOrId)
      : optionOrId;
    if (!option) return;
    if (option.requiresExistingDebt && Number(diag.existingDebtMan || 0) <= 0) {
      setSimulationError('대환 상품은 기존 대출잔액을 입력한 경우에만 시뮬레이션할 수 있어요.');
      return;
    }
    const conflict = equipped.find((item) =>
      item.key !== option.key
      && item.duplicateGroup
      && item.duplicateGroup === option.duplicateGroup);
    if (conflict && !equipped.some((item) => item.key === option.key)) {
      setSimulationError(`${option.short}과(와) ${conflict.short}은(는) 중복 가입할 수 없어요.`);
      return;
    }
    setSimulationError('');
    setEquipped((eq) => eq.some((item) => item.key === option.key)
      ? eq.filter((item) => item.key !== option.key)
      : [...eq, option]);
  };

  const analyze = async () => {
    setAnalyzeError('');
    setRecommendationError('');
    setApiProducts([]);
    setEquipped([]);
    setAnalyzing(true);
    try {
      // 선택 입력(임대료·인건비·재료비)이 하나라도 있으면 비용 세부를 전달 — rent 가 있으면 비용구조 축 활성화
      const hasCost = diag.rentMan || diag.laborMan || diag.purchaseMan;
      const costBreakdown = hasCost ? {
        rent: diag.rentMan ? manToWon(diag.rentMan) : null,
        laborCost: diag.laborMan ? manToWon(diag.laborMan) : null,
        purchaseCost: diag.purchaseMan ? manToWon(diag.purchaseMan) : null,
      } : null;
      // 매출이력 형식 정규화: 백엔드는 [{month:"YYYY-MM", amount}] 를 기대.
      // 홈택스 연동 mock 이 숫자 배열([23800000,...])을 줄 수 있어 {month,amount} 로 변환한다(과거→최근).
      const rawHistory = hometax?.salesHistory;
      const salesHistory = Array.isArray(rawHistory) && rawHistory.length
        ? rawHistory.map((v, i, arr) => {
            if (v && typeof v === 'object') return v;   // 이미 {month, amount}
            const dt = new Date();
            dt.setMonth(dt.getMonth() - (arr.length - 1 - i));
            const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            return { month, amount: Number(v) };
          })
        : null;
      const [r, d] = await Promise.all([
        postRank({
          industryCode: diag.industryCode,
          monthlySales: manToWon(diag.salesMan),
          monthlyExpense: manToWon(diag.expenseMan || 0),
          areaType: diag.areaType || null,
          costBreakdown,
          salesHistory,
        }),
        detail?.code === diag.industryCode ? Promise.resolve(detail) : getIndustry(diag.industryCode),
      ]);
      setRank(r);
      setDetail(d);
      setScreen(1);
      window.scrollTo(0, 0);

      // 진단 결과 → 맞춤 추천(비동기). 서비스 미가동/실패 시 조용히 규칙기반 폴백 유지.
      const industryName = industries.find((it) => it.code === diag.industryCode)?.name || '';
      // 실입력값으로 프로필 보정: 업력 + 실부채비율(부채잔액/연매출). 비어 있으면 rankToProfile이 근사로 폴백.
      const salesMonthly = Number(diag.salesMan) || 0;
      const debtRatio = salesMonthly > 0 && diag.hasExistingDebt
        ? Number(diag.existingDebtMan || 0) / (salesMonthly * 12)
        : null;
      const bizAgeYears = diag.bizAgeYears ? Number(diag.bizAgeYears) : null;
      const profile = rankToProfile(r, {
        region: diag.areaText || '서울', industry: industryName, bizAgeYears, debtRatio,
      });
      setRecommendationError('');
      fetchRecommendations(profile)
        .then(setApiProducts)
        .catch((err) => {
          console.warn('추천 서비스 요청 실패:', err.message);
          setApiProducts([]);
          setRecommendationError(err.message);
        });

    } catch (e) {
      setAnalyzeError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // 홈택스 연동 완료 → 매출·지출·비용 세부를 입력값으로 채우고 월별 이력을 보관
  const onHometaxLinked = (f) => {
    setHometax(f);
    setDiag((d) => ({
      ...d,
      salesMan: String(wonToMan(f.monthlySalesAvg)),
      expenseMan: String(wonToMan(f.totalMonthlyExpense)),
      rentMan: String(wonToMan(f.rent)),
      laborMan: String(wonToMan(f.laborCost)),
      purchaseMan: String(wonToMan(f.purchaseCost)),
      bizAgeYears: f.bizAgeYears == null ? d.bizAgeYears : String(f.bizAgeYears),
      annualTaxPaidMan: f.annualTaxPaid == null ? d.annualTaxPaidMan : String(wonToMan(f.annualTaxPaid)),
    }));
  };

  // KB 계좌 마이데이터 연동 완료 → 계좌 흐름 기반 매출·지출·대출상환·카드현금 비율을 채운다
  const onKbLinked = (f) => {
    setDiag((d) => ({
      ...d,
      salesMan: String(wonToMan(f.monthlySalesAvg)),
      expenseMan: String(wonToMan(f.totalMonthlyExpense)),
      hasExistingDebt: f.existingDebtBalance > 0 ? 'YES' : 'NONE',
      existingDebtMan: String(wonToMan(f.existingDebtBalance || 0)),
      existingMonthlyPaymentMan: String(wonToMan(f.monthlyLoanPayment)),
      existingLoanRatePct: f.existingLoanRatePct == null ? d.existingLoanRatePct : String(f.existingLoanRatePct),
      existingLoanRemainingMonths: f.existingLoanRemainingMonths == null
        ? d.existingLoanRemainingMonths : String(f.existingLoanRemainingMonths),
      cardCashRatio: f.cardCashRatio,
    }));
  };

  const reset = () => {
    setScreen(0); setDiag(DIAG_INIT); setHometax(null); setDetail(null); setRank(null);
    setEquipped([]); setAnalyzeError(''); setApiProducts([]); setRecommendationError('');
    setSimulation(null); setSimulationError('');

  };

  const next = () => {
    if (screen === 0) return analyze();
    if (screen === 5) return reset();
    setScreen((s) => s + 1);
    window.scrollTo(0, 0);
  };

  const ctaDisabled = screen === 0 && (!canAnalyze || analyzing);
  const ctaLabel = screen === 0 && analyzing ? '분석 중…' : CTAS[screen];
  const ctaGreen = screen === 0 && !ctaDisabled;  // 온보딩 CTA는 초록 포인트

  return (
    <div className="app">
      <Header title={TITLES[screen]} screen={screen} onBack={() => setScreen((s) => Math.max(0, s - 1))} />
      <div className="app-body">
        {screen === 0 && (
          <InfoScreen industries={industries} diag={diag} setDiag={setDiag} detail={detail}
            onHometaxLinked={onHometaxLinked} onKbLinked={onKbLinked} />
        )}
        {screen === 1 && <ReportScreen rank={rank} detail={detail} meta={meta} salesHistory={hometax?.salesHistory} />}
        {screen === 2 && <CostReportScreen report={txnReport} />}
        {screen === 3 && <RecommendScreen products={products} percentile={topPercent} error={recommendationError} />}
        {screen === 4 && <SimulatorScreen equipped={equipped} toggle={toggle} simRows={simRows}
          options={simulationOptions}
          simulation={simulation} loading={simulationLoading} error={simulationError} />}
        {screen === 5 && <PortfolioScreen equipped={equipped} simRows={simRows} percentile={topPercent}
          simulation={simulation} />}
      </div>

      <div className="cta-wrap">
        {screen === 0 && (loadError || analyzeError) && (
          <p style={{ fontSize: 12.5, color: '#D0564C', fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
            {loadError || analyzeError}
          </p>
        )}
        <button className="cta" onClick={next} disabled={ctaDisabled}
          style={ctaDisabled
            ? { background: '#EFE6D4', color: '#C4BAAD', boxShadow: 'none', cursor: 'default' }
            : ctaGreen
              ? { background: '#3F6B2E', color: '#fff', boxShadow: '0 8px 20px -8px rgba(63,107,46,.45)' }
              : undefined}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
