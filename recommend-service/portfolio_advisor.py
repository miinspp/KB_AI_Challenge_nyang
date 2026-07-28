"""
/api/portfolio/analyze — 조합 분석 AI (시뮬레이터 탭 전용)

시뮬레이터가 "성향분석 결과 → 조합 후보 생성(코드) → 후보별 실제 Java 시뮬레이션"까지
이미 끝낸 결과를 받아서, 그중 사용자의 사업 성향에 가장 잘 맞는 Top3를 고르고
왜 그런지 설명하는 것만 한다.

이 파일은 든든이 AI(agent.py)와 완전히 별개다 — 서로 다른 화면, 서로 다른 목적이라
통일할 필요가 없고, agent.py는 이 파일 추가로 전혀 건드리지 않는다.

절대 원칙 (agent.py와 동일한 설계 원칙):
  - 숫자(월여유현금·위험도·상환부담률 등)는 절대 새로 만들지 않는다. candidates 안의
    값만 그대로 인용한다. 계산은 이미 진짜 Java 엔진(SimulationService)이 끝냈다.
  - candidates 목록 밖의 상품·조합을 제안하지 않는다.
  - 반드시 JSON 스키마로만 답한다.

app.py 에 붙이는 법 (2줄):
  import portfolio_advisor
  app.include_router(portfolio_advisor.router)

환경변수
  ANTHROPIC_API_KEY (없으면 규칙 기반 폴백 — 월여유현금 기준 정렬)
  PORTFOLIO_ADVISOR_MODEL (선택, 기본 claude-sonnet-5)
"""
from __future__ import annotations
import json, os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
MODEL = os.getenv("PORTFOLIO_ADVISOR_MODEL", "claude-sonnet-5")


class CandidateMetrics(BaseModel):
    monthlyNetCashManwon: float | None = None
    endingCashManwon: float | None = None
    endingCashP5Manwon: float | None = None
    cashShortageRisk: float | None = None
    maxRepaymentBurdenRatio: float | None = None
    repaymentBurdenPassed: bool | None = None
    totalFundingManwon: float | None = None
    confidence: str | None = None


class CandidateProduct(BaseModel):
    id: str
    name: str
    type: str | None = None


class Candidate(BaseModel):
    comboId: str
    products: list[CandidateProduct]
    metrics: CandidateMetrics


class RiskProfileIn(BaseModel):
    profile: str                      # AGGRESSIVE | BALANCED | CONSERVATIVE
    profileLabel: str | None = None
    totalScore: float | None = None
    # 문항별 원점수(-1~1) — growth/debt/liquidity/innovation/volatility. 같은 등급이라도
    # "대출 부담 회피형"과 "성장 투자형"을 구분하려면 최종 3분류만으론 부족해 함께 받는다.
    answers: dict[str, int] | None = None


class PortfolioAnalyzeRequest(BaseModel):
    riskProfile: RiskProfileIn
    candidates: list[Candidate]


SYSTEM = """너는 소상공인 사장님을 위한 "조합 분석 AI"다. 이미 실제 시뮬레이션 엔진으로
계산이 끝난 상품 조합 후보들 중에서, 사장님의 사업 성향에 가장 잘 맞는 것을 골라
근거를 설명하는 역할만 한다. 숫자를 계산하는 역할이 아니다.

절대 원칙:
- 월여유현금·현금부족위험·상환부담률·조달액 등 숫자는 절대 새로 만들거나 바꾸지 마라.
  후보 목록에 있는 값만 그대로 인용하라.
- 후보 목록에 없는 상품이나 조합을 제안하지 마라.
- 다른 설명 없이 반드시 아래 JSON 스키마로만 답하라.

출력 스키마 (JSON만):
{"combos": [
  {"comboId": "후보의 comboId 값 그대로", "rank": 1,
   "headline": "이 조합을 한 마디로(15자 내외)",
   "reason": "이 성향에 왜 맞는지 2문장 이내(존댓말)",
   "caution": "주의할 점 1문장(존댓말, 없으면 빈 문자열)"}
]}
combos 배열은 candidates 개수가 3개 이상이면 정확히 3개, 미만이면 있는 만큼만 담고,
rank 1이 가장 적합한 조합이다."""


AXIS_LABELS = {
    "growth": "확장 의향", "debt": "추가 대출 의향", "liquidity": "현금 확보 선호",
    "innovation": "신규 투자 성향", "volatility": "매출 변동 감내도",
}


def _profile_line(profile: RiskProfileIn) -> str:
    base = f"사업 성향: {profile.profileLabel or profile.profile}"
    if not profile.answers:
        return base
    axis_bits = []
    for key, label in AXIS_LABELS.items():
        score = profile.answers.get(key)
        if score is None:
            continue
        tone = "적극적" if score > 0 else "신중함" if score < 0 else "중립"
        axis_bits.append(f"{label}:{tone}")
    return f"{base} ({', '.join(axis_bits)})" if axis_bits else base


