import { useEffect, useMemo, useState } from 'react';
import Header from './shared/Header';
import { manToWon, wonToMan } from './shared/format';
import { getIndustries, getMeta, getIndustry, postRank } from './api/diagnosis';
import { postRecommend } from './api/recommend';
import { getTxnReport } from './api/txn';
import { postSimulation } from './api/simulation';
import InfoScreen from './features/diagnosis/InfoScreen';
import ReportScreen from './features/diagnosis/ReportScreen';
import CostReportScreen from './features/txn/CostReportScreen';
import RecommendScreen from './features/recommend/RecommendScreen';
import { recommendProducts } from './features/recommend/recommend';
import SimulatorScreen from './features/simulator/SimulatorScreen';
import PortfolioScreen from './features/simulator/PortfolioScreen';
import { buildSimRows, buildSimulationPayload } from './features/simulator/sim';

const TITLES = ['우리 가게 위치', '진단 리포트', '비용 리포트', '맞춤 상품 추천', '금융 시뮬레이터', '분석 포트폴리오'];
const CTAS = ['우리 가게 분석하기', '비용 리포트 보기', '맞춤 상품 추천 받기', '시뮬레이터에서 장착해보기', '포트폴리오 확인하기', '처음부터 다시 하기'];
// rentMan/laborMan/purchaseMan: 선택 입력 — 임대료가 있으면 비용구조 축이 추가된다 (백엔드 v2 보정)
// areaText/bizAge/salesChannel/cardCashRatio: 온보딩 표시·정밀도 보조값 (연동 시 자동 채움, 아직 postRank 미전달)
const DIAG_INIT = {
  industryCode: '', areaType: '', areaText: '', bizAge: '',
  salesMan: '', expenseMan: '',
  salesChannel: '', cardCashRatio: '',
  rentMan: '', laborMan: '', purchaseMan: '',
  currentCashMan: '', existingDebtMan: '', existingMonthlyPaymentMan: '',
  existingLoanRatePct: '', existingLoanRemainingMonths: '',
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
  const [reco, setReco] = useState(null);        // /api/recommend 결과 (AI 정책·KB상품 추천)
  const [txnReport, setTxnReport] = useState(null);  // /api/txn/report 결과 (마이데이터 비용 분류 리포트)
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  const [equipped, setEquipped] = useState([]);
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

  const products = useMemo(() => recommendProducts(rank), [rank]);
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
    && Number(diag.salesMan) > 0
    && diag.currentCashMan !== ''
    && Number(diag.currentCashMan) >= 0;

  const toggle = (id) => setEquipped((eq) =>
    eq.includes(id) ? eq.filter((x) => x !== id) : [...eq, id]);

  const analyze = async () => {
    setAnalyzeError('');
    setAnalyzing(true);
    try {
      // 선택 입력(임대료·인건비·재료비)이 하나라도 있으면 비용 세부를 전달 — rent 가 있으면 비용구조 축 활성화
      const hasCost = diag.rentMan || diag.laborMan || diag.purchaseMan;
      const costBreakdown = hasCost ? {
        rent: diag.rentMan ? manToWon(diag.rentMan) : null,
        laborCost: diag.laborMan ? manToWon(diag.laborMan) : null,
        purchaseCost: diag.purchaseMan ? manToWon(diag.purchaseMan) : null,
      } : null;
      const [r, d] = await Promise.all([
        postRank({
          industryCode: diag.industryCode,
          monthlySales: manToWon(diag.salesMan),
          monthlyExpense: manToWon(diag.expenseMan || 0),
          areaType: diag.areaType || null,
          costBreakdown,
          salesHistory: hometax?.salesHistory ?? null,   // 홈택스 연동 시 6개월 이력 → 안정성 축
        }),
        detail?.code === diag.industryCode ? Promise.resolve(detail) : getIndustry(diag.industryCode),
      ]);
      setRank(r);
      setDetail(d);
      setScreen(1);
      window.scrollTo(0, 0);
      // AI 추천은 화면 전환을 막지 않도록 비동기로 — 실패해도 진단 흐름은 유지
      setReco(null);
      postRecommend({
        topPercent: r.topPercent,
        rentBurden: r.costHealth?.rentBurden ?? null,
        trendPerMonth: r.stability?.trendPerMonth ?? null,
        region: '서울',
      }).then(setReco).catch(() => setReco(null));
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
    }));
  };

  // KB 계좌 마이데이터 연동 완료 → 계좌 흐름 기반 매출·지출·대출상환·카드현금 비율을 채운다
  const onKbLinked = (f) => {
    setDiag((d) => ({
      ...d,
      salesMan: String(wonToMan(f.monthlySalesAvg)),
      expenseMan: String(wonToMan(f.totalMonthlyExpense)),
      existingMonthlyPaymentMan: String(wonToMan(f.monthlyLoanPayment)),
      cardCashRatio: f.cardCashRatio,
    }));
  };

  const reset = () => {
    setScreen(0); setDiag(DIAG_INIT); setHometax(null); setDetail(null); setRank(null);
    setReco(null); setEquipped([]); setSimulation(null); setSimulationError(''); setAnalyzeError('');
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
        {screen === 3 && <RecommendScreen products={products} percentile={topPercent} reco={reco} />}
        {screen === 4 && <SimulatorScreen equipped={equipped} toggle={toggle} simRows={simRows}
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
