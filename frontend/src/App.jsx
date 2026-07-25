import { useEffect, useMemo, useState } from 'react';
import Header from './shared/Header';
import { manToWon, wonToMan } from './shared/format';
import { getIndustries, getMeta, getIndustry, postRank } from './api/diagnosis';
import { getTxnReport } from './api/txn';
import { postSimulation } from './api/simulation';
import SplashScreen from './features/splash/SplashScreen';
import HomeScreen from './features/home/HomeScreen';
import AccountScreen from './features/account/AccountScreen';
import { KB_FINANCIALS } from './features/account/accountMock';
import InfoScreen from './features/diagnosis/InfoScreen';
import ReportScreen from './features/diagnosis/ReportScreen';
import CostReportScreen from './features/txn/CostReportScreen';
import RecommendScreen from './features/recommend/RecommendScreen';
import { recommendProducts } from './features/recommend/recommend';
import { fetchRecommendations, rankToProfile } from './api/recommend';
import { postAgent } from './api/agent';
import SimulatorScreen from './features/simulator/SimulatorScreen';
import PortfolioScreen from './features/simulator/PortfolioScreen';
import { buildSimRows, buildSimulationPayload } from './features/simulator/sim';

const TITLES = ['우리 가게 위치', '진단 리포트', '비용 리포트', '맞춤 상품 추천', '금융 시뮬레이터', '분석 포트폴리오'];
const CTAS = ['우리 가게 분석하기', '비용 리포트 보기', '맞춤 상품 추천 받기', '시뮬레이터에서 장착해보기', '포트폴리오 확인하기', '처음부터 다시 하기'];
// AI 에이전트 trace 표시용 도구 한글 라벨
const TOOL_KO = {
  get_diagnosis: '우리 가게 진단',
  recommend_policies: '맞춤 상품 검토',
  run_simulation: '현금흐름 시뮬레이션',
  optimize_portfolio: '최적 조합 탐색',
};
// rentMan/laborMan/purchaseMan: 선택 입력 — 임대료가 있으면 비용구조 축이 추가된다 (백엔드 v2 보정)
// areaText/bizAge/salesChannel/cardCashRatio: 온보딩 표시·정밀도 보조값 (연동 시 자동 채움, 아직 postRank 미전달)
const DIAG_INIT = {
  industryCode: '', areaType: '', salesMan: '', expenseMan: '', bizAgeYears: '',

  rentMan: '', laborMan: '', purchaseMan: '',
  currentCashMan: '', existingDebtMan: '', existingMonthlyPaymentMan: '',
  existingLoanRatePct: '', existingLoanRemainingMonths: '',
};

