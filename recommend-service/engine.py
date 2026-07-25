"""
추천 엔진 (기능② 맞춤 정책·금융상품 추천)
  A. 하드필터  : 마감/지역/업력 → 후보 제외
  B. 규칙 점수 : 대출·상권·현금흐름·매출·위험성향 종합 (0~1, 근거 evidence 축적)
  C. 임베딩    : bge-m3 코사인 유사도 (없으면 TF-IDF 폴백)
  최종 = W_RULE·규칙 + W_EMB·임베딩
"""
from __future__ import annotations
import numpy as np

W_RULE, W_EMB = 0.55, 0.45
TH_DEBT, TH_CASH_GAP = 0.4, 0.3
# 상권위험은 등급(LOW/MEDIUM/HIGH)으로 통일 — 시뮬레이션 marketRiskLevel과 동일 표기


# ── A. 하드필터 ──────────────────────────────────────────────
def passes_hard_filter(policy: dict, profile: dict) -> bool:
    if not policy.get("is_open", True):
        return False
    if policy.get("region") not in (profile["region"], "전국"):
        return False
    max_age = policy.get("max_biz_age")
    if max_age is not None and profile["biz_age_years"] > max_age:
        return False
    return True


# ── B. 규칙 점수 ─────────────────────────────────────────────
def rule_score(policy: dict, profile: dict):
    stypes = set(policy.get("support_types", []))
    evidence, hits, total = [], 0.0, 0

    total += 1  # 1) 부채비율 높음 → 융자/보증
    if profile["debt_ratio"] >= TH_DEBT and (stypes & {"융자", "보증"}):
        hits += 1
        evidence.append(f"부채비율 {profile['debt_ratio']*100:.0f}%로 높아 융자·보증 상품이 적합해요")
    elif profile["debt_ratio"] < TH_DEBT and ("융자" in stypes):
        hits += 0.3

    total += 1  # 2) 상권위험 HIGH → 컨설팅/보조금/판로
    if profile.get("market_risk_level") == "HIGH" and (stypes & {"컨설팅", "보조금", "판로"}):
        hits += 1
        evidence.append("상권 침체 위험이 높아 컨설팅·판로 지원이 도움이 돼요")

    total += 1  # 3) 현금흐름 부족확률 높음 → 금융
    if profile["cash_flow_gap_prob"] >= TH_CASH_GAP and policy.get("is_finance"):
        hits += 1
        evidence.append(f"현금부족 확률 {profile['cash_flow_gap_prob']*100:.0f}%로 운영자금 지원이 시급해요")

    total += 1  # 4) 매출 우수 → 우대형 정책자금
    if profile["sales_percentile"] <= 30 and "융자" in stypes:
        hits += 1
        evidence.append(f"매출 상위 {profile['sales_percentile']}%로 우대 정책자금 대상이 될 수 있어요")

    return (hits / total if total else 0.0), evidence


# ── C. 임베딩 (bge-m3 우선, 실패 시 TF-IDF 폴백) ──────────────
class Embedder:
    def __init__(self):
        self.mode = None
        self.model = None
        self.vectorizer = None
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer("BAAI/bge-m3")
            self.mode = "bge-m3"
        except Exception as e:  # 모델 다운로드 불가/오프라인 → TF-IDF
            print(f"[embedder] bge-m3 사용 불가 → TF-IDF 폴백 ({e})")
            from sklearn.feature_extraction.text import TfidfVectorizer
            self.vectorizer = TfidfVectorizer(max_features=4096)
            self.mode = "tfidf"

    def fit_docs(self, texts):
        if self.mode == "bge-m3":
            return self.model.encode(texts, normalize_embeddings=True)
        mat = self.vectorizer.fit_transform(texts).toarray()
        return _l2(mat)

    def encode_query(self, text):
        if self.mode == "bge-m3":
            return self.model.encode([text], normalize_embeddings=True)[0]
        vec = self.vectorizer.transform([text]).toarray()[0]
        return _l2(vec[None, :])[0]


def _l2(mat):
    n = np.linalg.norm(mat, axis=1, keepdims=True)
    return mat / (n + 1e-9)


def policy_text(p: dict) -> str:
    return f"{p['title']} {p.get('summary','')} {p.get('hashtags','') or ''}"


def profile_text(profile: dict) -> str:
    return (f"{profile['region']} {profile.get('industry','')}, 업력 {profile['biz_age_years']}년, "
            f"부채비율 {profile['debt_ratio']*100:.0f}%, 니즈: {profile.get('need_keywords','')}")


# ── 통합 파이프라인 ─────────────────────────────────────────
def recommend(policies, profile, embedder: Embedder, doc_vectors, top_k=8):
    idx = [i for i, p in enumerate(policies) if passes_hard_filter(p, profile)]
    if not idx:
        return []

    qv = embedder.encode_query(profile_text(profile))
    sub_vecs = doc_vectors[idx]
    sims = sub_vecs @ qv
    if len(sims) > 1:
        sims = (sims - sims.min()) / (np.ptp(sims) + 1e-9)
    else:
        sims = np.ones_like(sims)

    scored = []
    for j, i in enumerate(idx):
        p = policies[i]
        r_score, evidence = rule_score(p, profile)
        final = W_RULE * r_score + W_EMB * float(sims[j])
        scored.append({
            "policy": p,
            "final_score": round(final, 4),
            "rule_score": round(r_score, 4),
            "emb_sim": round(float(sims[j]), 4),
            "evidence": evidence,
        })
    scored.sort(key=lambda x: -x["final_score"])
    return scored[:top_k]
