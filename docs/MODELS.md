# 로컬 모델 — 무엇을, 어디서, 어떤 원리로

직접 파인튜닝해 저장소 안에서 돌리는 모델은 **두 개**다. 둘 다 API 호출이 없고,
인터넷 없이 동작하며, 가중치는 git 미추적(`pipeline/models/`)이다.

| 모델 | 한 줄 역할 | 크기 | 베이스 |
|---|---|---|---|
| `ko-sroberta-reco` | 어떤 상품을 보여줄지 **고른다**(순위·적합%) | 442MB | `jhgan/ko-sroberta-multitask` |
| `kobart-policy-summary` | 공고를 어떻게 보여줄지 **다듬는다**(3줄 요약) | 496MB | `EbanLee/kobart-summary-v3` |

> **Claude API를 쓰는 기능과 혼동하지 말 것.** 에이전트(`agent.py`)·조합 분석
> (`portfolio_advisor.py`)·추천 근거 문장(`app.py`)은 별개다. 이 문서는 로컬 모델만 다룬다.

---

## 1. ko-sroberta-reco — 추천 순위 결정

### 어디서 쓰이나

한 곳에서 계산하고 **세 화면이 공유**한다. 진입점은
`recommend-service/engine.py` 의 `Embedder` 하나뿐이다.

| 화면 | 이 모델이 만드는 것 |
|---|---|
| **맞춤 추천** 탭 | 카드 정렬 순서, 적합 % |
| **시뮬레이터** 탭 | 상단 "추천 상품" 후보 목록 (`App.jsx` 가 추천 결과를 그대로 변환) |
| **든든이 AI** | 에이전트의 `recommend_policies` 도구가 같은 엔진 호출 |

추천 순위가 바뀌면 시뮬레이터 후보도 같이 바뀐다 — 같은 계산을 나눠 쓰기 때문이다.

### 원리

문장을 768차원 벡터로 바꿔 **의미가 비슷하면 벡터도 가깝게** 만드는 모델이다.
진단 프로필을 문장으로 만들어 벡터화하고, 상품 78건의 벡터와 코사인 유사도를 잰다.

```
진단 결과 → "서울에서 한식음식점을 운영하는 업력 2년차 소상공인.
             부채비율 45%, 니즈: 운전자금 대출"
                          ↓ 인코딩
                    [0.03, -0.11, …]  (768차원)
                          ↓ 코사인 유사도
    상품 78건의 벡터 [[…], […], …]  → 유사도 78개
```

최종 점수는 규칙과 반반 섞는다 (`engine.py` 의 `W_RULE, W_EMB = 0.55, 0.45`):

```
최종 = 0.55 × 규칙점수 + 0.45 × 임베딩유사도
```

**규칙 점수는 모델이 아니라 그냥 `if` 문 4개다** (`engine.py` 의 `rule_score`).
부채비율·상권위험·현금흐름·매출 조건에 걸리면 미리 써둔 근거 문장을 붙인다.
조건에 하나도 안 걸리는 항목이 많아(78건 중 47건) 근거 문장이 비는 경우가 흔하다.

### 왜 파인튜닝이 필요했나

베이스 모델은 "일반적인 한국어 의미 유사도"를 알지만 **"이 재무상황에는 이 정책이 맞다"**
는 모른다. 그래서 프로필↔정책 매칭 쌍으로 추가 학습했다.

- **학습 데이터**: 프로필 60개를 조합 생성 → **Claude(teacher)가 각 프로필에 맞는 항목을
  라벨링** → (프로필 문장, 적합 항목) 양성 쌍 442개
- **손실 함수**: `MultipleNegativesRankingLoss` — 배치 안의 다른 항목이 자동으로 음성이 되어
  소량 데이터에 강하다
- **하이퍼파라미터**: 4 epoch, batch 16, lr 2e-5 (`pipeline/train_matcher.py`)

### 성능 (파인튜닝 전 → 후)

측정은 **학습에 쓰지 않은** 검증 프로필로만 한다.