export default function App() {
  const [started, setStarted] = useState(false);  // 표지 화면 통과 여부
  const [route, setRoute] = useState('home');     // home | flow | account
  const [screen, setScreen] = useState(0);
  const [entryScreen, setEntryScreen] = useState(0);  // 홈에서 어느 화면으로 진입했는지(뒤로가기 기준점)
  const [kbLinked, setKbLinked] = useState(false);  // KB 계좌 연동 여부(홈·온보딩 공유)
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
  const [apiProducts, setApiProducts] = useState(null);  // /api/recommend 결과 (실패 시 null → 규칙기반 폴백)
  const [agentRunning, setAgentRunning] = useState(false);  // AI 에이전트 자율 실행 상태
  const [agentResult, setAgentResult] = useState(null);
  const [agentError, setAgentError] = useState('');
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

  // 추천 서비스(/api/recommend) 결과를 우선 사용, 없으면 기존 규칙기반으로 폴백
  const products = useMemo(
    () => apiProducts ?? recommendProducts(rank),
    [apiProducts, rank],
  );
  const topPercent = rank ? rank.topPercent : null;
  const simulationPayload = useMemo(
    () => rank ? buildSimulationPayload({ rank, diag, hometax, equipped, products }) : null,
    [rank, diag, hometax, equipped, products],
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
          salesHistory,   // 홈택스 연동 시 6개월 이력 → 안정성 축 (형식 정규화됨)
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
      const debtRatio = salesMonthly > 0 && diag.existingDebtMan
        ? Number(diag.existingDebtMan) / (salesMonthly * 12)
        : null;
      const bizAgeYears = diag.bizAgeYears ? Number(diag.bizAgeYears) : null;
      const profile = rankToProfile(r, {
        region: '서울', industry: industryName, bizAgeYears, debtRatio,
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
      setAgentResult(result);
    } catch (e) {
      setAgentError(e.message);
    } finally {
      setAgentRunning(false);
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
    setKbLinked(true);
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
    setEquipped([]); setAnalyzeError(''); setApiProducts(null);
    setSimulation(null); setSimulationError('');
    setKbLinked(false); setRoute('home'); setEntryScreen(0);
  };

  // 홈 메뉴 → 기존 6단계 플로우 진입.
  // 진단 결과가 있어야 의미 있는 화면(리포트·추천·시뮬·포트폴리오)은 입력 화면으로 돌려보낸다.
  const NEEDS_RANK = [1, 3, 4, 5];
  const goFlow = (target) => {
    const to = NEEDS_RANK.includes(target) && !rank ? 0 : target;
    setScreen(to);
    setEntryScreen(to);   // 진입 지점보다 뒤로는 가지 않는다(방문한 적 없는 화면으로 되돌아가지 않도록)
    setRoute('flow');
    window.scrollTo(0, 0);
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

  if (!started) {
    return (
      <div className="app">
        <SplashScreen onStart={() => setStarted(true)} />
      </div>
    );
  }

  if (route === 'home') {
    return (
      <div className="app">
        <HomeScreen
          kbLinked={kbLinked}
          onLinkKb={() => onKbLinked(KB_FINANCIALS)}
          onOpenAccount={() => { setRoute('account'); window.scrollTo(0, 0); }}
          onGo={goFlow}
        />
      </div>
    );
  }

  if (route === 'account') {
    return (
      <div className="app">
        <AccountScreen
          onBack={() => { setRoute('home'); window.scrollTo(0, 0); }}
          onOpenCostReport={() => goFlow(2)}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <Header title={TITLES[screen]} screen={screen}
        onBack={() => {
          if (screen <= entryScreen) { setRoute('home'); return; }
          setScreen((s) => s - 1);
          window.scrollTo(0, 0);
        }} />
      <div className="app-body">
        {screen === 0 && (
          <InfoScreen industries={industries} diag={diag} setDiag={setDiag} detail={detail}
            kbLinked={kbLinked} onUnlinkKb={() => setKbLinked(false)}
            onHometaxLinked={onHometaxLinked} onKbLinked={onKbLinked} />
        )}
        {screen === 1 && <ReportScreen rank={rank} detail={detail} meta={meta} salesHistory={hometax?.salesHistory} />}
        {screen === 2 && <CostReportScreen report={txnReport} />}
        {screen === 3 && <RecommendScreen products={products} percentile={topPercent} />}
        {screen === 4 && <SimulatorScreen products={products} equipped={equipped} toggle={toggle} simRows={simRows}
          simulation={simulation} loading={simulationLoading} error={simulationError} />}
        {screen === 5 && <PortfolioScreen products={products} equipped={equipped} simRows={simRows} percentile={topPercent}
          simulation={simulation} />}
      </div>

      <div className="cta-wrap">
        {screen === 0 && (loadError || analyzeError) && (
          <p style={{ fontSize: 12.5, color: 'var(--danger)', fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
            {loadError || analyzeError}
          </p>
        )}
        <button className="cta" onClick={next} disabled={ctaDisabled}
          style={ctaDisabled
            ? { background: 'var(--border-strong)', color: 'var(--muted-faint)', boxShadow: 'none', cursor: 'default' }
            : ctaGreen
              ? { background: 'var(--green-deep)', color: '#fff', boxShadow: '0 8px 20px -8px rgba(63,107,46,.45)' }
              : undefined}>
          {ctaLabel}
        </button>

        {screen === 0 && (
          <button className="cta" onClick={runAgent} disabled={!canAnalyze || agentRunning}
            style={{
              marginTop: 8,
              background: (!canAnalyze || agentRunning) ? '#F3E4C0' : '#FFC01E',
              color: 'var(--ink)', boxShadow: 'none',
            }}>
            {agentRunning ? '든든이 AI가 판단 중…' : '✨ 든든이 AI에게 맡기기'}
          </button>
        )}
      </div>

      {(agentRunning || agentResult || agentError) && (
        <div onClick={() => { if (!agentRunning) { setAgentResult(null); setAgentError(''); } }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(43,40,37,.5)', display: 'flex',
            alignItems: 'flex-end', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxHeight: '82%', overflowY: 'auto', background: 'var(--canvas)',
              borderRadius: '24px 24px 0 0', padding: '22px 20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 18 }}>✨</span>
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
                <div style={{ background: '#fff', border: '1.5px solid var(--border)', borderRadius: 16, padding: '15px 16px' }}>
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
