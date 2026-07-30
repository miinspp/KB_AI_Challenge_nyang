import { useCallback, useEffect, useMemo, useState } from 'react';
import TabBar from './shared/TabBar';
import StepTabs from './shared/StepTabs';
import { manToWon, wonToMan } from './shared/format';
import { getIndustries, getMeta, getIndustry, postRank } from './api/diagnosis';
import { getTxnReport } from './api/txn';
import { postSimulation } from './api/simulation';
import SplashScreen from './features/splash/SplashScreen';
import HomeScreen from './features/home/HomeScreen';
import AccountScreen from './features/account/AccountScreen';
import HometaxScreen from './features/account/HometaxScreen';
import { KB_LINK, HOMETAX_FINANCIALS } from './features/account/accountMock';
import InfoScreen from './features/diagnosis/InfoScreen';
import DiagnosingScreen from './features/diagnosis/DiagnosingScreen';
import ReportScreen from './features/diagnosis/ReportScreen';
import CostReportScreen from './features/txn/CostReportScreen';
import RecommendScreen from './features/recommend/RecommendScreen';
import RiskProfileScreen from './features/risk/RiskProfileScreen';
import ProfileScreen from './features/profile/ProfileScreen';
import { recommendProducts } from './features/recommend/recommend';
import { fetchRecommendations, rankToProfile } from './api/recommend';
import SimulatorScreen from './features/simulator/SimulatorScreen';
import PortfolioScreen from './features/simulator/PortfolioScreen';
import ScenarioLabScreen from './features/simulator/ScenarioLabScreen';
import {
  buildSimRows, buildSimulationOptions, buildSimulationPayload,
  pickOptionsForProfile, generateCandidateCombos, buildCandidatePayloads, summarizeSimulationForAdvisor,
} from './features/simulator/sim';
import { requestPortfolioAdvice } from './api/portfolio';

// 진단 로딩 화면 최소 노출 시간 — DiagnosingScreen 의 4단계(620ms×4)가 다 체크될 만큼
const DIAGNOSING_MIN_MS = 2600;

// 진단 입력 v2 — 필수는 업종·매출·지출 3개, 나머지는 정확도를 높이는 선택 입력.
//   rentMan/laborMan/purchaseMan(+otherMan): 지출 세부 — 임대료가 있으면 비용구조 축 추가 (백엔드 보정)
//   currentCash~RemainingMonths: 자금 상황 — 시뮬레이터 계산용, KB 연동 시 자동 채움
//   bizAgeYears: 추천 업력 필터용
const DIAG_INIT = {
  industryCode: '', areaType: '', salesMan: '', expenseMan: '', bizAgeYears: '',
  rentMan: '', laborMan: '', purchaseMan: '', otherMan: '',
  hasExistingDebt: '',
  currentCashMan: '', existingDebtMan: '', existingMonthlyPaymentMan: '',
  existingLoanRatePct: '', existingLoanRemainingMonths: '',
  annualTaxPaidMan: '', desiredFundingMan: '1000', desiredGrantUseMan: '500', desiredSavingsMan: '30',
};

