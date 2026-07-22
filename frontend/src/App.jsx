import { useEffect, useMemo, useState } from 'react';
import Header from './shared/Header';
import { manToWon, wonToMan } from './shared/format';
import { getIndustries, getMeta, getIndustry, postRank } from './api/diagnosis';
import InfoScreen from './features/diagnosis/InfoScreen';
import ReportScreen from './features/diagnosis/ReportScreen';
import RecommendScreen from './features/recommend/RecommendScreen';
import { recommendProducts } from './features/recommend/recommend';
import { fetchRecommendations, rankToProfile } from './api/recommend';
import SimulatorScreen from './features/simulator/SimulatorScreen';
import PortfolioScreen from './features/simulator/PortfolioScreen';
import { buildSimRows } from './features/simulator/sim';

const TITLES = ['우리 가게 위치', '진단 리포트', '맞춤 상품 추천', '금융 시뮬레이터', '분석 포트폴리오'];
const CTAS = ['우리 가게 분석하기', '맞춤 상품 추천 받기', '시뮬레이터에서 장착해보기', '포트폴리오 확인하기', '처음부터 다시 하기'];
// rentMan/laborMan/purchaseMan: 선택 입력 — 임대료가 있으면 비용구조 축이 추가된다 (백엔드 v2 보정)
const DIAG_INIT = { industryCode: '', areaType: '', salesMan: '', expenseMan: '', rentMan: '', laborMan: '', purchaseMan: '' };

export default function App() {
  const [screen, setScreen] = useState(0);
  const [industries, setIndustries] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [diag, setDiag] = useState(DIAG_INIT);
  const [hometax, setHometax] = useState(null);  // 홈택스 연동 결과 financials (salesHistory → 안정성 축)
  const [detail, setDetail] = useState(null);   // 선택 업종 상세(분포 격자)
  const [rank, setRank] = useState(null);        // /api/rank 결과
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  const [equipped, setEquipped] = useState([]);
  const [apiProducts, setApiProducts] = useState(null);  // /api/recommend 결과 (실패 시 null → 규칙기반 폴백)
  const [riskTolerance, setRiskTolerance] = useState('stable');  // 'stable'(안정) | 'growth'(성장)

  // 업종 목록·메타 최초 로드
  useEffect(() => {
    getIndustries().then(setIndustries).catch((e) => setLoadError('업종 목록을 불러오지 못했어요: ' + e.message));
    getMeta().then(setMeta).catch(() => {});
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
  const baseCash = rank ? wonToMan(rank.profit.value) : undefined;
  const simRows = useMemo(() => buildSimRows(equipped, baseCash), [equipped, baseCash]);

  const canAnalyze = diag.industryCode && Number(diag.salesMan) > 0;

  const toggle = (id) => setEquipped((eq) =>
    eq.includes(id) ? eq.filter((x) => x !== id) : eq.length >= 3 ? eq : [...eq, id]);

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

      // 진단 결과 → 맞춤 추천(비동기). 서비스 미가동/실패 시 조용히 규칙기반 폴백 유지.
      const industryName = industries.find((it) => it.code === diag.industryCode)?.name || '';
      const profile = rankToProfile(r, { region: '서울', industry: industryName, riskTolerance });
      fetchRecommendations(profile)
        .then(setApiProducts)
        .catch((err) => { console.warn('추천 서비스 폴백:', err.message); setApiProducts(null); });
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

  const reset = () => {
    setScreen(0); setDiag(DIAG_INIT); setHometax(null); setDetail(null); setRank(null);
    setEquipped([]); setAnalyzeError(''); setApiProducts(null);
  };

  const next = () => {
    if (screen === 0) return analyze();
    if (screen === 4) return reset();
    setScreen((s) => s + 1);
    window.scrollTo(0, 0);
  };

  const ctaDisabled = screen === 0 && (!canAnalyze || analyzing);
  const ctaLabel = screen === 0 && analyzing ? '분석 중…' : CTAS[screen];

  return (
    <div className="app">
      <Header title={TITLES[screen]} screen={screen} onBack={() => setScreen((s) => Math.max(0, s - 1))} />
      <div className="app-body">
        {screen === 0 && (
          <InfoScreen industries={industries} diag={diag} setDiag={setDiag} detail={detail}
            onHometaxLinked={onHometaxLinked} />
        )}
        {screen === 1 && <ReportScreen rank={rank} detail={detail} meta={meta} salesHistory={hometax?.salesHistory} />}
        {screen === 2 && <RecommendScreen products={products} percentile={topPercent} />}
        {screen === 3 && <SimulatorScreen equipped={equipped} toggle={toggle} simRows={simRows} />}
        {screen === 4 && <PortfolioScreen equipped={equipped} simRows={simRows} percentile={topPercent} />}
      </div>

      <div className="cta-wrap">
        {screen === 0 && (loadError || analyzeError) && (
          <p style={{ fontSize: 12.5, color: '#D0564C', fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
            {loadError || analyzeError}
          </p>
        )}
        <button className="cta" onClick={next} disabled={ctaDisabled}
          style={ctaDisabled ? { background: '#EFE6D4', color: '#C4BAAD', boxShadow: 'none', cursor: 'default' } : undefined}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
