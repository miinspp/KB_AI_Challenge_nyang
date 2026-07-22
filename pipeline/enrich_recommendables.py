"""정책·KB상품 데이터 오프라인 보강 배치.

seoul_policies_sosangongin.json(정책 37건) + kb-products/recommendable_products.json(KB상품 24건)을
공통 스키마로 정규화한 뒤,
  1) KeyBERT + kiwipiepy 명사 후보로 금융 키워드 추출
  2) ko-sroberta 문장 임베딩 계산
결과를 backend/src/main/resources/data/reco/enriched_items.json 으로 저장한다.

런타임(추천 매칭)은 이 파일의 임베딩·키워드만 읽으면 되므로 모델 추론이 필요 없다.

실행:  .venv/bin/python pipeline/enrich_recommendables.py
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from keybert import KeyBERT
from kiwipiepy import Kiwi
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "backend/src/main/resources/data"
OUT_PATH = DATA_DIR / "reco/enriched_items.json"

# 매칭 임베딩: B단계 contrastive 파인튜닝 모델(ko-sroberta-reco)이 있으면 우선 사용,
# 없으면 베이스 ko-sroberta. 파인튜닝 모델은 프로필-항목 매칭에 특화돼 랭킹 품질이 높다.
BASE_EMBED_MODEL = "jhgan/ko-sroberta-multitask"
FINETUNED_MODEL = ROOT / "pipeline/models/ko-sroberta-reco"
EMBED_MODEL = str(FINETUNED_MODEL) if FINETUNED_MODEL.exists() else BASE_EMBED_MODEL
TOP_N_KEYWORDS = 5

# 금융·지원제도 관점에서 중요한 용어 — KeyBERT 점수에 가산해 우선 노출
FINANCE_TERMS = {
    "대출", "융자", "보증", "금리", "이자", "이차보전", "상환", "한도", "담보",
    "보조금", "지원금", "사업화지원금", "바우처", "환급", "감면",
    "운영자금", "경영안정자금", "긴급자금", "정책자금", "시설자금",
    "임대료", "보증금", "월세", "수수료",
    "컨설팅", "교육", "판로", "마케팅", "홍보", "온라인판매",
    "창업", "재창업", "폐업", "재기", "사업정리",
    "세무", "노무", "고용", "인건비",
}
FINANCE_BOOST = 0.15

# 니즈 앵커 — 백엔드가 런타임에 모델 추론 없이 프로필 벡터를 합성할 수 있도록
# 대표 상황 문장의 임베딩을 미리 계산해둔다. (진단 신호 → 앵커 가중합 = 프로필 벡터)
NEED_ANCHORS = {
    "tier_low": "업종 내 하위권으로 매출이 부진한 소상공인. 긴급 경영안정 자금과 운영자금 지원이 필요",
    "tier_mid": "업종 내 중위권 소상공인. 경영 개선과 비용 효율화, 매출 증대 지원이 필요",
    "tier_high": "업종 내 상위권으로 매출이 성장하는 소상공인. 매장 확장과 시설 투자를 위한 성장 자금이 필요",
    "rent_burden": "임대료 부담이 과중해 고정비 절감과 임대료 지원, 비용 부담 완화가 필요",
    "unstable_sales": "매출이 하락 추세라 매출 안정화와 위기 대응 지원이 필요",
    "early_stage": "창업 초기 단계라 교육과 컨설팅, 초기 정착 지원이 필요",
    "funding_need": "사업 자금 조달이 필요해 대출과 융자, 보증 등 금융 지원을 찾는 중",
    "digital_sales": "온라인 판로 확대와 디지털 전환, 마케팅 지원이 필요",
}

# 공고문 어디에나 나오는 일반어 — 키워드 후보에서 제외
STOPWORDS = {
    "지원", "사업", "공고", "공고문", "모집", "신청", "접수", "선정", "대상",
    "소상공인", "기업", "중소기업", "사장", "사업자", "개인사업자",
    "다음", "안내", "계획", "시행", "참여", "제공", "가능", "이내", "기준",
}


def load_policies() -> list[dict]:
    raw = json.loads((DATA_DIR / "seoul_policies_sosangongin.json").read_text())
    items = []
    for p in raw:
        items.append({
            "item_id": p["id"],
            "source": "policy",
            "title": p["title"],
            "summary": p["summary"],
            "category": p.get("category"),
            "support_types": p.get("support_types", []),
            "is_finance": p.get("is_finance", False),
            "is_open": p.get("is_open", False),
            "deadline": p.get("deadline"),
            "region": p.get("region"),
            "max_biz_age": p.get("max_biz_age"),
            "max_amount_manwon": p.get("max_amount_manwon"),
            "agency": p.get("agency"),
            "url": p.get("url"),
        })
    return items


def load_kb_products() -> list[dict]:
    raw = json.loads((DATA_DIR / "kb-products/recommendable_products.json").read_text())
    items = []
    for p in raw["products"]:
        if p.get("availability_status") not in ("AVAILABLE_APPLY", "AVAILABLE_CONSULT"):
            continue
        items.append({
            "item_id": p["product_id"],
            "source": "kb_product",
            "title": p["product_name"],
            "summary": " ".join(filter(None, [
                p.get("summary"),
                p.get("public_conditions_summary"),
                p.get("target_customer"),
            ])),
            "category": p.get("category_ko"),
            "support_types": [],
            "is_finance": True,
            "is_open": True,
            "deadline": None,
            "region": "전국",
            "max_biz_age": None,
            "max_amount_manwon": None,
            "agency": "KB국민은행",
            "url": p.get("official_url"),
        })
    return items


def embed_text(item: dict) -> str:
    parts = [item["title"], item["summary"]]
    if item.get("category"):
        parts.append(item["category"])
    if item["support_types"]:
        parts.append(" ".join(item["support_types"]))
    return " ".join(parts)


_HANGUL = re.compile(r"^[가-힣]{2,}$")


def noun_candidates(kiwi: Kiwi, text: str) -> list[str]:
    """kiwi 형태소 분석으로 명사 단일어 + 연속 명사 2-gram 후보를 만든다."""
    tokens = kiwi.tokenize(text)
    nouns = []
    for t in tokens:
        if t.tag in ("NNG", "NNP") and _HANGUL.match(t.form):
            nouns.append((t.form, t.start))
    cands = {form for form, _ in nouns if form not in STOPWORDS}
    for (a, sa), (b, sb) in zip(nouns, nouns[1:]):
        if sb - (sa + len(a)) <= 1 and not {a, b} & STOPWORDS:
            cands.add(f"{a} {b}")  # 붙어 있거나 공백 하나 차이인 연속 명사만 결합
    return sorted(cands)


def extract_keywords(kw_model: KeyBERT, kiwi: Kiwi, text: str) -> list[str]:
    cands = noun_candidates(kiwi, text)
    if not cands:
        return []
    scored = kw_model.extract_keywords(
        text, candidates=cands, top_n=TOP_N_KEYWORDS * 3, use_mmr=True, diversity=0.4,
    )
    boosted = []
    for kw, score in scored:
        if any(part in FINANCE_TERMS for part in kw.split()) or kw in FINANCE_TERMS:
            score += FINANCE_BOOST
        boosted.append((kw, score))
    boosted.sort(key=lambda x: -x[1])
    return [kw for kw, _ in boosted[:TOP_N_KEYWORDS]]


def main() -> None:
    items = load_policies() + load_kb_products()
    print(f"[enrich] {len(items)} items (policy + kb_product)")

    print(f"[enrich] embed model: {EMBED_MODEL}")
    model = SentenceTransformer(EMBED_MODEL)
    # 키워드 추출은 매칭 특화 모델보다 베이스가 적합 — 분리 로드
    kw_backbone = model if EMBED_MODEL == BASE_EMBED_MODEL else SentenceTransformer(BASE_EMBED_MODEL)
    kw_model = KeyBERT(model=kw_backbone)
    kiwi = Kiwi()

    texts = [embed_text(it) for it in items]
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)

    for it, text, emb in zip(items, texts, embeddings):
        it["keywords"] = extract_keywords(kw_model, kiwi, text)
        it["embedding"] = [round(float(x), 6) for x in emb]

    anchor_embs = model.encode(list(NEED_ANCHORS.values()), normalize_embeddings=True)
    anchors = {
        key: [round(float(x), 6) for x in emb]
        for key, emb in zip(NEED_ANCHORS.keys(), anchor_embs)
    }

    out = {
        "meta": {
            "embed_model": Path(EMBED_MODEL).name if FINETUNED_MODEL.exists() else EMBED_MODEL,
            "embed_finetuned": FINETUNED_MODEL.exists(),
            "dim": len(items[0]["embedding"]),
            "count": len(items),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "anchors": anchors,
        "items": items,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"[enrich] wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")
    for it in items[:3]:
        print(f"  - {it['title'][:40]} -> {it['keywords']}")


if __name__ == "__main__":
    main()
