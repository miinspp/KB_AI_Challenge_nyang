"""파인튜닝 전/후 추천 랭킹 품질 비교 — 검증 프로필(학습 미사용).

각 검증 프로필 문장을 인코딩해 61개 항목과 코사인 유사도로 랭킹하고,
teacher가 라벨한 positives를 정답으로 Recall@5 / MRR / NDCG@5 를 잰다.

실행:  .venv/bin/python pipeline/eval_matcher.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

from train_matcher import BASE_MODEL, OUT_DIR, VAL_IDS_PATH

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "pipeline/data"
LABELS_PATH = DATA_DIR / "reco_labels.jsonl"        # {profile_id, sentence, positives:[item_id]}
ITEMS_PATH = ROOT / "backend/src/main/resources/data/reco/enriched_items.json"


def item_text(it: dict) -> str:
    parts = [it["title"], it.get("summary_short") or it["summary"]]
    if it.get("category"):
        parts.append(it["category"])
    return " ".join(parts)


def evaluate(model, val, items) -> dict:
    ids = [it["item_id"] for it in items]
    item_emb = model.encode([item_text(it) for it in items], normalize_embeddings=True)
    q_emb = model.encode([v["sentence"] for v in val], normalize_embeddings=True)

    recall5, mrr, ndcg5 = [], [], []
    for v, q in zip(val, q_emb):
        sims = item_emb @ q
        order = np.argsort(-sims)
        ranked = [ids[i] for i in order]
        gold = set(v["positives"])
        top5 = ranked[:5]
        recall5.append(len(gold & set(top5)) / min(5, len(gold)))
        rr = next((1 / (i + 1) for i, x in enumerate(ranked) if x in gold), 0.0)
        mrr.append(rr)
        dcg = sum(1 / math.log2(i + 2) for i, x in enumerate(top5) if x in gold)
        idcg = sum(1 / math.log2(i + 2) for i in range(min(5, len(gold))))
        ndcg5.append(dcg / idcg if idcg else 0.0)
    return {"recall@5": np.mean(recall5), "mrr": np.mean(mrr), "ndcg@5": np.mean(ndcg5)}


def main() -> None:
    labels = [json.loads(l) for l in LABELS_PATH.read_text().splitlines() if l.strip()]
    val_ids = set(json.loads(VAL_IDS_PATH.read_text()))
    val = [x for x in labels if x["profile_id"] in val_ids and x["positives"]]
    items = json.loads(ITEMS_PATH.read_text())["items"]
    print(f"[eval] {len(val)} val profiles, {len(items)} items")

    for name, path in (("base", BASE_MODEL), ("fine-tuned", OUT_DIR)):
        m = evaluate(SentenceTransformer(str(path)), val, items)
        print(f"  {name:12s}  recall@5={m['recall@5']:.3f}  mrr={m['mrr']:.3f}  ndcg@5={m['ndcg@5']:.3f}")


if __name__ == "__main__":
    main()
