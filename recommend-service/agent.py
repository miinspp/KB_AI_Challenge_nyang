"""
/api/agent — 소상공인 재무 파트너 오케스트레이터 (agentic)

진단 → 추천 → 시뮬레이션 → 포트폴리오를, 사람이 버튼을 누르는 대신
**LLM이 스스로 판단해서** 흐르게 한다. 기존 기능을 4개의 도구(tool)로 감싸고,
function calling 루프로 자율 실행한다. 상환부담이 기준을 넘으면 스스로
조건을 바꿔 재추천·재시뮬하는 "자율 재시도"가 핵심 차별점.

설계 원칙
  - 사실(원리금·현금흐름·DSR)은 도구(코드)가 계산하고, LLM은 "다음에 뭘 할지"만 판단 → 환각 방지
  - 최종 포트폴리오는 코드로 DSR 30% 제약을 재검증 (결정론적 안전장치)
  - 모든 도구 호출을 trace 로 남겨 "왜 이 결론인지" 설명 자료(XAI)로 사용

app.py 에 붙이는 법 (3줄):
  import agent
  app.include_router(agent.router)                     # 라우터 등록
  # startup 끝에:  agent.configure(POLICIES, EMBEDDER, DOC_VECS)

환경변수
  ANTHROPIC_API_KEY (필수), AGENT_MODEL (선택, 기본 haiku — 판단 품질 위해 Sonnet 권장),
  SPRING_BASE (선택, 진단 API 주소. 없거나 실패 시 내부 근사 진단으로 폴백)
"""
from __future__ import annotations
import os, json
from dataclasses import dataclass, field

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import engine  # 로컬 추천 엔진 재사용 (하드필터·규칙·임베딩)

MODEL = os.getenv("AGENT_MODEL", "claude-haiku-4-5-20251001")  # 권장: claude-sonnet-*
SPRING_BASE = os.getenv("SPRING_BASE", "http://localhost:8080")
MAX_TURNS = 8
DSR_LIMIT = 0.30  # 월 상환합 / 월매출 상한

router = APIRouter()

# ── 엔진 컨텍스트 주입 (app.py startup 에서 configure 로 전달) ──
_CTX = {"policies": None, "embedder": None, "doc_vectors": None}
def configure(policies, embedder, doc_vectors):
    _CTX["policies"] = policies
    _CTX["embedder"] = embedder
    _CTX["doc_vectors"] = doc_vectors


# ══════════════════════════════════════════════════════════════════
# 금융 계산 (결정론적) — 도구가 쓰는 사실 계산부. LLM은 이 숫자를 지어내지 않는다.
# ══════════════════════════════════════════════════════════════════
def amortized_payment(principal_won: float, annual_rate: float, months: int) -> float:
    """원리금균등 월 상환액."""
    if months <= 0:
        return 0.0
    r = annual_rate / 12
    if r == 0:
        return principal_won / months
    return principal_won * r * (1 + r) ** months / ((1 + r) ** months - 1)


# 상품 재원별 금리·기간 가정치 (⚠️ 데모 가정 수치 — 실제 약관으로 교체 필요)
def assume_terms(source: str, is_finance: bool) -> dict:
    if source == "KB":
        return {"annual_rate": 0.048, "term_months": 60, "grace_months": 0}
    if is_finance:  # 정책 융자·보증
        return {"annual_rate": 0.029, "term_months": 60, "grace_months": 12}
    return {"annual_rate": 0.0, "term_months": 0, "grace_months": 0}  # 무상지원 등


def simulate(items: list[dict], fin: dict) -> dict:
    """선택 상품들의 월 상환·현금흐름·상환부담을 계산. items: [{amount_won, annual_rate, term, grace}]"""
    total_repay = 0.0
    total_funding = 0.0
    for it in items:
        amt = it.get("amount_won", 0)
        if amt <= 0:
            continue
        total_funding += amt
        # 거치기간에는 이자만, 이후 원리금균등
        if it["grace"] > 0:
            monthly = amt * it["annual_rate"] / 12
        else:
            monthly = amortized_payment(amt, it["annual_rate"], it["term"])
        total_repay += monthly

    sales = fin["monthly_sales"]
    fixed = fin.get("fixed_cost", sales * 0.7)
    existing = fin.get("existing_monthly_payment", 0)
    net_cash = sales - fixed - existing - total_repay
    dsr = (existing + total_repay) / sales if sales > 0 else 1.0
    # 아주 단순한 현금부족 근사: 순현금이 안전버퍼(고정비 1개월)보다 낮을수록 위험↑
    buffer = fixed
    shortfall_prob = max(0.0, min(1.0, (buffer - (fin.get("current_cash", 0) + net_cash * 6)) / (buffer + 1)))
    return {
        "total_funding_won": round(total_funding),
        "monthly_repayment_won": round(total_repay),
        "monthly_net_cashflow_won": round(net_cash),
        "repayment_burden_ratio": round(dsr, 3),
        "repayment_burden_passed": dsr <= DSR_LIMIT,
        "cash_shortage_probability": round(shortfall_prob, 3),
    }


