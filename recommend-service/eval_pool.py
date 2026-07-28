"""추천 풀(reco_pool.json) 랭킹 품질 측정 — 임베딩 교체 전/후 비교용.

pipeline/data/reco_labels.jsonl 의 teacher 라벨(프로필 60개 × 적합 항목)을 정답으로,
engine.recommend() 가 매기는 최종 순위에서 Recall@5 / MRR / NDCG@5 를 잰다.
라벨은 enriched_items(61건) 기준이라 reco_pool(78건)과 겹치는 항목만 채점한다.

실행:  .venv/bin/python eval_pool.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

import engine

ROOT = Path(__file__).resolve().parent
LABELS = ROOT.parent / "pipeline/data/reco_labels.jsonl"
POOL = ROOT / "data/reco_pool.json"
K = 5

# 라벨 문장에는 재무 신호가 문장으로만 있어서, 규칙 점수용 수치는 중립값으로 고정한다.
# 임베딩 유사도만 바뀌는 비교이므로 규칙 쪽은 모든 조건에서 동일하게 들어간다.
NEUTRAL = {
    "region": "서울",
    "biz_age_years": 3,
    "industry": "",
    "debt_ratio": 0.35,
    "market_risk_level": "MEDIUM",
    "cash_flow_gap_prob": 0.25,
    "sales_percentile": 50,
}


def ndcg_at_k(ranked_ids, positives, k=K):
    dcg = sum(1 / math.log2(i + 2) for i, pid in enumerate(ranked_ids[:k]) if pid in positives)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(positives), k)))
    return dcg / ideal if ideal else 0.0


def main() -> None:
    policies = json.loads(POOL.read_text(encoding="utf-8"))
    pool_ids = {str(p["id"]) for p in policies}
    labels = [json.loads(l) for l in LABELS.read_text().splitlines() if l.strip()]

    embedder = engine.Embedder()
    texts = [engine.policy_text(p) for p in policies]
    doc_vecs = embedder.fit_docs(texts)

    recalls, mrrs, ndcgs, scored = [], [], [], 0
    for row in labels:
        gold = {p for p in row["positives"] if p in pool_ids}  # 풀에 없는 항목은 채점 제외
        if not gold:
            continue
        scored += 1
        profile = {**NEUTRAL, "need_keywords": row["sentence"]}
        items = engine.recommend(policies, profile, embedder, doc_vecs, top_k=len(policies))
        ranked = [str(it["policy"]["id"]) for it in items]

        hits = [i for i, pid in enumerate(ranked) if pid in gold]
        recalls.append(len([i for i in hits if i < K]) / len(gold))
        mrrs.append(1 / (hits[0] + 1) if hits else 0.0)
        ndcgs.append(ndcg_at_k(ranked, gold))

    print(f"[eval] mode={embedder.mode}  프로필 {scored}개 채점  항목 {len(policies)}건")
    print(f"  recall@{K}={np.mean(recalls):.3f}  mrr={np.mean(mrrs):.3f}  ndcg@{K}={np.mean(ndcgs):.3f}")


if __name__ == "__main__":
    main()