export default function App() {
  const [started, setStarted] = useState(false);  // 표지 화면 통과 여부

  // ── 내비게이션 ──
  // tab 1 홈 · 2 우리 가게 진단 · 3 맞춤 추천 · 4 시뮬레이터 · 5 내 정보
  // 진단·시뮬 탭은 탭 안에서 단계를 오간다. overlay 는 탭 위에 덮이는 상세 화면.
  const [tab, setTab] = useState(1);
  const [diagSub, setDiagSub] = useState('input');   // input | report | cost
  const [recSub, setRecSub] = useState('list');      // list | risk (추천 목록 → 성향분석 → 시뮬레이터)
  const [riskProfile, setRiskProfile] = useState(null);  // 성향분석 결과 — 시뮬레이터/에이전트 입력값으로 전달
  const [simSub, setSimSub] = useState('sim');       // sim | portfolio
  const [overlay, setOverlay] = useState(null);      // null | 'account' | 'hometax' | 'scenario'
  const [requestSheet, setRequestSheet] = useState(null);  // 내 정보 → 진단 입력 시트 열기

  const [industries, setIndustries] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [diag, setDiag] = useState(DIAG_INIT);
  const [needs, setNeeds] = useState([]);        // 관심사 칩 (추천 need_keywords 로 전달)
  const [kbLinked, setKbLinked] = useState(false);
  const [hometax, setHometax] = useState(null);  // 홈택스 연동 결과 financials (salesHistory → 안정성 축)
  const [detail, setDetail] = useState(null);    // 선택 업종 상세(분포 격자)
  const [rank, setRank] = useState(null);        // /api/rank 결과
  const [txnReport, setTxnReport] = useState(null);  // /api/txn/report 결과 (마이데이터 비용 분류 리포트)
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  const [equipped, setEquipped] = useState([]);
  const [apiProducts, setApiProducts] = useState(null);  // /api/recommend 결과 (실패 시 null → 규칙기반 폴백)
  const [recoSignals, setRecoSignals] = useState([]);    // 추천 목록 헤더용 진단 신호 문장
  const [simulation, setSimulation] = useState(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState('');

  // 조합 분석 AI — 성향분석 결과로 조합 후보를 계산하고(코드+Java), Top3 선정·설명만 Sonnet에 맡긴다.
  const [topCombos, setTopCombos] = useState([]);            // [{comboId, rank, headline, reason, caution, items}]
  const [comboSimulations, setComboSimulations] = useState({}); // comboId → /api/simulation 결과 (실제 엔진)
  const [comboAnalysisLoading, setComboAnalysisLoading] = useState(false);
  const [comboAnalysisError, setComboAnalysisError] = useState('');
  const [comboAnalysisDone, setComboAnalysisDone] = useState(false);

  // 업종 목록·메타 최초 로드
  const loadIndustries = useCallback(() => {
    setLoadError('');
    getIndustries().then(setIndustries).catch((e) => setLoadError('업종 목록을 불러오지 못했어요: ' + e.message));
  }, []);
  useEffect(() => {
    loadIndustries();
    getMeta().then(setMeta).catch(() => {});
    getTxnReport().then(setTxnReport).catch(() => {});  // 마이데이터 비용 리포트(현재 mock)
  }, [loadIndustries]);

  // 업종 선택 시 상세(분포 격자) 로드 — 입력 화면 실시간 미리보기에 사용
  useEffect(() => {
    if (!diag.industryCode) { setDetail(null); return; }
    let alive = true;
    getIndustry(diag.industryCode).then((d) => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [diag.industryCode]);

  // 추천 서비스(/api/recommend) 결과를 우선 사용, 없으면 기존 규칙기반으로 폴백
  const products = useMemo(() => apiProducts ?? recommendProducts(rank), [apiProducts, rank]);
  const simulationOptions = useMemo(() => buildSimulationOptions(products), [products]);
  const topPercent = rank ? rank.topPercent : null;
  // 시뮬레이션은 보유현금·기존대출 입력이 갖춰져야 의미가 있다(자금 상황 시트)
  const simulationReady = diag.currentCashMan !== ''
    && Number(diag.currentCashMan) >= 0
    && (
      diag.hasExistingDebt === 'NONE'
      || (
        diag.hasExistingDebt === 'YES'
        && Number(diag.existingDebtMan) > 0
        && Number(diag.existingMonthlyPaymentMan) > 0
        && Number(diag.existingLoanRatePct) > 0
        && Number(diag.existingLoanRemainingMonths) > 0
      )
    );
  const simulationPayload = useMemo(
    () => (rank && simulationReady ? buildSimulationPayload({
      rank, diag, hometax, kb: kbLinked ? KB_LINK : null, equipped,
    }) : null),
    [rank, diag, hometax, kbLinked, equipped, simulationReady],
  );
  const simRows = useMemo(() => buildSimRows(simulation), [simulation]);
  // 조합 후보용 공통 재료 — buildSimulationPayload(base, equipped=조합)로 후보마다 재사용한다.
  const simulationBase = useMemo(() => ({ rank, diag, hometax, kb: kbLinked ? KB_LINK : null }),
    [rank, diag, hometax, kbLinked]);
  const equippedComboId = useMemo(() => equipped.map((item) => item.key).sort().join('+'), [equipped]);

  // 시뮬레이터 탭에 들어왔을 때만 계산 요청
  useEffect(() => {
    if (!simulationPayload || tab !== 4) return undefined;
    let alive = true;
    setSimulationLoading(true);
    setSimulationError('');
    postSimulation(simulationPayload)
      .then((result) => { if (alive) setSimulation(result); })
      .catch((error) => { if (alive) setSimulationError(error.message); })
      .finally(() => { if (alive) setSimulationLoading(false); });
    return () => { alive = false; };
  }, [simulationPayload, tab]);

  // 조합 분석 AI — 성향분석을 마치고 시뮬레이터 탭에 처음 들어왔을 때 한 번 실행한다.
  // 조합 생성·시뮬레이션은 전부 코드/Java(기존 엔진)가 하고, Sonnet은 Top3 선정+설명만 한다.
  useEffect(() => {
    // 추천 목록이 아직 안 왔으면(apiProducts 로딩 중) done 처리하지 않고 대기 — 목록이 채워지면
    // simulationOptions 의존성이 바뀌어 자동으로 다시 시도한다.
    if (tab !== 4 || !riskProfile || !simulationReady || simulationOptions.length === 0 || comboAnalysisDone) return undefined;
    let alive = true;
    setComboAnalysisLoading(true);
    setComboAnalysisError('');
    (async () => {
      try {
        const profileOptions = pickOptionsForProfile(simulationOptions, riskProfile.profile, 6);
        const combos = generateCandidateCombos(profileOptions, diag);
        if (combos.length === 0) {
          if (alive) { setTopCombos([]); setComboSimulations({}); }
          return;
        }
        const payloads = buildCandidatePayloads(simulationBase, combos);
        const settled = await Promise.allSettled(payloads.map((candidate) => postSimulation(candidate.payload)));
        const simulationsByComboId = {};
        const candidateSummaries = [];
        settled.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const sim = result.value;
          // 상환부담 초과·자격/중복/과다조달 등 제약 위반(REVIEW_REQUIRED) 조합은 후보에서 제외한다 —
          // Java 엔진은 이런 경우도 200으로 응답하므로 여기서 직접 걸러야 한다.
          const passesConstraints = sim?.constraints?.repaymentBurdenPassed === true
            && (sim?.constraints?.violations?.length ?? 0) === 0;
          if (!passesConstraints) return;
          const { comboId, items } = payloads[index];
          simulationsByComboId[comboId] = sim;
          candidateSummaries.push({
            comboId,
            products: items.map((item) => ({ id: item.id, name: item.short || item.name, type: item.type })),
            metrics: summarizeSimulationForAdvisor(sim),
          });
        });
        if (candidateSummaries.length === 0) {
          // 계산 자체는 됐지만 제약을 통과하는 조합이 없는 경우 — 오류가 아니라 "추천 가능한 조합 없음"으로 처리
          if (alive) { setTopCombos([]); setComboSimulations({}); }
          return;
        }
        const advice = await requestPortfolioAdvice({ riskProfile, candidates: candidateSummaries });
        const itemsByComboId = new Map(payloads.map((candidate) => [candidate.comboId, candidate.items]));
        const combosResolved = (advice?.combos || [])
          .map((combo) => ({ ...combo, items: itemsByComboId.get(combo.comboId) || [] }))
          .filter((combo) => combo.items.length > 0);
        if (alive) { setComboSimulations(simulationsByComboId); setTopCombos(combosResolved); }
      } catch (e) {
        if (alive) setComboAnalysisError(e.message);
      } finally {
        if (alive) { setComboAnalysisLoading(false); setComboAnalysisDone(true); }
      }
    })();
    return () => { alive = false; };
  }, [tab, riskProfile, simulationReady, simulationOptions, comboAnalysisDone, diag, simulationBase]);

  // v2 필수: 업종 · 매출 · 지출 3개
  const canAnalyze = !!diag.industryCode && Number(diag.salesMan) > 0 && diag.expenseMan !== '';

  // 상품 장착/해제 — 대환은 기존 대출이 있어야 하고, 같은 duplicateGroup 은 중복 장착 불가
  const toggle = (optionOrId) => {
    const option = typeof optionOrId === 'string'
      ? simulationOptions.find((item) => item.id === optionOrId)
      : optionOrId;
    if (!option) return;
    if (option.requiresExistingDebt && Number(diag.existingDebtMan || 0) <= 0) {
      setSimulationError('대환 상품은 기존 대출 잔액을 입력한 경우에만 선택할 수 있어요.');
      return;
    }
    const conflict = equipped.find((item) => item.key !== option.key
      && item.duplicateGroup && item.duplicateGroup === option.duplicateGroup);
    if (conflict && !equipped.some((item) => item.key === option.key)) {
      setSimulationError(`${option.short}과(와) ${conflict.short}은(는) 중복 가입할 수 없어요.`);
      return;
    }
    setSimulationError('');
    setEquipped((current) => (current.some((item) => item.key === option.key)
      ? current.filter((item) => item.key !== option.key)
      : [...current, option]));
  };

  const go = (nextTab) => {
    setTab(nextTab);
    setOverlay(null);
    window.scrollTo(0, 0);
  };

  // 하단 탭바로 시뮬레이터에 곧장 들어오면 성향분석을 건너뛰게 되므로, 아직 성향분석을
  // 안 한 최초 진입이면 추천 탭의 성향분석 화면으로 먼저 보낸다(완료하면 기존처럼 go(4)).
  const goTab = (nextTab) => {
    if (nextTab === 4 && !riskProfile) {
      setRecSub('risk');
      go(3);
      return;
    }
    go(nextTab);
  };

  const analyze = async () => {
    setAnalyzeError('');
    setAnalyzing(true);
    const startedAt = Date.now();
    try {
      // 선택 입력(임대료·인건비·재료비)이 하나라도 있으면 비용 세부를 전달 — rent 가 있으면 비용구조 축 활성화
      const hasCost = diag.rentMan || diag.laborMan || diag.purchaseMan;
      const costBreakdown = hasCost ? {
        rent: diag.rentMan ? manToWon(diag.rentMan) : null,
        laborCost: diag.laborMan ? manToWon(diag.laborMan) : null,
        purchaseCost: diag.purchaseMan ? manToWon(diag.purchaseMan) : null,
      } : null;
      // 매출이력 형식 정규화: 백엔드는 [{month:"YYYY-MM", amount}] 를 기대.
      // 홈택스 연동 mock 이 숫자 배열을 줄 수 있어 {month,amount} 로 변환한다(과거→최근).
      const rawHistory = hometax?.salesHistory;
      const salesHistory = Array.isArray(rawHistory) && rawHistory.length
        ? rawHistory.map((v, i, arr) => {
            if (v && typeof v === 'object') return v;
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
      // /api/rank 는 로컬 계산이라 수백 ms 만에 끝난다. 진단 로딩 화면이 한 프레임만
      // 번쩍이고 사라지지 않도록, 네 단계가 다 체크될 만큼은 붙잡아 둔다.
      const elapsed = Date.now() - startedAt;
      if (elapsed < DIAGNOSING_MIN_MS) await new Promise((res) => setTimeout(res, DIAGNOSING_MIN_MS - elapsed));

      setRank(r);
      setDetail(d);
      setDiagSub('report');
      window.scrollTo(0, 0);

      // 진단 결과 → 맞춤 추천(비동기). 서비스 미가동/실패 시 조용히 규칙기반 폴백 유지.
      const industryName = industries.find((it) => it.code === diag.industryCode)?.name || '';
      const salesMonthly = Number(diag.salesMan) || 0;
      const debtRatio = salesMonthly > 0 && diag.existingDebtMan
        ? Number(diag.existingDebtMan) / (salesMonthly * 12)
        : null;
      const bizAgeYears = diag.bizAgeYears ? Number(diag.bizAgeYears) : null;
      const profile = rankToProfile(r, {
        region: '서울', industry: industryName, bizAgeYears, debtRatio, userNeeds: needs,
      });
      fetchRecommendations(profile)
        .then(({ products: list, signals }) => { setApiProducts(list); setRecoSignals(signals); })
        .catch((err) => {
          console.warn('추천 서비스 폴백:', err.message);
          setApiProducts(null); setRecoSignals([]);
        });
    } catch (e) {
      setAnalyzeError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // 홈택스 연동 완료 → 업종·매출·지출·지출세부를 채우고 12개월 이력을 보관
  const onHometaxLinked = (f = HOMETAX_FINANCIALS) => {
    const linkedAnnualTax = (f.recentTaxPayments || []).reduce(
      (sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0,
    );
    setHometax(f);
    setDiag((d) => ({
      ...d,
      industryCode: d.industryCode || f.industryCode || '',
      salesMan: String(wonToMan(f.monthlySalesAvg)),
      expenseMan: String(wonToMan(f.totalMonthlyExpense)),
      rentMan: String(wonToMan(f.rent)),
      laborMan: String(wonToMan(f.laborCost)),
      purchaseMan: String(wonToMan(f.purchaseCost)),
      otherMan: f.otherExpense != null ? String(wonToMan(f.otherExpense)) : d.otherMan,
      annualTaxPaidMan: linkedAnnualTax > 0 ? String(wonToMan(linkedAnnualTax)) : d.annualTaxPaidMan,
    }));
  };

  // KB 계좌 연동 완료 → 보유현금·기존 대출 조건을 채운다 (홈택스엔 없는 계좌·여신 정보)
  const onKbLinked = (f = KB_LINK) => {
    setKbLinked(true);
    setDiag((d) => ({
      ...d,
      currentCashMan: String(wonToMan(f.currentCash)),
      hasExistingDebt: Number(f.existingDebtBalance) > 0 ? 'YES' : 'NONE',
      existingDebtMan: String(wonToMan(f.existingDebtBalance)),
      existingMonthlyPaymentMan: String(wonToMan(f.monthlyLoanPayment)),
      existingLoanRatePct: f.existingLoanRatePct,
      existingLoanRemainingMonths: f.existingLoanRemainingMonths,
    }));
  };

  const reset = () => {
    setDiag(DIAG_INIT); setNeeds([]); setHometax(null); setDetail(null); setRank(null);
    setEquipped([]); setAnalyzeError(''); setApiProducts(null); setRecoSignals([]);
    setSimulation(null); setSimulationError(''); setKbLinked(false);
    setTopCombos([]); setComboSimulations({}); setComboAnalysisDone(false); setComboAnalysisError('');
    setTab(1); setDiagSub('input'); setRecSub('list'); setRiskProfile(null); setSimSub('sim'); setOverlay(null);
    window.scrollTo(0, 0);
  };

  // 조합 분석 AI의 Top3 카드를 골랐을 때 — 검증이 끝난 조합이라 toggle() 재검증 없이 바로 장착한다.
  const applyCombo = (items) => { setSimulationError(''); setEquipped(items); };
  // 성향을 다시 답했거나 분석이 실패했을 때 재시도
  const retryComboAnalysis = () => { setComboAnalysisDone(false); setComboAnalysisError(''); };

  // ── 하단 CTA — 탭·단계마다 다음 행동 하나만 제시 ──
  let cta = null;
  if (!overlay) {
    if (tab === 2 && diagSub === 'input') {
      cta = {
        label: analyzing ? '분석 중…' : '우리 가게 분석하기',
        disabled: !canAnalyze || analyzing, green: true, onClick: analyze,
      };
    } else if (tab === 2 && diagSub === 'report') {
      cta = { label: '비용 리포트 보기', onClick: () => { setDiagSub('cost'); window.scrollTo(0, 0); } };
    } else if (tab === 2 && diagSub === 'cost') {
      cta = { label: '맞춤 상품 추천 받기', onClick: () => go(3) };
    } else if (tab === 3 && recSub === 'list') {
      // 성향분석 → 시뮬레이터는 진단 결과가 있어야 계산된다. 진단 전에는 그쪽으로 보내면
      // 막다른 길이라, 진단 입력으로 되돌린다.
      cta = rank
        ? { label: '사업 성향분석 하러가기', onClick: () => { setRecSub('risk'); window.scrollTo(0, 0); } }
        : { label: '진단 먼저 하기', green: true, onClick: () => { setDiagSub('input'); go(2); } };
    } else if (tab === 4 && simSub === 'sim') {
      cta = { label: '신청하기로 이동', onClick: () => { setSimSub('portfolio'); window.scrollTo(0, 0); } };
    }
  }
  // ── 뒤로가기 — 홈·내 정보에는 두지 않는다.
  // 오버레이(계좌·홈택스)는 화면이 자체 헤더를 그리므로 여기서는 만들지 않는다(‹ 중복 방지).
  const backOf = () => {
    if (overlay) return null;
    if (tab === 2) {
      return () => {
        if (diagSub === 'cost') setDiagSub(rank ? 'report' : 'input');
        else if (diagSub === 'report') setDiagSub('input');
        else go(1);
        window.scrollTo(0, 0);
      };
    }
    if (tab === 3) {
      return () => {
        if (recSub === 'risk') { setRecSub('list'); window.scrollTo(0, 0); }
        else go(1);
      };
    }
    if (tab === 4) {
      return () => {
        if (simSub === 'portfolio') { setSimSub('sim'); window.scrollTo(0, 0); }
        else go(1);
      };
    }
    return null;
  };
  const back = backOf();

  const titleOf = () => {
    if (tab === 2) return diagSub === 'input' ? '우리 가게 진단' : diagSub === 'report' ? '진단 리포트' : '비용 리포트';
    if (tab === 3) return recSub === 'risk' ? '사업 성향분석' : '맞춤 상품 추천';
    if (tab === 4) return simSub === 'sim' ? '금융 시뮬레이터' : '신청하기';
    return '';
  };

  if (!started) {
    return (
      <div className="app">
        <SplashScreen onStart={() => setStarted(true)} />
      </div>
    );
  }

  // 진단 중에는 전체화면으로 덮는다 — 헤더·CTA·탭바까지 가려서 중간에 이탈하지 못하게.
  if (analyzing) {
    const axisCount = 3
      + (diag.rentMan || diag.laborMan || diag.purchaseMan ? 1 : 0)   // 비용구조
      + ((hometax?.salesHistory?.length ?? 0) >= 3 ? 1 : 0);          // 매출안정성
    return (
      <div className="app">
        <DiagnosingScreen
          industryName={industries.find((it) => it.code === diag.industryCode)?.name}
          nStores={detail?.code === diag.industryCode ? detail?.nStores : undefined}
          nAreas={detail?.code === diag.industryCode ? detail?.nAreas : undefined}
          marginBenchmark={detail?.code === diag.industryCode ? detail?.marginBenchmark : undefined}
          salesMan={diag.salesMan}
          axisCount={axisCount}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {/* 상단 바 — 뒤로가기가 있는 화면에만 */}
      {back && (
        <div className="acct-bar">
          <button className="hdr-back" onClick={back}>‹</button>
          <span className="hdr-title">{titleOf()}</span>
          <span style={{ width: 38 }} />
        </div>
      )}

      <div className="app-body">
        {overlay === 'account' && (
          <AccountScreen
            onBack={() => setOverlay(null)}
            onOpenCostReport={() => { setOverlay(null); setTab(2); setDiagSub('cost'); window.scrollTo(0, 0); }}
          />
        )}
        {overlay === 'hometax' && (
          <HometaxScreen
            onBack={() => setOverlay(null)}
            onGoDiagnose={() => { setOverlay(null); setTab(2); setDiagSub('input'); window.scrollTo(0, 0); }}
            onUnlink={() => { setHometax(null); setOverlay(null); }}
          />
        )}
        {overlay === 'scenario' && (
          <ScenarioLabScreen
            equipped={equipped} simulationBase={simulationBase}
            onBack={() => setOverlay(null)}
          />
        )}

        {!overlay && tab === 1 && (
          <HomeScreen
            kbLinked={kbLinked} onLinkKb={onKbLinked} onOpenAccount={() => { setOverlay('account'); window.scrollTo(0, 0); }}
            hometaxLinked={!!hometax} onLinkHometax={onHometaxLinked} onOpenHometax={() => { setOverlay('hometax'); window.scrollTo(0, 0); }}
            rank={rank}
            onGoDiagnose={() => { setDiagSub('input'); go(2); }}
            onGoReport={() => { setDiagSub('report'); go(2); }}
            onGoRecommend={() => go(3)}
          />
        )}

        {!overlay && tab === 2 && (
          <>
            <StepTabs
              steps={[
                { key: 'input', label: '진단 입력' },
                { key: 'report', label: '진단 리포트', locked: !rank },
                { key: 'cost', label: '비용 리포트' },
              ]}
              value={diagSub}
              onChange={(k) => { setDiagSub(k); window.scrollTo(0, 0); }}
            />
            {diagSub === 'input' && (
              <InfoScreen
                industries={industries} diag={diag} setDiag={setDiag} detail={detail}
                needs={needs} setNeeds={setNeeds}
                kbLinked={kbLinked} onKbLinked={onKbLinked} onUnlinkKb={() => setKbLinked(false)}
                hometaxLinked={!!hometax} onHometaxLinked={onHometaxLinked} onUnlinkHometax={() => setHometax(null)}
                requestSheet={requestSheet} onSheetHandled={() => setRequestSheet(null)}
              />
            )}
            {diagSub === 'report' && <ReportScreen rank={rank} meta={meta} salesHistory={hometax?.salesHistory} />}
            {diagSub === 'cost' && <CostReportScreen report={txnReport} />}
          </>
        )}

        {!overlay && tab === 3 && recSub === 'list' && (
          <RecommendScreen products={products} percentile={topPercent} signals={recoSignals} aiRanked={!!apiProducts}
            onGoDiagnose={() => { setDiagSub('input'); go(2); }} />
        )}

        {!overlay && tab === 3 && recSub === 'risk' && (
          <RiskProfileScreen
            onComplete={(profile) => {
              setRiskProfile(profile);
              // 새 성향 결과이니 이전 조합 분석은 버리고 다시 계산한다.
              setComboAnalysisDone(false); setTopCombos([]); setComboSimulations({}); setComboAnalysisError('');
              setRecSub('list');
              go(4);
            }}
          />
        )}

        {!overlay && tab === 4 && (
          <>
            <StepTabs
              steps={[{ key: 'sim', label: '시뮬레이터' }, { key: 'portfolio', label: '신청하기' }]}
              value={simSub}
              onChange={(k) => { setSimSub(k); window.scrollTo(0, 0); }}
            />
            {simSub === 'sim' && (
              <SimulatorScreen options={simulationOptions} equipped={equipped} toggle={toggle} simRows={simRows}
                simulation={simulation} loading={simulationLoading}
                error={simulationError || (!simulationReady
                  ? '진단 입력의 자금 상황에서 보유 현금과 기존 대출 여부를 입력해 주세요.'
                  : '')}
                riskProfile={riskProfile} simulationReady={simulationReady}
                topCombos={topCombos} comboSimulations={comboSimulations}
                comboAnalysisLoading={comboAnalysisLoading} comboAnalysisDone={comboAnalysisDone} comboAnalysisError={comboAnalysisError}
                equippedComboId={equippedComboId} onApplyCombo={applyCombo} onRetryComboAnalysis={retryComboAnalysis}
                onOpenScenarioLab={() => { setOverlay('scenario'); window.scrollTo(0, 0); }} />
            )}
            {simSub === 'portfolio' && (
              <PortfolioScreen equipped={equipped} simRows={simRows}
                percentile={topPercent} simulation={simulation} products={products} />
            )}
          </>
        )}

        {!overlay && tab === 5 && (
          <ProfileScreen
            diag={diag} rank={rank} industries={industries} needs={needs} meta={meta}
            kbLinked={kbLinked} onLinkKb={onKbLinked} onUnlinkKb={() => setKbLinked(false)}
            hometaxLinked={!!hometax} onLinkHometax={onHometaxLinked} onUnlinkHometax={() => setHometax(null)}
            onOpenNeeds={() => { setRequestSheet('needs'); setDiagSub('input'); go(2); }}
            onReset={reset}
          />
        )}
      </div>

      {cta && (
        <div className="cta-wrap">
          {tab === 2 && diagSub === 'input' && (loadError || analyzeError) && (
            <p style={{ fontSize: 12.5, color: 'var(--danger)', fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
              {loadError || analyzeError}
              {loadError && (
                <button onClick={loadIndustries} style={{
                  marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 800, color: 'var(--gold-link)', textDecoration: 'underline',
                }}>다시 시도</button>
              )}
            </p>
          )}
          <button className="cta" onClick={() => { if (!cta.disabled) cta.onClick(); }} disabled={cta.disabled}
            style={cta.disabled
              ? { background: 'var(--border-strong)', color: 'var(--muted-faint)', boxShadow: 'none', cursor: 'default' }
              : cta.green
                ? { background: 'var(--green-deep)', color: '#fff', boxShadow: 'none' }
                : undefined}>
            {cta.label}
          </button>
        </div>
      )}

      <TabBar tab={tab} overlay={!!overlay} onGo={goTab} />
    </div>
  );
}
