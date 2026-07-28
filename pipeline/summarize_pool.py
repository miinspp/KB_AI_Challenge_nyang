"""파인튜닝 KoBART 로 reco_pool.json(추천 서비스 풀) 에 summary_short(3줄 요약) 추가.

summarize_items.py 와 같은 모델·후처리를 쓰되 대상이 다르다:
  summarize_items.py → backend enriched_items.json (61건, Spring 서빙)
  이 스크립트        → recommend-service reco_pool.json (78건, Python 추천 서비스)

정책 항목(source=GOV)만 생성한다. KB상품(source=KB)은 summary 가 이미 한 줄 요약이라 그대로 복사.
"지원:/대상:/신청:" 3줄 형식 검증에 실패하면 teacher gold 가 있으면 그것으로,
없으면 summary_short 를 비워 둔다(프론트가 기존 reason 으로 폴백).

실행:  .venv/bin/python pipeline/summarize_pool.py
"""
from __future__ import annotations

import json
from pathlib import Path

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from summarize_items import GEN_KW, cleanup, format_ok
from train_summarizer import DATA_PATH, MAX_SRC, OUT_DIR

ROOT = Path(__file__).resolve().parent.parent
POOL_PATH = ROOT / "recommend-service/data/reco_pool.json"


def build_source(p: dict) -> str:
    """train_summarizer.build_source 와 동일한 입력 구성(필드명은 풀 스키마 기준)."""
    parts = [p.get("title", ""), p.get("summary", "")]
    if p.get("apply_period"):
        parts.append(f"신청기간: {p['apply_period']}")
    if p.get("apply_method"):
        parts.append(f"신청방법: {p['apply_method']}")
    if p.get("max_amount_manwon"):
        parts.append(f"최대지원: {p['max_amount_manwon']}만원")
    if p.get("max_biz_age"):
        parts.append(f"업력요건: {p['max_biz_age']}년 이내")
    return "\n".join(x for x in parts if x)


def main() -> None:
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    golds = {r["id"]: r["target"] for r in
             (json.loads(l) for l in DATA_PATH.read_text().splitlines() if l.strip())}

    tok = AutoTokenizer.from_pretrained(OUT_DIR)
    model = AutoModelForSeq2SeqLM.from_pretrained(OUT_DIR).to(device).eval()

    n_gen = n_gold = n_skip = n_copy = 0
    with torch.no_grad():
        for item in pool:
            if item.get("source") != "GOV":          # KB상품 — 원본 summary 유지
                item["summary_short"] = item.get("summary", "")
                n_copy += 1
                continue
            enc = tok(build_source(item), max_length=MAX_SRC, truncation=True,
                      return_tensors="pt").to(device)
            gen = cleanup(tok.decode(model.generate(**enc, **GEN_KW)[0],
                                     skip_special_tokens=True).strip())
            if format_ok(gen):
                n_gen += 1
            elif item["id"] in golds:
                gen, _ = golds[item["id"]], None
                n_gold += 1
            else:
                gen = ""                              # 프론트가 기존 reason 으로 폴백
                n_skip += 1
            item["summary_short"] = gen

    # 원본과 같은 2칸 들여쓰기로 되쓴다 — 한 줄로 뭉치면 git diff 가 통째로 바뀐 것처럼 보인다.
    POOL_PATH.write_text(json.dumps(pool, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[summarize-pool] 생성 {n_gen} / gold폴백 {n_gold} / 형식실패 {n_skip} / KB복사 {n_copy}"
          f"  -> {POOL_PATH}")


if __name__ == "__main__":
    main()