# ══════════════════════════════════════════════════════════════════
# 도구 정의 (Anthropic tool schema)
# ══════════════════════════════════════════════════════════════════
TOOLS = [
    {
        "name": "get_diagnosis",
        "description": "사장님 입력으로 진단(상권 속 매출 위치·비용효율 등)을 산출한다. 가장 먼저 한 번 호출한다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "industryCode": {"type": "string"},
                "monthlySales": {"type": "number", "description": "월 매출(원)"},
                "monthlyExpense": {"type": "number", "description": "월 지출(원)"},
                "areaType": {"type": "string"},
            },
            "required": ["industryCode", "monthlySales", "monthlyExpense"],
        },
    },
    {
        "name": "recommend_policies",
        "description": "진단 신호로 소상공인 정책·KB금융상품을 추천한다. 조건이 안 맞으면 need_keywords나 신호를 바꿔 다시 호출할 수 있다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "region": {"type": "string", "default": "서울"},
                "industry": {"type": "string"},
                "debt_ratio": {"type": "number"},
                "market_risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
                "cash_flow_gap_prob": {"type": "number"},
                "sales_percentile": {"type": "number"},
                "biz_age_years": {"type": "number"},
                "need_keywords": {"type": "string"},
            },
            "required": ["industry", "debt_ratio", "market_risk_level", "cash_flow_gap_prob", "sales_percentile"],
        },
    },
    {
        "name": "run_simulation",
        "description": "추천받은 상품 id들을 담았을 때 월 상환·현금흐름·상환부담률을 계산한다. repayment_burden_passed 가 false 면 조건을 바꿔 재추천/재시뮬하라.",
        "input_schema": {
            "type": "object",
            "properties": {
                "product_ids": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["product_ids"],
        },
    },
    {
        "name": "optimize_portfolio",
        "description": "추천 후보(금융상품) 중 상환부담 30% 이하를 만족하는 최적 조합을 코드로 탐색한다. 최종 제안 직전에 호출한다.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


# ══════════════════════════════════════════════════════════════════
# 도구 실행기 — ctx(RunState)에 진단·추천·재무를 누적
# ══════════════════════════════════════════════════════════════════
@dataclass
class RunState:
    financials: dict                       # 사용자 재무 입력
    rank: dict | None = None
    recommended: list = field(default_factory=list)  # 추천 상품(+가정 금융조건 부착)
    trace: list = field(default_factory=list)


def _mock_rank(sales, expense):
    """Spring 진단 미가동 시 폴백 — 마진 기반 근사."""
    margin = max(-0.5, (sales - expense) / sales) if sales else 0
    top = max(5.0, min(95.0, 60 - margin * 120))
    return {"topPercent": round(top, 1), "sales": {"topPercent": round(top, 1)},
            "margin": {"value": round(margin, 3)}, "profit": {"value": sales - expense}, "_source": "mock"}


def tool_get_diagnosis(args, ctx: RunState):
    payload = {"industryCode": args["industryCode"], "monthlySales": args["monthlySales"],
               "monthlyExpense": args["monthlyExpense"], "areaType": args.get("areaType")}
    try:
        r = httpx.post(f"{SPRING_BASE}/api/rank", json=payload, timeout=8)
        rank = r.json() if r.status_code == 200 else _mock_rank(args["monthlySales"], args["monthlyExpense"])
    except Exception:
        rank = _mock_rank(args["monthlySales"], args["monthlyExpense"])
    ctx.rank = rank
    return {
        "topPercent": rank.get("topPercent"),
        "sales_top_percent": rank.get("sales", {}).get("topPercent"),
        "margin": rank.get("margin", {}).get("value"),
        "monthly_profit": rank.get("profit", {}).get("value"),
        "source": rank.get("_source", "api"),
    }


def tool_recommend(args, ctx: RunState):
    profile = {
        "region": args.get("region", "서울"),
        "industry": args.get("industry", ""),
        "biz_age_years": args.get("biz_age_years", 2),
        "debt_ratio": args["debt_ratio"],
        "market_risk_level": args["market_risk_level"],
        "cash_flow_gap_prob": args["cash_flow_gap_prob"],
        "sales_percentile": args["sales_percentile"],
        "need_keywords": args.get("need_keywords", ""),
        "top_k": 8,
    }
    items = engine.recommend(_CTX["policies"], profile, _CTX["embedder"], _CTX["doc_vectors"], top_k=8)
    out = []
    ctx.recommended = []
    for it in items:
        p = it["policy"]
        terms = assume_terms(p.get("source", "GOV"), p.get("is_finance", False))
        amount_won = (p.get("max_amount_manwon") or 3000) * 10000
        rec = {"id": p["id"], "name": p["title"], "source": p.get("source", "GOV"),
               "is_finance": p.get("is_finance", False), "fit": round(it["final_score"] * 100),
               "amount_won": amount_won, **terms}
        ctx.recommended.append(rec)
        out.append({k: rec[k] for k in ("id", "name", "source", "is_finance", "fit")})
    return {"count": len(out), "products": out}


def _resolve(ids, ctx):
    by_id = {r["id"]: r for r in ctx.recommended}
    return [{"amount_won": by_id[i]["amount_won"], "annual_rate": by_id[i]["annual_rate"],
             "term": by_id[i]["term_months"], "grace": by_id[i]["grace_months"]}
            for i in ids if i in by_id]


def tool_run_simulation(args, ctx: RunState):
    items = _resolve(args["product_ids"], ctx)
    return simulate(items, ctx.financials)


def tool_optimize_portfolio(args, ctx: RunState):
    from itertools import combinations
    fin_cands = [r for r in ctx.recommended if r["is_finance"]][:6]  # 금융상품만, 조합 폭 제한
    best = None
    for k in range(1, len(fin_cands) + 1):
        for combo in combinations(fin_cands, k):
            sim = simulate([{"amount_won": c["amount_won"], "annual_rate": c["annual_rate"],
                             "term": c["term_months"], "grace": c["grace_months"]} for c in combo], ctx.financials)
            if not sim["repayment_burden_passed"]:
                continue
            score = sim["total_funding_won"] - sim["cash_shortage_probability"] * 1e8  # 조달↑·부족확률↓
            if best is None or score > best["score"]:
                best = {"score": score, "ids": [c["id"] for c in combo],
                        "names": [c["name"] for c in combo], "sim": sim}
    if best is None:
        return {"feasible": False, "reason": "DSR 30% 이하를 만족하는 조합이 없어요. 거치식·저금리 정책자금으로 재추천 필요."}
    return {"feasible": True, "combo": best["names"], "product_ids": best["ids"], "metrics": best["sim"]}


DISPATCH = {
    "get_diagnosis": tool_get_diagnosis,
    "recommend_policies": tool_recommend,
    "run_simulation": tool_run_simulation,
    "optimize_portfolio": tool_optimize_portfolio,
}

SYSTEM = f"""너는 소상공인 사장님의 재무 파트너 에이전트 '든든이'다.
사장님 상황을 받아, 주어진 도구를 스스로 호출해 최종 금융 포트폴리오를 제안하라.

절차:
1) get_diagnosis 로 진단한다.
2) 진단 신호로 recommend_policies 를 호출한다.
   - debt_ratio, market_risk_level(LOW/MEDIUM/HIGH), cash_flow_gap_prob, sales_percentile 을 진단에서 추론해 넣어라.
3) 유망 상품을 run_simulation 으로 검증한다.
4) optimize_portfolio 로 최적 조합을 찾는다.

자율 재시도 규칙(중요):
- run_simulation 의 repayment_burden_passed 가 false 이거나 optimize_portfolio 가 feasible=false 면,
  need_keywords 를 '거치, 저금리, 정책자금'으로 바꾸거나 신호를 조정해 recommend_policies 를 다시 호출하고, 다시 시뮬레이션하라.
- 통과하는 조합을 찾으면 멈추고, 최종 제안을 한국어로 요약하라.

원칙:
- 상환액·확률·금액 등 숫자는 절대 지어내지 마라. 반드시 도구 결과만 인용하라.
- 최대 {MAX_TURNS}턴 안에 끝내라. 반복이 안 풀리면 현재까지 최선안을 제시하라.
- 상품 효과(금리·기간)는 데모 가정치임을 최종 답에 한 줄로 밝혀라."""


# ══════════════════════════════════════════════════════════════════
# Agent 루프
# ══════════════════════════════════════════════════════════════════
class AgentRequest(BaseModel):
    industryCode: str
    industry: str = ""
    monthlySales: float          # 원
    monthlyExpense: float        # 원
    currentCash: float = 0        # 원
    existingMonthlyPayment: float = 0  # 원
    areaType: str | None = None


def run_agent_events(req: AgentRequest):
    """
    도구 호출 한 번마다 이벤트를 yield 하는 제너레이터 — 실시간 스트리밍(SSE)의 기반.
    이벤트 종류: thinking(도구 호출 전 모델의 중간 판단 텍스트) · tool_start(호출 시작)
              · tool_result(호출 완료+결과) · final(최종 제안) · error
    마지막은 항상 final 이벤트로 끝난다(정상 종료·최대턴 도달 모두 포함).
    """
    import anthropic
    client = anthropic.Anthropic()
    ctx = RunState(financials={
        "monthly_sales": req.monthlySales,
        "fixed_cost": req.monthlyExpense,
        "current_cash": req.currentCash,
        "existing_monthly_payment": req.existingMonthlyPayment,
    })
    user = (f"업종코드 {req.industryCode}({req.industry}), 월매출 {req.monthlySales:,.0f}원, "
            f"월지출 {req.monthlyExpense:,.0f}원, 보유현금 {req.currentCash:,.0f}원, "
            f"기존 월상환 {req.existingMonthlyPayment:,.0f}원. 이 사장님에게 맞는 금융 포트폴리오를 제안해줘.")
    messages = [{"role": "user", "content": user}]

    for _ in range(MAX_TURNS):
        resp = client.messages.create(model=MODEL, max_tokens=1500, system=SYSTEM, tools=TOOLS, messages=messages)
        messages.append({"role": "assistant", "content": resp.content})
        text = "".join(b.text for b in resp.content if b.type == "text").strip()

        if resp.stop_reason != "tool_use":
            yield {"type": "final", "final": text or "포트폴리오 제안을 완료했어요.", "trace": ctx.trace, "rank": ctx.rank}
            return

        if text:
            yield {"type": "thinking", "text": text}

        results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            yield {"type": "tool_start", "tool": block.name, "input": block.input}
            try:
                out = DISPATCH[block.name](block.input, ctx)
            except Exception as e:
                out = {"error": str(e)}
            ctx.trace.append({"tool": block.name, "input": block.input, "output": out})
            yield {"type": "tool_result", "tool": block.name, "input": block.input, "output": out}
            results.append({"type": "tool_result", "tool_use_id": block.id,
                            "content": json.dumps(out, ensure_ascii=False)})
        messages.append({"role": "user", "content": results})

    yield {"type": "final", "final": "최대 시도 횟수에 도달했어요. 현재까지의 판단을 참고하세요.",
           "trace": ctx.trace, "rank": ctx.rank}


def run_agent(req: AgentRequest) -> dict:
    """기존 비-스트리밍 방식(하위 호환) — 제너레이터를 끝까지 돌려 final 이벤트만 반환."""
    final_event = None
    for ev in run_agent_events(req):
        if ev["type"] == "final":
            final_event = ev
    return final_event or {"final": "응답을 받지 못했어요.", "trace": [], "rank": None}


def _unconfigured_error() -> str | None:
    if _CTX["policies"] is None:
        return "엔진 미초기화 — app startup 에서 agent.configure(...) 를 호출하세요."
    if not os.getenv("ANTHROPIC_API_KEY"):
        return "ANTHROPIC_API_KEY 가 필요합니다."
    return None


@router.post("/api/agent")
def agent_endpoint(req: AgentRequest):
    err = _unconfigured_error()
    if err:
        return {"error": err}
    return run_agent(req)


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/api/agent/stream")
def agent_stream_endpoint(req: AgentRequest):
    """
    /api/agent 와 동일한 에이전트 루프를 SSE(text/event-stream)로 실시간 전달한다.
    프론트는 도구 호출마다 즉시 이벤트를 받아 '지금 이 도구를 쓰고 있어요' 를 그려낼 수 있다.
    """
    err = _unconfigured_error()
    if err:
        def error_gen():
            yield _sse({"type": "error", "message": err})
        return StreamingResponse(error_gen(), media_type="text/event-stream")

    def gen():
        try:
            for ev in run_agent_events(req):
                yield _sse(ev)
        except Exception as e:
            yield _sse({"type": "error", "message": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })
