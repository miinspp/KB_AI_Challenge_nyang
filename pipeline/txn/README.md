# txn — 소상공인 거래 분류 파이프라인

마이데이터·홈택스·KB Open API 거래내역을 **월세/인건비/매입/공과금/대출/수입** 등
카테고리로 자동 분류하고, 월별 손익·현금흐름 리포트와 개선 제안을 만든다.

토스식 "값싼 규칙으로 대부분 확정 → 애매한 것만 AI → 낮은 신뢰도만 사용자 확인"
구조. 지금은 **레이어 ①②③⑤⑥⑦이 동작**하고, **레이어④(AI)는 훅만** 열려 있다.

## 레이어

| # | 파일 | 역할 |
|---|---|---|
| ① 정규화 | `normalize.py` | 상호·적요 표준화(`㈜`, 지점·단말번호 제거) |
| ② 구조적 매칭 | `structural.py` | 계좌성격·출처 메타로 확정(대출상환·내부이체·카드대금·세금) |
| ③ 규칙 분류 | `rules.py` | 카테고리별 키워드 사전 + 방향(입/출) |
| ③' 정기성 보정 | `engine.py` | 매월 반복 → 월세·인건비 신뢰도 상향 |
| ④ AI 분류 | (훅) | 규칙 실패건만. base 인코더 최근접/LLM을 `ai_classify`로 주입 |
| ⑤ 신뢰도 게이트 | `engine.py` | `<0.6` 또는 UNKNOWN → `needs_review=True` |
| ⑥ 개인 규칙 | `engine.py` | 사용자 교정(`{norm_key: code}`)을 최우선 재사용 |
| ⑦ 집계 | `engine.py` | 월×카테고리, 손익(P&L)과 현금흐름 분리 |

카테고리 정의는 `taxonomy.py` 한 곳. 거래 표준 스키마는 `schema.py`.

## 실행

```bash
python pipeline/txn/demo.py       # mock 생성 → 분류 → 리포트 출력 (의존성 없음)
python pipeline/txn/mock_data.py  # data/mock_transactions.json 덤프(로컬 검수용)
python pipeline/txn/report.py     # 백엔드가 서빙할 monthly_report.json 생성
```

> 로컬 검수용 `data/` 는 **git 미추적**(`.gitignore`). seed 고정이라 `mock_data.py`로
> 언제든 동일하게 재생성된다 — 모델 가중치와 같은 원칙(산출물은 커밋하지 않음).

## 백엔드 연동 (Spring)

`report.py` 가 `backend/src/main/resources/data/txn/monthly_report.json` 을 생성하고,
Spring `txn` 피처가 이를 로드해 서빙한다(reco 파이프라인과 동일 패턴 — Python이
사전계산, Java는 서빙만). 이 JSON은 백엔드 런타임 필수 리소스라 **커밋한다**
(`enriched_items.json`과 동일).

```
GET /api/txn/report
  → { meta, months[], reviewQueue[], suggestions[] }
```

| 계층 | 파일 |
|---|---|
| 계약 JSON | `backend/.../resources/data/txn/monthly_report.json` (report.py 생성) |
| 도메인 | `com.nyang.txn.domain.TxnReport` |
| 로드 | `com.nyang.txn.repository.TxnReportRepository` (`@PostConstruct`) |
| 서비스 | `com.nyang.txn.application.TxnService` |
| 컨트롤러 | `com.nyang.txn.presentation.TxnController` |

## 손익 vs 현금흐름

`taxonomy.py`의 `pnl` 플래그로 구분한다. **대출 원금상환**은 현금은 나가지만(현금흐름 유출)
비용이 아니다(부채 감소). 이자만 비용. 그래서 "이번 달 진짜 손익"과 "통장에서 나간 돈"이
다르게 집계된다 — 이걸 섞으면 손해를 과대계상한다.

## 다음 단계 (우선순위)

**1. 프론트 연결 + 규칙 튜닝 (지금 바로, 데이터 불필요)**
   - ✅ `GET /api/txn/report` 백엔드 API 완료(위 백엔드 연동 참고).
   - 프론트에서 `/api/txn/report` 소비 → 월별 손익·카테고리 리포트 화면.
   - 프론트에 **레이어⑤ 확인 UI**(reviewQueue 건 "이거 월세 맞나요?").
   - `rules.py` 키워드 사전을 실제 소상공인 거래 패턴으로 보강(밴사·도매처·프랜차이즈명).

**2. 레이어⑥ 교정 루프 (1과 병행)**
   - 사용자 교정을 `{norm_key: code}`로 DB 저장 → `classify_all(personal_rules=...)`에 주입.
   - 이게 곧 3번의 **라벨 학습 데이터**가 된다. 교정 로그를 반드시 축적할 것.

**3. 레이어④ AI 분류 연결 (규칙 커버리지 한계 느껴질 때)**
   - `jhgan/ko-sroberta-multitask`(**base**) 인코더로 카테고리 대표문장 임베딩 미리 계산,
     거래 임베딩과 코사인 최근접. `classify_all(..., ai_classify=fn)`에 주입.
   - ⚠ `ko-sroberta-reco`(fine-tuned)는 정책추천용으로 왜곡 — **여기 쓰지 말 것**.

**4. 거래분류기 파인튜닝 (교정 데이터 수백건 이상 쌓인 뒤)**
   - 2에서 모은 (거래문장, 카테고리) 라벨로 `train_matcher.py` contrastive 패턴 재활용.
   - `eval_matcher.py`처럼 held-out으로 정확도 측정 후 base 최근접과 비교해 채택 여부 결정.

**5. 실데이터 어댑터 + 개선 제안 고도화**
   - 마이데이터/홈택스/KB 각 응답 → `schema.Txn` 변환기 작성(현재 mock 자리 대체).
   - `demo._suggest`의 하드코딩 임계값을 `pipeline/benchmarks.json` 업종평균과 비교하도록 연결.
