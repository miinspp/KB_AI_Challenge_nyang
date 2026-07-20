import { useEffect, useMemo, useState } from 'react'
import { getIndustries, getIndustry, getMeta, postRank } from './api.js'

const MAN = 10000 // 만원 → 원

const fmtMan = (krw) =>
  krw == null ? '-' : `${Math.round(krw / MAN).toLocaleString()}만원`

const GROUP_ORDER = { CS1: '외식업', CS2: '서비스업', CS3: '소매업' }

export default function App() {
  const [industries, setIndustries] = useState([])
  const [meta, setMeta] = useState(null)
  const [code, setCode] = useState('')
  const [areaType, setAreaType] = useState('')     // 상권유형 (선택)
  const [salesMan, setSalesMan] = useState('')     // 월 매출 (만원)
  const [expenseMan, setExpenseMan] = useState('') // 월 지출 (만원)
  const [weights, setWeights] = useState({ sales: 50, profit: 30, margin: 20 })
  const [showWeights, setShowWeights] = useState(false)
  const [result, setResult] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getIndustries().then(setIndustries).catch((e) => setError('업종 목록 로드 실패: ' + e.message))
    getMeta().then(setMeta).catch(() => {})
  }, [])

  const selected = useMemo(() => industries.find((i) => i.code === code), [industries, code])

  const grouped = useMemo(() => {
    const g = {}
    for (const i of industries) {
      const key = GROUP_ORDER[i.code.slice(0, 3)] || '기타'
      ;(g[key] = g[key] || []).push(i)
    }
    return g
  }, [industries])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    const sales = Number(salesMan) * MAN
    const expense = Number(expenseMan || 0) * MAN
    if (!code) return setError('업종을 선택해 주세요.')
    if (!(sales > 0)) return setError('월 매출을 입력해 주세요.')
    setLoading(true)
    try {
      const [r, d] = await Promise.all([
        postRank({
          industryCode: code,
          monthlySales: sales,
          monthlyExpense: expense,
          areaType: areaType || null,
          weights: { sales: weights.sales, profit: weights.profit, margin: weights.margin },
        }),
        getIndustry(code),
      ])
      setResult(r)
      setDetail(d)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wrap">
      <h1>우리 가게 위치 진단</h1>
      <p className="sub">
        같은 업종 점포들의 실제 매출 분포(서울시 상권분석서비스)와 비교해, 우리 가게가{' '}
        <b>상위 몇 %</b>인지 알려드립니다.
      </p>

      <form onSubmit={submit} className="card form">
        <label>
          업종
          <select value={code} onChange={(e) => { setCode(e.target.value); setAreaType('') }}>
            <option value="">-- 업종 선택 --</option>
            {Object.entries(grouped).map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.name} (서울 {i.nStores.toLocaleString()}개 · 중위 월매출 {fmtMan(i.medianMonthlySales)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {selected && selected.areaTypes?.length > 0 && (
          <label>
            상권 유형 <span className="hint">선택하면 같은 유형 상권 내 순위도 함께 계산</span>
            <select value={areaType} onChange={(e) => setAreaType(e.target.value)}>
              <option value="">서울 전체 (기본)</option>
              {selected.areaTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        )}

        <div className="row">
          <label>
            월 평균 매출 (만원)
            <input type="number" min="1" value={salesMan} placeholder="예: 2500"
                   onChange={(e) => setSalesMan(e.target.value)} />
          </label>
          <label>
            월 평균 지출 (만원) <span className="hint">재료비+임차료+인건비 등</span>
            <input type="number" min="0" value={expenseMan} placeholder="예: 1900"
                   onChange={(e) => setExpenseMan(e.target.value)} />
          </label>
        </div>

        <details open={showWeights} onToggle={(e) => setShowWeights(e.target.open)}>
          <summary>평가 가중치 조정 (기본: 매출 50 · 순수익 30 · 비용효율 20)</summary>
          {['sales', 'profit', 'margin'].map((k) => (
            <label key={k} className="slider">
              {{ sales: '매출', profit: '순수익', margin: '비용 효율' }[k]} : {weights[k]}
              <input type="range" min="0" max="100" value={weights[k]}
                     onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
            </label>
          ))}
        </details>

        <button disabled={loading}>{loading ? '계산 중…' : '내 위치 확인하기'}</button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <div className="card result">
          <h2>
            {result.industryName} 업종에서 <span className="big">상위 {result.topPercent}%</span>
          </h2>
          <p className="score">종합점수 {result.compositeScore}점 / 100점</p>

          {result.areaRank && (
            <p className="score">
              같은 <b>{result.areaRank.areaType}</b>만 비교하면{' '}
              <b>상위 {result.areaRank.topPercent}%</b> (종합 {result.areaRank.compositeScore}점 ·
              매출 상위 {result.areaRank.salesTopPercent}% · 동일 유형 중위 매출 {fmtMan(result.areaRank.peerMedian)} ·
              점포 {result.areaRank.nStores.toLocaleString()}개)
            </p>
          )}

          <Bar label={`매출 (상위 ${result.sales.topPercent}%)`}
               pct={result.sales.percentile}
               desc={`내 매출 ${fmtMan(result.sales.value)} · 동종 중위 ${fmtMan(result.sales.peerMedian)} (P25 ${fmtMan(result.sales.peerP25)} ~ P75 ${fmtMan(result.sales.peerP75)})`} />
          <Bar label={`순수익 (상위 ${result.profit.topPercent}%)`}
               pct={result.profit.percentile}
               desc={`내 순수익 ${fmtMan(result.profit.value)} · 동종 추정 중위 ${fmtMan(result.profit.peerMedian)}`} />
          <Bar label={`비용 효율 ${result.margin.score}점`}
               pct={result.margin.score}
               desc={`내 영업이익률 ${(result.margin.value * 100).toFixed(1)}% · 업종 벤치마크 ${(result.margin.benchmark * 100).toFixed(1)}% (${result.benchmarkGroupLabel})`} />

          {detail && <Distribution detail={detail} mySales={Number(salesMan) * MAN} />}

          <p className="peer">
            비교 모집단: 서울시 {result.industryName} 점포 {result.peer.nStores.toLocaleString()}개
            (상권 {result.peer.nAreas.toLocaleString()}곳의 점포당 매출 분포, 점포수 가중)
          </p>
          <ul className="notes">
            {result.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      <Methodology meta={meta} />
    </div>
  )
}

function Bar({ label, pct, desc }) {
  return (
    <div className="bar-block">
      <div className="bar-label">{label}</div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(1, pct)}%` }} />
      </div>
      <div className="bar-desc">{desc}</div>
    </div>
  )
}

/** 업종 매출 분포(백분위 격자)를 SVG 곡선으로 그리고 내 위치를 표시 */
function Distribution({ detail, mySales }) {
  const q = detail.quantiles
  const W = 560, H = 120, PAD = 8
  const maxV = q[95] // 상위 극단값(최상위 1~5%)이 축을 압축하지 않도록 95백분위까지 표시
  const pts = q.map((v, i) => {
    const x = PAD + (i / 100) * (W - 2 * PAD)
    const y = H - PAD - (Math.min(v, maxV) / maxV) * (H - 2 * PAD)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  // 내 매출의 x 위치 = 퍼센타일 (프론트 근사: 격자 역보간)
  let p = 100
  for (let i = 0; i < 100; i++) {
    if (mySales <= q[i + 1]) {
      const span = q[i + 1] - q[i]
      p = span > 0 ? i + (mySales - q[i]) / span : i
      break
    }
  }
  if (mySales <= q[0]) p = 0
  const mx = PAD + (Math.max(0, Math.min(100, p)) / 100) * (W - 2 * PAD)
  return (
    <div className="dist">
      <div className="bar-label">동종 업종 매출 분포 (가로축: 백분위, 세로축: 점포당 월매출 · 95백분위까지 표시)</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        <polyline points={pts} fill="none" stroke="#4a7dbd" strokeWidth="2" />
        <line x1={mx} y1={PAD} x2={mx} y2={H - PAD} stroke="#d9534f" strokeWidth="2" strokeDasharray="4 3" />
        <text x={Math.min(mx + 4, W - 60)} y={16} fontSize="11" fill="#d9534f">내 위치</text>
      </svg>
    </div>
  )
}

function Methodology({ meta }) {
  if (!meta) return null
  const m = meta.meta
  return (
    <div className="card method">
      <h3>산출 근거 · 방법론</h3>
      <ul>
        <li>
          매출 분포: <a href={m.sourceUrl} target="_blank" rel="noreferrer">{m.sourceDataset}</a>
          {' '}(기준 분기: {Array.isArray(m.quartersCovered) ? m.quartersCovered.join(', ') : ''})
        </li>
        <li>{m.methodology}</li>
        <li>
          수익성 벤치마크: {m.benchmarkSource?.name} — {m.benchmarkSource?.detail}
        </li>
        <li>
          종합점수 = 매출 퍼센타일 × 0.5 + 순수익 퍼센타일 × 0.3 + 비용효율 점수 × 0.2 (가중치 조정 가능),
          상위% = 100 − 종합점수.
        </li>
        <li className="caveat">
          한계: 추정매출은 카드사 데이터 기반 추정치이며, 순수익 분포는 업종 평균 이익률로 유도한
          근사치입니다. 비교 범위는 서울시내 상권으로 한정됩니다.
        </li>
      </ul>
    </div>
  )
}
