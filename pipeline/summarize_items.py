"""파인튜닝된 요약 모델로 enriched_items.json에 summary_short(3줄 요약) 필드 추가.

정책 항목: 로컬 파인튜닝 모델(pipeline/models/kobart-policy-summary)로 생성.
  후처리 — 중복 토큰 정리("이메일·이메일" 류), "지원/대상/신청" 3줄 형식 검증에
  실패하면 학습 데이터의 teacher gold 레이블로 폴백(모든 타깃에 gold 존재).
KB상품 항목: 원본 summary가 이미 한 줄 요약이라 그대로 summary_short로 복사.

실행:  .venv/bin/python pipeline/summarize_items.py   (enrich_recommendables.py 이후)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from train_summarizer import DATA_PATH, MAX_SRC, OUT_DIR

ROOT = Path(__file__).resolve().parent.parent
ENRICHED_PATH = ROOT / "backend/src/main/resources/data/reco/enriched_items.json"
POLICIES_PATH = ROOT / "backend/src/main/resources/data/seoul_policies_sosangongin.json"

GEN_KW = dict(max_new_tokens=96, num_beams=4, no_repeat_ngram_size=3, early_stopping=True)


def cleanup(text: str) -> str:
    text = re.sub(r"(\S+)([·,] ?)\1", r"\1", text)  # "이메일·이메일" → "이메일"
    return "\n".join(l.strip() for l in text.split("\n") if l.strip())


def format_ok(text: str) -> bool:
    lines = text.split("\n")
    return (len(lines) == 3 and lines[0].startswith("지원:")
            and lines[1].startswith("대상:") and lines[2].startswith("신청:"))


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    data = json.loads(ENRICHED_PATH.read_text())
    policies = {p["id"]: p for p in json.loads(POLICIES_PATH.read_text())}
    golds = {r["id"]: r["target"] for r in
             (json.loads(l) for l in DATA_PATH.read_text().splitlines() if l.strip())}

    tok = AutoTokenizer.from_pretrained(OUT_DIR)
    model = AutoModelForSeq2SeqLM.from_pretrained(OUT_DIR).to(device).eval()

    n_gen, n_fallback = 0, 0
    with torch.no_grad():
        for item in data["items"]:
            if item["source"] != "policy":
                item["summary_short"] = item["summary"]
                continue
            p = policies[item["item_id"]]
            # train_summarizer.build_source와 동일한 입력 구성
            parts = [p["title"], p["summary"]]
            if p.get("apply_period"):
                parts.append(f"신청기간: {p['apply_period']}")
            if p.get("apply_method"):
                parts.append(f"신청방법: {p['apply_method']}")
            if p.get("max_amount_manwon"):
                parts.append(f"최대지원: {p['max_amount_manwon']}만원")
            if p.get("max_biz_age"):
                parts.append(f"업력요건: {p['max_biz_age']}년 이내")
            enc = tok("\n".join(parts), max_length=MAX_SRC, truncation=True, return_tensors="pt").to(device)
            ids = model.generate(**enc, **GEN_KW)
            gen = cleanup(tok.decode(ids[0], skip_special_tokens=True).strip())
            if not format_ok(gen) and item["item_id"] in golds:
                gen = golds[item["item_id"]]
                n_fallback += 1
            item["summary_short"] = gen
            n_gen += 1

    data["meta"]["summary_model"] = "kobart-policy-summary (local fine-tuned)"
    ENRICHED_PATH.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"[summarize] {n_gen} policy summaries generated ({n_fallback} gold fallback) -> {ENRICHED_PATH}")


if __name__ == "__main__":
    main()
