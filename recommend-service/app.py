"""
FastAPI 추천 서비스 — POST /api/recommend
프론트(RecommendScreen)가 그대로 렌더할 수 있는 products 스키마로 응답한다.

실행:
  pip install -r requirements.txt
  uvicorn app:app --port 8000 --reload

이 엔드포인트는 LLM을 호출하지 않는다 — 랭킹은 로컬 임베딩 모델 + 규칙,
3줄 요약은 배치에서 미리 구운 값이다(docs/MODELS.md).
같은 서비스의 /api/portfolio 는 별개로 ANTHROPIC_API_KEY 를 쓴다.
"""
from __future__ import annotations
import json
import os
from datetime import date
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# portfolio_advisor import happens after dotenv loading because it reads model settings at import time.
# Prefer project-root settings while retaining the service-local file for local development.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env")

import engine
import portfolio_advisor  # 조합 분석 AI (/api/portfolio/analyze) — 시뮬레이터 전용

DATA = Path(__file__).parent / "data" / "reco_pool.json"   # 정책(정제) + KB상품 통합 풀 (build_reco_pool.py 산출)
CACHE = Path(__file__).parent / "data" / "reco_vectors.npy"

app = FastAPI(title="소상공인 추천 서비스")
# CORS_ALLOWED_ORIGINS(쉼표 구분)로 배포 도메인만 허용. 미설정 시 로컬 개발 기본값(전체 허용).
_cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]
app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["*"], allow_headers=["*"])
app.include_router(portfolio_advisor.router)  # POST /api/portfolio/analyze

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


# 상품 재원별 금리·기간 가정치 (⚠️ 데모 가정 수치 — 실제 약관으로 교체 필요)
# 시뮬레이터(Java 엔진)가 쓰는 annualRate/termMonths/graceMonths 는 여기서 나온다.
def assume_terms(source: str, is_finance: bool) -> dict:
    if source == "KB":
        return {"annual_rate": 0.048, "term_months": 60, "grace_months": 0}
    if is_finance:  # 정책 융자·보증
        return {"annual_rate": 0.029, "term_months": 60, "grace_months": 12}
    return {"annual_rate": 0.0, "term_months": 0, "grace_months": 0}  # 무상지원 등


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
    # 신경망 임베딩만 캐시한다(TF-IDF는 어휘가 코퍼스 의존적이라 매번 fit).
    # 캐시는 모델별로 파일을 나눠 둔다 — 모델을 바꾸면 임베딩 공간이 달라져
    # 예전 벡터를 그대로 쓰면 유사도가 조용히 망가진다.
    cache = _cache_path(EMBEDDER.mode)
    if cache and cache.exists():
        DOC_VECS = np.load(cache)
        if len(DOC_VECS) != len(texts):  # 풀이 바뀌었으면 재계산
            DOC_VECS = _build(texts)
    else:
        DOC_VECS = _build(texts)
    print(f"[startup] 정책 {len(POLICIES)}건, 임베딩 {EMBEDDER.mode}, shape={DOC_VECS.shape}")


def _cache_path(mode: str):
    """모델별 벡터 캐시 경로. TF-IDF 는 캐시하지 않으므로 None."""
    return None if mode == "tfidf" else CACHE.with_name(f"reco_vectors.{mode}.npy")


def _build(texts):
    vecs = EMBEDDER.fit_docs(texts)
    cache = _cache_path(EMBEDDER.mode)
    if cache:
        np.save(cache, vecs)
    return vecs


def days_left(deadline: str | None):
    if not deadline:
        return None
    try:
        return (date.fromisoformat(deadline) - date.today()).days
    except ValueError:
        return None


def to_product(item: dict) -> dict:
    """엔진 결과 1건 → RecommendScreen/시뮬레이터 공용 product 스키마"""
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
    # 파인튜닝 KoBART 3줄 요약(summarize_pool.py 산출). "지원:/대상:/신청:" 형식 검증을
    # 통과한 정책만 값이 있고, 실패분은 빈 문자열이라 프론트가 알아서 감춘다.
    summary_short = p.get("summary_short") or ""
    title = p["title"]
    is_finance = p.get("is_finance", False)
    source = p.get("source", "GOV")   # "KB"(자체상품) | "GOV"(정책·지원제도)
    terms = assume_terms(source, is_finance)  # 시뮬레이터(Java 엔진) 연동용 가정 금리·기간 — 데모 가정치
    return {
        "id": p["id"],
        "name": title,
        "short": title if len(title) <= 13 else title[:12] + "…",  # 시뮬레이터 장착 슬롯용 축약 이름
        "tag": p.get("category") or "지원제도",
        # 프론트 대출/적금/보험/정부지원 탭 분류용 — category(tag)만으로는 "금융" 안에 대출·적금·
        # 컨설팅이 섞여 있어 구분이 안 된다(예: is_finance=True인데 컨설팅·창업지원인 항목이 있음).
        # subcategory(예: "일반·소상공인 대출", "사업자 적금·예비자금")를 같이 내려줘야 정확히 나뉜다.
        "subcategory": p.get("subcategory") or "",
        **st,
        "fit": int(round(item["final_score"] * 100)),
        # reason(상품별 한 줄 근거)은 내보내지 않는다 — 규칙 evidence 는 사장님 재무상황
        # 설명이라 상품마다 같아서, 목록 헤더의 signals 로 한 번만 보여준다.
        # 규칙기반 폴백(products.js)에는 상품별 reason 이 있어 프론트가 있을 때만 렌더한다.
        "summaryShort": summary_short,
        "spec1": spec1,
        "spec2": spec2,
        "deadline": p.get("deadline"),
        "daysLeft": dleft,          # 프론트 D-day 뱃지용
        "isFinance": is_finance,
        "source": source,
        "link": p.get("url"),
        "details": details,
        # 시뮬레이터(Java 엔진) selectedItems 구성용 — 실제 약관 아님, 데모 가정치
        "maxAmountManwon": amount,
        "annualRate": terms["annual_rate"],
        "termMonths": terms["term_months"],
        "graceMonths": terms["grace_months"],
        # 디버그/발표용 — 왜 추천됐는지 축별 점수
        "_scores": {"rule": item["rule_score"], "embedding": item["emb_sim"],
                    "evidence": item["evidence"]},
    }


def profile_signals(items) -> list[str]:
    """규칙 엔진이 쌓은 근거를 목록 단위로 합친다.

    evidence 는 '이 상품이 왜 좋은지'가 아니라 '사장님 재무상황이 어떤지'라서
    상품마다 같은 문장이 반복된다(78건 중 31건이 동일). 카드마다 되풀이하는 대신
    목록 상단에 한 번만 노출하려고 순서를 지켜 중복만 제거한다.
    """
    seen, signals = set(), []
    for it in items:
        for e in it["evidence"]:
            if e not in seen:
                seen.add(e)
                signals.append(e)
    return signals


@app.post("/api/recommend")
def recommend(profile: Profile):
    items = engine.recommend(POLICIES, profile.dict(), EMBEDDER, DOC_VECS, top_k=profile.top_k)
    return {
        "count": len(items),
        "embedding": EMBEDDER.mode,          # 랭킹에 쓰인 임베딩(파인튜닝 모델명 또는 폴백)
        "signals": profile_signals(items),   # 목록 헤더용 — 진단 신호 요약
        "products": [to_product(it) for it in items],
    }


@app.get("/health")
def health():
    return {"status": "ok", "policies": len(POLICIES),
            "embedding": EMBEDDER.mode if EMBEDDER else None}
