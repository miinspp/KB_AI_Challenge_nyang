"""
FastAPI 추천 서비스 — POST /api/recommend
프론트(RecommendScreen)가 그대로 렌더할 수 있는 products 스키마로 응답한다.

실행:
  pip install -r requirements.txt
  uvicorn app:app --port 8000 --reload
근거 문장 LLM(Haiku)을 켜려면 환경변수 ANTHROPIC_API_KEY 설정.
"""
from __future__ import annotations
import json, os
from datetime import date
from pathlib import Path

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import engine

DATA = Path(__file__).parent / "data" / "reco_pool.json"   # 정책(정제) + KB상품 통합 풀 (build_reco_pool.py 산출)
CACHE = Path(__file__).parent / "data" / "reco_vectors.npy"

app = FastAPI(title="소상공인 추천 서비스")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── 카테고리별 카드 스타일 (products.js 톤과 일치) ──
STYLE = {
    "금융": {"icon": "₩", "iconBg": "#FFF1CC", "iconColor": "#C98A00", "tagBg": "#FFF1CC", "tagColor": "#C98A00"},
    "창업": {"icon": "◆", "iconBg": "#E4EEF9", "iconColor": "#4A79B8", "tagBg": "#E4EEF9", "tagColor": "#4A79B8"},
    "경영": {"icon": "☂", "iconBg": "#FFF0E4", "iconColor": "#D07A3A", "tagBg": "#FFF0E4", "tagColor": "#C06A2A"},
    "기술": {"icon": "⚙", "iconBg": "#EDF5E1", "iconColor": "#7FA95E", "tagBg": "#EDF5E1", "tagColor": "#5E8A3E"},
    "수출": {"icon": "🌐", "iconBg": "#E4EEF9", "iconColor": "#4A79B8", "tagBg": "#E4EEF9", "tagColor": "#4A79B8"},
    "인력": {"icon": "☂", "iconBg": "#FDE8E6", "iconColor": "#D0564C", "tagBg": "#FDE8E6", "tagColor": "#C0463C"},
    "내수": {"icon": "★", "iconBg": "#EDF5E1", "iconColor": "#7FA95E", "tagBg": "#EDF5E1", "tagColor": "#5E8A3E"},
}
DEFAULT_STYLE = {"icon": "◆", "iconBg": "#EFE6D4", "iconColor": "#8A8178", "tagBg": "#F0E7D6", "tagColor": "#8A8178"}


class Profile(BaseModel):
    region: str = "서울"
    biz_age_years: float = 2
    industry: str = ""
    debt_ratio: float = 0.3
    market_risk_level: str = "MEDIUM"   # LOW | MEDIUM | HIGH (시뮬 marketRiskLevel과 통일)
    cash_flow_gap_prob: float = 0.2
    sales_percentile: float = 50
    need_keywords: str = ""
    top_k: int = 6


# ── 앱 시작 시 1회: 정책 로드 + 임베딩 계산(캐시) ──
POLICIES: list = []
DOC_VECS: np.ndarray = None
EMBEDDER: engine.Embedder = None


@app.on_event("startup")
def load():
    global POLICIES, DOC_VECS, EMBEDDER
    POLICIES = json.loads(DATA.read_text(encoding="utf-8"))
    EMBEDDER = engine.Embedder()
    texts = [engine.policy_text(p) for p in POLICIES]
    # bge-m3 캐시 재사용 (TF-IDF는 매번 fit — 어휘가 코퍼스 의존적이라 캐시 안 함)
    if EMBEDDER.mode == "bge-m3" and CACHE.exists():
        DOC_VECS = np.load(CACHE)
        if len(DOC_VECS) != len(texts):
            DOC_VECS = _build(texts)
    else:
        DOC_VECS = _build(texts)
    print(f"[startup] 정책 {len(POLICIES)}건, 임베딩 {EMBEDDER.mode}, shape={DOC_VECS.shape}")


def _build(texts):
    vecs = EMBEDDER.fit_docs(texts)
    if EMBEDDER.mode == "bge-m3":
        np.save(CACHE, vecs)
    return vecs


