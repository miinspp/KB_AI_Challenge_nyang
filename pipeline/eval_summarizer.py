"""파인튜닝 전/후 요약 품질 비교 — 검증셋(서비스 타깃 37건, 학습 미사용).

지표:
  - format: "지원:/대상:/신청:" 3줄 형식 준수율
  - rouge1_f: kiwi 형태소 단위 ROUGE-1 F1 (gold 대비)
  - emb_sim: ko-sroberta 임베딩 코사인 유사도 (gold 대비, 의미 보존)

실행:  .venv/bin/python pipeline/eval_summarizer.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from kiwipiepy import Kiwi
from sentence_transformers import SentenceTransformer
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from train_summarizer import BASE_MODEL, DATA_PATH, MAX_SRC, OUT_DIR, TARGET_IDS_PATH, build_source

GEN_KW = dict(max_new_tokens=96, num_beams=4, no_repeat_ngram_size=3, early_stopping=True)


def generate(model_dir, records, device) -> list[str]:
    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_dir).to(device).eval()
    outs = []
    with torch.no_grad():
        for r in records:
            enc = tok(build_source(r), max_length=MAX_SRC, truncation=True, return_tensors="pt").to(device)
            ids = model.generate(**enc, **GEN_KW)
            outs.append(tok.decode(ids[0], skip_special_tokens=True).strip())
    del model
    return outs


def rouge1_f(kiwi: Kiwi, hyp: str, ref: str) -> float:
    h = Counter(t.form for t in kiwi.tokenize(hyp))
    r = Counter(t.form for t in kiwi.tokenize(ref))
    overlap = sum((h & r).values())
    if not overlap:
        return 0.0
    p, rec = overlap / sum(h.values()), overlap / sum(r.values())
    return 2 * p * rec / (p + rec)


def format_ok(text: str) -> bool:
    lines = [l for l in text.split("\n") if l.strip()]
    return (len(lines) == 3 and lines[0].startswith("지원:")
            and lines[1].startswith("대상:") and lines[2].startswith("신청:"))


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    records = [json.loads(l) for l in DATA_PATH.read_text().splitlines() if l.strip()]
    val_ids = set(json.loads(TARGET_IDS_PATH.read_text()))
    val = [r for r in records if r["id"] in val_ids]
    golds = [r["target"] for r in val]
    print(f"[eval] {len(val)} val records (학습 미사용)")

    kiwi = Kiwi()
    emb = SentenceTransformer("jhgan/ko-sroberta-multitask")
    gold_emb = emb.encode(golds, normalize_embeddings=True)

    for name, model_dir in (("base(zero-shot)", BASE_MODEL), ("fine-tuned", OUT_DIR)):
        print(f"[eval] generating with {name} …")
        hyps = generate(model_dir, val, device)
        fmt = np.mean([format_ok(h) for h in hyps])
        rouge = np.mean([rouge1_f(kiwi, h, g) for h, g in zip(hyps, golds)])
        hyp_emb = emb.encode(hyps, normalize_embeddings=True)
        sim = float(np.mean(np.sum(hyp_emb * gold_emb, axis=1)))
        print(f"  {name:16s}  format={fmt:.2%}  rouge1_f={rouge:.3f}  emb_sim={sim:.3f}")
        if name == "fine-tuned":
            for r, h in list(zip(val, hyps))[:3]:
                print(f"\n  --- {r['title'][:44]}")
                print("  " + h.replace("\n", "\n  "))


if __name__ == "__main__":
    main()