def _candidate_brief(candidate: Candidate) -> str:
    names = ", ".join(p.name for p in candidate.products) or "(상품 없음)"
    metrics = candidate.metrics
    parts = [f"comboId={candidate.comboId}", f"상품=[{names}]"]
    if metrics.monthlyNetCashManwon is not None:
        parts.append(f"월여유현금={metrics.monthlyNetCashManwon}만원")
    if metrics.cashShortageRisk is not None:
        parts.append(f"현금부족위험={round(metrics.cashShortageRisk * 100, 1)}%")
    if metrics.maxRepaymentBurdenRatio is not None:
        parts.append(f"최대상환부담률={round(metrics.maxRepaymentBurdenRatio * 100, 1)}%")
    if metrics.repaymentBurdenPassed is not None:
        parts.append(f"상환부담기준={'통과' if metrics.repaymentBurdenPassed else '초과'}")
    if metrics.totalFundingManwon is not None:
        parts.append(f"총조달액={metrics.totalFundingManwon}만원")
    if metrics.endingCashP5Manwon is not None:
        parts.append(f"어려운상황가정12개월후현금={metrics.endingCashP5Manwon}만원")
    if metrics.confidence:
        parts.append(f"추정신뢰도={metrics.confidence}")
    return " · ".join(parts)


# 성향별로 "여유현금 vs 안정성"을 얼마나 다르게 볼지 — 세 축의 가중치 합은 항상 1이다.
_FALLBACK_WEIGHTS = {
    "CONSERVATIVE": {"cash": 0.25, "risk": 0.55, "burden": 0.20},
    "BALANCED": {"cash": 0.40, "risk": 0.35, "burden": 0.25},
    "AGGRESSIVE": {"cash": 0.60, "risk": 0.20, "burden": 0.20},
}


def _fallback_score(candidate: Candidate, profile_type: str) -> float:
    weights = _FALLBACK_WEIGHTS.get(profile_type, _FALLBACK_WEIGHTS["BALANCED"])
    metrics = candidate.metrics
    cash = metrics.monthlyNetCashManwon if metrics.monthlyNetCashManwon is not None else 0.0
    risk = (metrics.cashShortageRisk or 0.0) * 100
    burden = (metrics.maxRepaymentBurdenRatio or 0.0) * 100
    return weights["cash"] * cash - weights["risk"] * risk - weights["burden"] * burden


def _fallback(req: PortfolioAnalyzeRequest) -> dict:
    """LLM 미가동/실패 시 — 제약 위반 후보는 제외하고, 성향별 가중치(여유현금·현금부족위험·
    상환부담)로 정렬해 최소 동작을 보장한다. 상위 App.jsx에서 이미 제약 위반 후보를 걸러
    보내지만, 이 함수만 독립 호출될 가능성에 대비해 여기서도 한 번 더 제외한다."""
    eligible = [c for c in req.candidates if c.metrics.repaymentBurdenPassed is not False]
    ranked = sorted(eligible, key=lambda c: _fallback_score(c, req.riskProfile.profile), reverse=True)[:3]
    combos = []
    for i, candidate in enumerate(ranked):
        combos.append({
            "comboId": candidate.comboId,
            "rank": i + 1,
            "headline": "월 여유현금 우선 조합" if i == 0 else f"{i + 1}순위 조합",
            "reason": "월 여유현금·현금부족위험·상환부담을 성향에 맞게 종합해 계산된 결과예요.",
            "caution": "" if candidate.metrics.repaymentBurdenPassed else "상환 부담이 기준보다 높아요.",
        })
    return {"combos": combos}


def _validate_and_fill(parsed_combos: list, req: PortfolioAnalyzeRequest) -> list[dict]:
    """LLM 출력 검증 — 존재하지 않는 comboId·중복·필수 문구 누락을 걸러내고,
    rank는 신뢰하지 않고 결과 순서대로 다시 매긴다. 유효한 개수가 부족하면
    규칙 기반 폴백으로 나머지 자리를 채운다(3개 미만으로 화면에 나가지 않도록)."""
    valid_ids = {c.comboId for c in req.candidates}
    seen: set[str] = set()
    cleaned: list[dict] = []
    for item in parsed_combos:
        combo_id = item.get("comboId")
        headline = (item.get("headline") or "").strip()
        reason = (item.get("reason") or "").strip()
        if combo_id not in valid_ids or combo_id in seen or not headline or not reason:
            continue
        seen.add(combo_id)
        cleaned.append({
            "comboId": combo_id, "rank": len(cleaned) + 1,
            "headline": headline, "reason": reason,
            "caution": (item.get("caution") or "").strip(),
        })
        if len(cleaned) == 3:
            break

    target = min(3, len(req.candidates))
    if len(cleaned) < target:
        for combo in _fallback(req)["combos"]:
            if combo["comboId"] in seen:
                continue
            combo["rank"] = len(cleaned) + 1
            cleaned.append(combo)
            seen.add(combo["comboId"])
            if len(cleaned) == target:
                break
    return cleaned