`pipeline/eval_matcher.py` — 검증 프로필 12개 / 항목 61건:

| | Recall@5 | MRR | NDCG@5 |
|---|---|---|---|
| base | 0.133 | 0.252 | 0.127 |
| **fine-tuned** | **0.467** | **0.667** | **0.460** |

`recommend-service/eval_pool.py` — 실제 서비스 풀(78건), 규칙 점수 포함 최종 순위 기준:

| | Recall@5 | MRR | NDCG@5 |
|---|---|---|---|
| TF-IDF (폴백) | 0.210 | 0.558 | 0.295 |
| **fine-tuned** | **0.350** | **0.698** | **0.460** |

MRR 0.698 ≈ 정답 상품이 평균 1~2위에 온다는 뜻이다.

### 폴백 3단계

모델 가중치는 git에 없으므로 없을 수 있다. `Embedder` 는 순서대로 시도한다.

```
① pipeline/models/ko-sroberta-reco  (로컬 파인튜닝)     ← 정상
② BAAI/bge-m3                        (다운로드 ~2GB)
③ TF-IDF                             (단어 빈도)        ← 품질 급락
```

**현재 어느 단계인지 확인**: `GET /health` 의 `embedding` 필드.
`"tfidf"` 가 보이면 `sentence-transformers` 미설치이거나 모델 폴더가 없는 것이다.

### 런타임 비용

기동 시 78건을 한 번 인코딩해 `data/reco_vectors.{모델명}.npy` 에 캐시하고,
요청마다 **쿼리 문장 1개만** 인코딩한다. 캐시 파일이 모델별로 나뉜 이유는,
모델을 바꾸면 임베딩 공간이 달라져 예전 벡터를 재사용하면 유사도가 조용히 망가지기 때문이다.

---

## 2. kobart-policy-summary — 공고 3줄 요약

### 어디서 쓰이나

**맞춤 추천** 탭에서 카드를 펼쳤을 때 맨 위 초록 라벨 3줄.

```
지원  직접융자금, 시중은행협력자금, 안심통장 등 지원
대상  서울 소재 중소기업 및 소상공인
신청  서울신용보증재단 모바일앱 온라인 및 방문 접수, 예산 소진시까지
```

그 아래 회색 라벨(대상·지원분야·신청기간·신청방법)은 **모델과 무관**하다 —
JSON 원본 필드를 그대로 복사한 것이다(`app.py` 의 `to_product`).

### 원리 — 정보를 가져오는 게 아니라 압축한다

모델은 새 정보를 찾아오지 않는다. **이미 JSON에 있는 원문을 읽고 재배열·압축**한다.

원본 `summary` 필드는 조례 인용이 뭉쳐 있다:

> 「서울특별시 중소기업육성기금의 설치 및 운용에 관한 조례」제16조의 규정에 의하여 …
> ☞ 「…시행규칙」 별표1 에 해당하는 서울 소재 중소기업 및 소상공인 ※ 자세한 지원대상
> 공고문 참조 ☞ 직접융자금, 시중은행협력자금, 안심통장

여기에 `apply_period`·`apply_method`·`max_amount_manwon`·`max_biz_age` 를 이어 붙여
입력으로 주면 위의 3줄이 나온다. "예산 소진시까지"는 `apply_period`, "모바일앱 접수"는
`apply_method` 에서 온 것이다.

### 생성 파이프라인

```
① 수집   공공데이터 공고 원문 → reco_pool.json
② 정답   Claude(teacher)가 공고 200건에 "지원:/대상:/신청:" 모범 요약 작성
         → pipeline/data/policy_summaries.jsonl
③ 학습   KoBART seq2seq 파인튜닝 (지식 증류)
④ 생성   원본 필드 이어붙여 입력 → beam search(num_beams=4) → 3줄
⑤ 검증   3줄인가? 각 줄이 지원:/대상:/신청: 로 시작하나?
         실패 시 ②의 정답으로 폴백
⑥ 저장   summary_short 필드로 JSON에 구움 (런타임 추론 없음)
```

