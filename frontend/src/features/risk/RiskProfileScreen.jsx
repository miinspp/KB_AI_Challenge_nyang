import { useMemo, useState } from 'react';
import { RISK_QUESTIONS, classifyRiskProfile, scoreRiskAnswers } from './riskProfile';

/**
 * 추천(전체 목록) 화면과 시뮬레이터 사이에 들어가는 성향분석 페이지.
 * 5개 문항에 답하면 공격형/균형형/보수형 중 하나로 분류하고,
 * 완료 시 onComplete(profileResult) 로 결과를 상위(App)에 넘긴다.
 * profileResult 모양: { answers, totalScore, profile, profileLabel }
 * (시뮬레이터/에이전트 입력값 결합 방식은 별도 명세 참고 — 이 화면은 아직 라우팅에 연결되지 않음)
 */
export default function RiskProfileScreen({ onComplete }) {
  const [answers, setAnswers] = useState({});

  const allAnswered = RISK_QUESTIONS.every((q) => answers[q.key] != null);
  const totalScore = useMemo(() => scoreRiskAnswers(answers), [answers]);
  const profile = useMemo(() => classifyRiskProfile(totalScore), [totalScore]);

  const choose = (qKey, score) => setAnswers((a) => ({ ...a, [qKey]: score }));

  return (
    <div className="scr">
      <p className="h1">사업 성향을 알려주세요</p>
      <p className="sub">5가지 질문으로 사장님께 맞는 조합을 찾아드려요</p>

      {RISK_QUESTIONS.map((q, qi) => (
        <div key={q.key} className="card">
          <p className="label-sm">{qi + 1}. {q.label}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {q.options.map((opt) => {
              const on = answers[q.key] === opt.score;
              return (
                <button
                  key={opt.score}
                  type="button"
                  className={`risk-opt${on ? ' on' : ''}`}
                  onClick={() => choose(q.key, opt.score)}
                >
                  <span className="risk-opt-dot" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {allAnswered && (
        <div className="card pop" style={{ textAlign: 'center' }}>
          <p className="label-sm">사장님의 투자 성향은</p>
          <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--ink)', marginTop: 6, letterSpacing: -.5 }}>
            {profile.label}
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6, fontWeight: 600 }}>{profile.blurb}</p>
        </div>
      )}

      <div className="cta-wrap">
        <button
          className="cta"
          disabled={!allAnswered}
          style={!allAnswered ? { background: 'var(--border-strong)', color: 'var(--muted-faint)' } : undefined}
          onClick={() => onComplete?.({
            answers, totalScore, profile: profile.type, profileLabel: profile.label,
          })}
        >
          시뮬레이터로 분석하기
        </button>
      </div>
    </div>
  );
}
