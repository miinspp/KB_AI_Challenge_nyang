import { useState } from 'react';
import { IconSparkle } from '../../shared/Icons';
import { buildComboDetailCandidate, buildSimRows } from './sim';
import { requestPortfolioDetail } from '../../api/portfolio';
import { RankIcon, SimulationSummaryPanel } from './SimulatorScreen';

/**
 * Top3 조합 상세 — 원래는 바텀시트(포털 + 반투명 배경)로 띄웠는데, 시트 바깥 여백을 스크롤하면
 * 뒤쪽 SimulatorScreen 내용(헤더·탭·"AI 추천 조합 Top3")이 그 위에 겹쳐 보이는 문제가 두 번의
 * 스크롤 잠금 시도(overflow:hidden → position:fixed 트릭) 이후에도 반복 재현됐다.
 * 상황 실험실·직접 조합하기와 똑같이 App.jsx의 overlay 방식(완전히 별도 페이지)으로 바꿔서
 * 근본적으로 피해간다 — 배경 위에 뜨는 레이어 자체가 없어지므로 겹침이 구조적으로 불가능해진다.
 */
export default function ComboDetailScreen({ combo, simulation, riskProfile, onBack }) {
  const [aiOpen, setAiOpen] = useState(false);
  const [aiDetail, setAiDetail] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const fetchAiDetail = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await requestPortfolioDetail({
        riskProfile,
        candidate: buildComboDetailCandidate(combo, simulation),
        headline: combo.headline,
        reason: combo.reason,
        caution: combo.caution || '',
      });
      setAiDetail(res && (res.fit || res.strength) ? res : { fit: combo.reason, strength: '', caution: combo.caution || '' });
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiClick = () => {
    const next = !aiOpen;
    setAiOpen(next);
    if (next && !aiDetail && !aiLoading) fetchAiDetail();
  };

  return (
    <div className="acct">
      <div className="acct-bar">
        <button className="hdr-back" onClick={onBack}>‹</button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'center' }}>
          <RankIcon rank={combo.rank} size={22} />
          <span className="hdr-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{combo.headline}</span>
        </span>
        <span style={{ width: 38 }} />
      </div>

      <div style={{ padding: '0 22px' }}>
        <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--gold-link)' }}>지금 이 조합으로 장착해서 보고 있어요</p>

        {/* 상품 이름은 아래 "시뮬레이션 요약 > 이 조합에 포함된 상품"에 풀네임으로 나오므로
            여기서 축약된 칩으로 중복 표시하지 않는다.
            "AI가 분석한 내용"임이 한눈에 보이도록 별도 톤(연한 골드)의 콜아웃 박스로 묶고,
            문단 하나로 흘려쓰지 않고 라벨(핵심 요약/확인할 점)로 나눠 문서처럼 정리한다. */}
        <div style={{ marginTop: 14, padding: '14px 15px', borderRadius: 14, background: '#FFF9E8', border: '1px solid #F3E4C0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 'none', color: 'var(--gold-link)', display: 'flex' }}><IconSparkle size={14} /></span>
            <p style={{ fontSize: 11.5, fontWeight: 900, color: 'var(--gold-link)' }}>AI가 분석했어요</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 10.5, fontWeight: 800, color: '#8A7A55' }}>핵심 요약</p>
            <p style={{ fontSize: 13, lineHeight: 1.65, fontWeight: 600, color: 'var(--ink-soft)' }}>{combo.reason}</p>
          </div>
          {combo.caution && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 9, borderTop: '1px solid #F3E4C0' }}>
              <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--danger)' }}>확인할 점</p>
              <p style={{ fontSize: 12.5, lineHeight: 1.6, fontWeight: 700, color: 'var(--danger)' }}>{combo.caution}</p>
            </div>
          )}
        </div>
      </div>

      <SimulationSummaryPanel simulation={simulation} simRows={buildSimRows(simulation)} loading={false} error="" variant="standalone" items={combo.items} />

      <div style={{ padding: '0 22px' }}>
        <button type="button" className="combo-ai-btn press-fx" onClick={handleAiClick} disabled={aiLoading} style={{
          marginTop: 14, height: 46, border: 'none', borderRadius: 13, fontSize: 13.5, fontWeight: 900,
          cursor: aiLoading ? 'default' : 'pointer', color: 'var(--ink)',
        }}>
          {!aiLoading && <IconSparkle size={16} />}
          <span>{aiLoading ? 'AI가 분석하고 있어요…' : aiOpen ? '설명 접기' : 'AI 설명보기'}</span>
        </button>
        {!aiOpen && !aiLoading && (
          <p style={{ marginTop: 6, textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--muted-faint)' }}>
            숨은 장점과 확인할 점까지 짚어드려요
          </p>
        )}

        {aiOpen && (
          <div className="evidence-box">
            {aiLoading && (
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>AI가 더 자세히 분석하고 있어요…</p>
            )}
            {!aiLoading && aiError && (
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>
                불러오지 못했어요: {aiError}{' '}
                <button type="button" className="press-fx" onClick={fetchAiDetail} style={{ border: 'none', background: 'none', color: 'var(--gold-link)', fontWeight: 800, cursor: 'pointer', padding: 0 }}>다시 시도</button>
              </p>
            )}
            {!aiLoading && !aiError && aiDetail && (
              <>
                {aiDetail.fit && (
                  <div className="evidence-row">
                    <span className="evidence-k">왜 맞나요</span>
                    <span className="evidence-v">{aiDetail.fit}</span>
                  </div>
                )}
                {aiDetail.strength && (
                  <div className="evidence-row">
                    <span className="evidence-k">장점</span>
                    <span className="evidence-v">{aiDetail.strength}</span>
                  </div>
                )}
                {aiDetail.caution && (
                  <div className="evidence-row">
                    <span className="evidence-k">확인할 점</span>
                    <span className="evidence-v">{aiDetail.caution}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
