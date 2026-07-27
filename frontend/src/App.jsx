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
import ReportScreen from './features/diagnosis/ReportScreen';
import CostReportScreen from './features/txn/CostReportScreen';
import RecommendScreen from './features/recommend/RecommendScreen';
import ProfileScreen from './features/profile/ProfileScreen';
import { recommendProducts } from './features/recommend/recommend';
import { fetchRecommendations, rankToProfile } from './api/recommend';
import { postAgent } from './api/agent';
import SimulatorScreen from './features/simulator/SimulatorScreen';
import PortfolioScreen from './features/simulator/PortfolioScreen';
import { buildSimRows, buildSimulationOptions, buildSimulationPayload } from './features/simulator/sim';
import { IconSparkle } from './shared/Icons';

// AI 에이전트 trace 표시용 도구 한글 라벨
const TOOL_KO = {
  get_diagnosis: '우리 가게 진단',
  recommend_policies: '맞춤 상품 검토',
  run_simulation: '현금흐름 시뮬레이션',
  optimize_portfolio: '최적 조합 탐색',
};

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
  const [simSub, setSimSub] = useState('sim');       // sim | portfolio
  const [overlay, setOverlay] = useState(null);      // null | 'account' | 'hometax'
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
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentResult, setAgentResult] = useState(null);
  const [agentError, setAgentError] = useState('');
  const [simulation, setSimulation] = useState(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState('');

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
        .then(setApiProducts)
        .catch((err) => { console.warn('추천 서비스 폴백:', err.message); setApiProducts(null); });
    } catch (e) {
      setAnalyzeError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // AI에게 맡기기 — 진단 입력을 넘기면 에이전트가 진단→추천→시뮬→포트폴리오를 자율 실행
  const runAgent = async () => {
    setAgentError(''); setAgentResult(null); setAgentRunning(true);
    try {
      const industryName = industries.find((it) => it.code === diag.industryCode)?.name || '';
      const result = await postAgent({
        industryCode: diag.industryCode,
        industry: industryName,
        monthlySales: manToWon(diag.salesMan),
        monthlyExpense: manToWon(diag.expenseMan || 0),
        currentCash: manToWon(diag.currentCashMan || 0),
        existingMonthlyPayment: manToWon(diag.existingMonthlyPaymentMan || 0),
      });
      if (result?.error) throw new Error(result.error);
      setAgentResult(result);
    } catch (e) {
      setAgentError(e.message);
    } finally {
      setAgentRunning(false);
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
    setEquipped([]); setAnalyzeError(''); setApiProducts(null);
    setSimulation(null); setSimulationError(''); setKbLinked(false);
    setTab(1); setDiagSub('input'); setSimSub('sim'); setOverlay(null);
    window.scrollTo(0, 0);
  };

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
    } else if (tab === 3) {
      cta = { label: '시뮬레이터에서 장착해보기', onClick: () => go(4) };
    } else if (tab === 4 && simSub === 'sim') {
      cta = { label: '포트폴리오 확인하기', onClick: () => { setSimSub('portfolio'); window.scrollTo(0, 0); } };
    }
  }
  const showAgentCta = !overlay && tab === 2 && diagSub === 'input';

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
    if (tab === 3) return () => go(1);
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
    if (tab === 3) return '맞춤 상품 추천';
    if (tab === 4) return simSub === 'sim' ? '금융 시뮬레이터' : '분석 포트폴리오';
    return '';
  };

  if (!started) {
    return (
      <div className="app">
        <SplashScreen onStart={() => setStarted(true)} />
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

        {!overlay && tab === 3 && <RecommendScreen products={products} percentile={topPercent} />}

        {!overlay && tab === 4 && (
          <>
            <StepTabs
              steps={[{ key: 'sim', label: '시뮬레이터' }, { key: 'portfolio', label: '포트폴리오' }]}
              value={simSub}
              onChange={(k) => { setSimSub(k); window.scrollTo(0, 0); }}
            />
            {simSub === 'sim' && (
              <SimulatorScreen options={simulationOptions} equipped={equipped} toggle={toggle} simRows={simRows}
                simulation={simulation} loading={simulationLoading}
                error={simulationError || (!simulationReady
                  ? '진단 입력의 자금 상황에서 보유 현금과 기존 대출 여부를 입력해 주세요.'
                  : '')} />
            )}
            {simSub === 'portfolio' && (
              <PortfolioScreen equipped={equipped} simRows={simRows}
                percentile={topPercent} simulation={simulation} />
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

          {showAgentCta && (
            <button className="cta" onClick={runAgent} disabled={!canAnalyze || agentRunning}
              style={{
                marginTop: 8,
                background: (!canAnalyze || agentRunning) ? '#F3E4C0' : '#FFBC00',
                color: 'var(--ink)', boxShadow: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
              {!agentRunning && <IconSparkle size={17} />}
              {agentRunning ? '든든이 AI가 판단 중…' : '든든이 AI에게 맡기기'}
            </button>
          )}
        </div>
      )}

      <TabBar tab={tab} overlay={!!overlay} onGo={go} />

      {(agentRunning || agentResult || agentError) && (
        <div onClick={() => { if (!agentRunning) { setAgentResult(null); setAgentError(''); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,21,24,.5)', display: 'flex',
            alignItems: 'flex-end', zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '82%', overflowY: 'auto',
              background: 'var(--canvas)', borderRadius: '24px 24px 0 0', padding: '22px 20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{
                flex: 'none', width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', background: 'var(--gold-link)',
              }}><IconSparkle size={15} /></span>
              <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--ink)' }}>든든이 AI</span>
              {!agentRunning && (
                <button onClick={() => { setAgentResult(null); setAgentError(''); }}
                  style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 20, color: 'var(--muted-faint)', cursor: 'pointer' }}>×</button>
              )}
            </div>

            {agentRunning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>
                  진단 → 추천 → 시뮬레이션을 스스로 판단하고 있어요…
                </span>
              </div>
            )}

            {agentError && (
              <p style={{ fontSize: 13.5, color: 'var(--danger)', fontWeight: 700, lineHeight: 1.6 }}>
                에이전트 호출 실패: {agentError}<br />
                <span style={{ color: 'var(--muted)', fontWeight: 500 }}>추천 서비스(8000)가 켜져 있고 ANTHROPIC_API_KEY가 설정됐는지 확인해주세요.</span>
              </p>
            )}

            {agentResult && (
              <>
                {Array.isArray(agentResult.trace) && agentResult.trace.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {agentResult.trace.map((t, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                        <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: 'var(--green-soft)' }}>{i + 1}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{TOOL_KO[t.tool] || t.tool}</p>
                          {t.tool === 'run_simulation' && t.output && (
                            <p style={{ fontSize: 11.5, color: t.output.repayment_burden_passed ? 'var(--green-text)' : 'var(--danger)', fontWeight: 600 }}>
                              상환부담 {(t.output.repayment_burden_ratio * 100).toFixed(0)}% · {t.output.repayment_burden_passed ? '기준 통과' : '기준 초과 → 재검토'}
                            </p>
                          )}
                          {t.tool === 'recommend_policies' && t.output && (
                            <p style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>후보 {t.output.count}개 검토</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="card">
                  <p style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {agentResult.final}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