②가 핵심이다. 공고마다 문장 구조가 제각각이라 사람이 규칙을 짤 수 없어서,
**Claude가 만든 모범답안을 작은 로컬 모델에게 가르쳤다**(지식 증류). 그 결과
추론 비용이 사실상 0인 모델로 같은 일을 한다.

⑤ 검증이 있는 이유는 생성 모델이 가끔 형식을 어기기 때문이다. 실제 실행 결과:
**정책 54건 중 52건 생성 성공, 2건 정답 폴백**(`summarize_pool.py`).

**일반화 검증**: 학습 시 소상공인 타깃 37건(=서비스에 실제 노출되는 공고)은
학습에서 제외하고 검증셋으로 썼다. 즉 화면에 뜨는 요약은 모델이 **학습 중 본 적 없는**
공고를 스스로 요약한 결과다.

### 성능 (파인튜닝 전 → 후)

`pipeline/eval_summarizer.py`:

| | 형식 준수 | ROUGE-1 F | 임베딩 유사도 |
|---|---|---|---|
| base (zero-shot) | 0.00% | 0.235 | 0.752 |
| **fine-tuned** | **91.89%** | **0.727** | **0.942** |

base는 "지원/대상/신청" 3줄 형식을 **한 번도** 못 맞췄다. 형식 학습이 이 파인튜닝의
핵심 성과다.

### 하이퍼파라미터

6 epoch, batch 4 × accum 2, lr 3e-5, 입력 512 / 출력 96 토큰
(`pipeline/train_summarizer.py`)

---

## 3. 두 갈래 서빙 경로

같은 모델 산출물을 **두 서비스**가 쓴다. 프론트가 실제로 쓰는 건 Python 쪽이다.

| | Python 추천 서비스 | Spring 백엔드 |
|---|---|---|
| 경로 | `POST /api/recommend` (:8000) | `POST /api/reco` (:8081) |
| 데이터 | `recommend-service/data/reco_pool.json` 78건 | `backend/.../reco/enriched_items.json` 61건 |
| 임베딩 | 기동 시 계산 (모델 로드) | 배치 사전계산 (런타임 추론 **없음**) |
| 랭킹 | 규칙 55% + 유사도 45% | 니즈 앵커 8종 가중합 × 코사인 |
| 3줄 요약 | `summary_short` | `summaryShort` |
| 프론트 사용 | **○** | ✗ (동작하지만 호출자 없음) |

> 경로 이름이 한때 둘 다 `/api/recommend` 라, vite 프록시가 더 구체적인 규칙을 먼저
> 잡아 Spring 쪽이 영영 호출되지 않았다. 그래서 `/api/reco` 로 분리했다.
> Spring 경로는 Java 단독(모델 로드 없이 내적만)으로 도는 대안 구현이라 폴백·비교용으로 남겨 둔다.

---

## 4. 재생성 방법

모델 가중치와 벡터 캐시는 git 미추적이라 클론 직후에는 없다.

```bash
# 모델 학습 (각 수 분, MPS 기준)
.venv/bin/python pipeline/train_matcher.py       # → models/ko-sroberta-reco
.venv/bin/python pipeline/train_summarizer.py    # → models/kobart-policy-summary

# 성능 확인 (학습에 쓰지 않은 검증셋)
.venv/bin/python pipeline/eval_matcher.py
.venv/bin/python pipeline/eval_summarizer.py

# 산출물 반영
.venv/bin/python pipeline/enrich_recommendables.py  # Spring용 임베딩
.venv/bin/python pipeline/summarize_items.py        # Spring용 3줄 요약
.venv/bin/python pipeline/summarize_pool.py         # Python 추천 서비스용 3줄 요약

# 추천 서비스 랭킹 품질 측정
cd recommend-service && .venv/bin/python eval_pool.py
```

임베딩 벡터 캐시는 서비스 기동 시 자동 생성되므로 따로 만들 필요 없다.
