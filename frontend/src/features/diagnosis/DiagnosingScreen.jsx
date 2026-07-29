import { useEffect, useState } from 'react';
import bearOwner from '../../assets/simulator/bear-owner-cutout.png';

/** 한 단계가 체크되기까지 걸리는 시간 — 4단계 × 620ms ≈ 2.5초 */
const STEP_MS = 620;

/**
 * 진단 로딩 — '우리 가게 분석하기'를 누른 뒤 결과가 나오기까지 덮는 전체화면.
 *
 * /api/rank 는 로컬 계산이라 대개 수백 ms 안에 끝난다. 그래서 이 화면은 시간을 때우는 게
 * 아니라 "무엇을 근거로 계산했는지"를 보여주는 용도다 — 네 단계와 오른쪽 수치는 모두
 * 실제 계산에 쓰이는 값이다(입력 매출 · 상권 표본 수 · 업종 평균 이익률 · 종합점수 축 수).
 * App.analyze() 가 최소 노출 시간을 보장하므로 여기서는 진행 표시만 담당한다.
 */
export default function DiagnosingScreen({ industryName, nStores, nAreas, marginBenchmark, salesMan, axisCount }) {
  const steps = [
    { label: '입력값 확인', value: salesMan ? `매출 ${Number(salesMan).toLocaleString()}만` : '입력값 정리' },
    { label: '상권 분포 비교', value: nAreas ? `${nAreas.toLocaleString()}곳` : '서울 상권' },
    { label: '업종 이익률 적용', value: marginBenchmark ? `${(marginBenchmark * 100).toFixed(1)}%` : '업종 평균' },
    { label: '종합점수 산출', value: `${axisCount}축` },
  ];

  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= steps.length) return undefined;
    const t = setTimeout(() => setDone((n) => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [done, steps.length]);

  return (
    <div className="diagnosing">
      <img className="diagnosing-char bear-sway" src={bearOwner} alt="" aria-hidden="true" />

      <div style={{ textAlign: 'center' }}>
        <p className="diagnosing-title">숫자 맞춰보는 중이에요</p>
        <p className="diagnosing-sub">
          {industryName && nStores
            ? `서울 ${industryName} ${nStores.toLocaleString()}곳과 비교`
            : '서울시 실측 분포와 비교'}
        </p>
      </div>

      <div className="diagnosing-track" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length}
        aria-valuenow={done} aria-label="진단 진행 상황">
        <div className="diagnosing-fill" style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
      </div>

      <div className="diagnosing-card">
        {steps.map((s, i) => {
          const checked = i < done;
          return (
            <div key={s.label} className="diagnosing-row">
              <span className={`diagnosing-check${checked ? ' on' : ''}`} aria-hidden="true">✓</span>
              <span className="diagnosing-label" style={{ color: checked ? 'var(--ink)' : 'var(--muted-soft)' }}>{s.label}</span>
              <span className="diagnosing-value">{checked ? s.value : ''}</span>
            </div>
          );
        })}
      </div>

      <p className="diagnosing-foot">잠깐만요, 공공데이터를 불러오고 있어요</p>
    </div>
  );
}