@router.post("/api/portfolio/analyze")
def analyze_portfolio(req: PortfolioAnalyzeRequest):
    if not req.candidates:
        return {"combos": []}
    if not os.getenv("ANTHROPIC_API_KEY"):
        return _fallback(req)

    try:
        import anthropic
        client = anthropic.Anthropic()
        brief = "\n".join(f"- {_candidate_brief(c)}" for c in req.candidates)
        prompt = f"{_profile_line(req.riskProfile)}\n\n조합 후보:\n{brief}\n\n위 후보 중 이 성향에 가장 맞는 조합을 골라 JSON으로 답해줘."
        # 조합 3개 × (2문장 근거 + 주의사항)을 다 담기엔 1000토큰이 부족해 중간에 잘려
        # JSON 파싱이 깨지는 경우가 있었다(잘리면 예외로 규칙 폴백行). 여유 있게 잡는다.
        resp = client.messages.create(
            model=MODEL, max_tokens=2000, system=SYSTEM,
            messages=[{"role": "user", "content": prompt}])
        text = "".join(block.text for block in resp.content if block.type == "text").strip()
        text = text[text.find("{"): text.rfind("}") + 1]
        parsed = json.loads(text)
        combos = _validate_and_fill(parsed.get("combos", []), req)
        if combos:
            return {"combos": combos}
    except Exception as e:
        print(f"[portfolio_advisor] Sonnet 실패 → 규칙 폴백 ({e})")

    return _fallback(req)


DETAIL_SYSTEM = """너는 소상공인 사장님을 위한 "조합 분석 AI"다. 이번엔 이미 Top3에 뽑힌 조합
하나를 더 자세히 설명하는 역할이다. 숫자를 계산하지 않는다 — 아래 주어진 숫자만 인용한다.

절대 원칙:
- 월여유현금·현금부족위험·상환부담률·조달액 등 숫자는 절대 새로 만들거나 바꾸지 마라.
- 주어진 조합·상품 밖의 것을 언급하지 마라.
- 각 항목은 1~2문장, 알아듣기 쉬운 짧은 존댓말로 쓴다. 이모지·마크다운은 쓰지 않는다.
- 다른 설명 없이 반드시 아래 JSON 스키마로만 답한다.

출력 스키마 (JSON만):
{"fit": "이 조합이 사장님의 사업 성향에 왜 맞는지(성향 축을 구체적으로 언급)",
 "strength": "숫자로 뒷받침되는 장점 — 이미 나온 요약보다 한 걸음 더 들어간 설명",
 "caution": "주의할 점이나 실행 전 확인할 것(없으면 빈 문자열)"}"""


class DetailRequest(BaseModel):
    riskProfile: RiskProfileIn
    candidate: Candidate
    headline: str
    reason: str
    caution: str | None = None


def _detail_fallback(req: "DetailRequest") -> dict:
    return {"fit": req.reason or "선택한 조합의 요약 설명이에요.", "strength": "", "caution": req.caution or ""}


@router.post("/api/portfolio/detail")
def analyze_detail(req: DetailRequest):
    if not os.getenv("ANTHROPIC_API_KEY"):
        return _detail_fallback(req)

    try:
        import anthropic
        client = anthropic.Anthropic()
        brief = _candidate_brief(req.candidate)
        prompt = (
            f"{_profile_line(req.riskProfile)}\n\n"
            f"이미 Top3로 뽑힌 조합: {brief}\n"
            f"짧은 요약 — 제목: \"{req.headline}\" / 근거: \"{req.reason}\""
            + (f" / 주의: \"{req.caution}\"" if req.caution else "")
            + "\n\n이 조합을 사장님께 더 자세히 설명해줘."
        )
        resp = client.messages.create(
            model=MODEL, max_tokens=700, system=DETAIL_SYSTEM,
            messages=[{"role": "user", "content": prompt}])
        text = "".join(block.text for block in resp.content if block.type == "text").strip()
        text = text[text.find("{"): text.rfind("}") + 1]
        parsed = json.loads(text)
        fit = (parsed.get("fit") or "").strip()
        strength = (parsed.get("strength") or "").strip()
        if fit or strength:
            return {"fit": fit or req.reason, "strength": strength, "caution": (parsed.get("caution") or "").strip()}
    except Exception as e:
        print(f"[portfolio_advisor] 상세 분석 실패 → 요약 재사용 ({e})")

    return _detail_fallback(req)


@router.get("/api/portfolio/health")
def health():
    return {"status": "ok", "llm": bool(os.getenv("ANTHROPIC_API_KEY")), "model": MODEL}