def days_left(deadline: str | None):
    if not deadline:
        return None
    try:
        return (date.fromisoformat(deadline) - date.today()).days
    except ValueError:
        return None


def to_product(item: dict, reason: str) -> dict:
    """엔진 결과 1건 → RecommendScreen product 스키마"""
    p = item["policy"]
    st = STYLE.get(p.get("category"), DEFAULT_STYLE)
    dleft = days_left(p.get("deadline"))
    amount = p.get("max_amount_manwon")
    spec1 = "·".join(p.get("support_types", [])[:2]) or (p.get("category") or "지원")
    spec2 = (f"최대 {amount:,}만원" if amount else (p.get("subcategory") or "상세 참조"))
    details = [
        {"k": "대상", "v": p.get("target") or "공고문 참조"},
        {"k": "지원분야", "v": f"{p.get('category','')} · {p.get('subcategory','')}".strip(" ·")},
        {"k": "신청기간", "v": p.get("apply_period") or "상세 참조"},
        {"k": "신청방법", "v": (p.get("apply_method") or "공고문 참조")[:60]},
    ]
    return {
        "id": p["id"],
        "name": p["title"],
        "tag": p.get("category") or "지원제도",
        **st,
        "fit": int(round(item["final_score"] * 100)),
        "reason": reason,
        "spec1": spec1,
        "spec2": spec2,
        "deadline": p.get("deadline"),
        "daysLeft": dleft,          # 프론트 D-day 뱃지용
        "isFinance": p.get("is_finance", False),
        "source": p.get("source", "GOV"),   # "KB"(자체상품) | "GOV"(정책·지원제도)
        "link": p.get("url"),
        "details": details,
        # 디버그/발표용 — 왜 추천됐는지 축별 점수
        "_scores": {"rule": item["rule_score"], "embedding": item["emb_sim"],
                    "evidence": item["evidence"]},
    }


def llm_reasons(items, profile: Profile):
    """상위 후보에 대해 Haiku가 추천 근거 문장 생성. 키 없거나 실패 시 규칙 evidence 사용."""
    fallback = {it["policy"]["id"]: (" ".join(it["evidence"]) or "진단 결과와 잘 맞는 지원이에요.")
                for it in items}
    if not os.getenv("ANTHROPIC_API_KEY"):
        return fallback
    try:
        import anthropic
        client = anthropic.Anthropic()
        brief = "\n".join(
            f'- id={it["policy"]["id"]} | {it["policy"]["title"]} | 근거:{"; ".join(it["evidence"]) or "의미유사"}'
            for it in items)
        prompt = (
            f"사용자: {engine.profile_text(profile.dict())}\n\n"
            f"추천 후보:\n{brief}\n\n"
            "각 후보마다 이 사장님에게 왜 맞는지 한 문장(존댓말, 40자 내외)으로 근거를 써주세요. "
            "마감일·금액은 새로 지어내지 마세요. "
            'JSON만 출력: {"id문자열": "근거 문장", ...}')
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=800,
            messages=[{"role": "user", "content": prompt}])
        text = resp.content[0].text.strip()
        text = text[text.find("{"): text.rfind("}") + 1]
        parsed = json.loads(text)
        return {k: parsed.get(k, fallback[k]) for k in fallback}
    except Exception as e:
        print(f"[llm] Haiku 실패 → 규칙 근거 사용 ({e})")
        return fallback


@app.post("/api/recommend")
def recommend(profile: Profile):
    items = engine.recommend(POLICIES, profile.dict(), EMBEDDER, DOC_VECS, top_k=profile.top_k)
    reasons = llm_reasons(items, profile)
    products = [to_product(it, reasons[it["policy"]["id"]]) for it in items]
    return {
        "count": len(products),
        "embedding": EMBEDDER.mode,
        "llm": bool(os.getenv("ANTHROPIC_API_KEY")),
        "products": products,
    }


@app.get("/health")
def health():
    return {"status": "ok", "policies": len(POLICIES),
            "embedding": EMBEDDER.mode if EMBEDDER else None}
