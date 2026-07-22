# 우리 가게 위치 진단 (KB_AI_Challenge_nyang)

소상공인이 **자기 점포가 같은 업종 점포들 중 상위 몇 %인지** 확인할 수 있는 웹 서비스입니다.
예를 들어 삼겹살집(한식음식점)을 운영한다면, 서울시내 한식음식점 3만 8천여 개의 실제 매출
분포와 비교해 "상위 37.9%" 같은 결과를 보여줍니다.

매출 하나만 보는 것이 아니라 **매출·순수익·비용 효율**을 함께 반영한 종합점수로 위치를
산출하며, 모든 수치는 공공데이터에 근거합니다.

---

## 1. 무엇을 만들었나

| 구성 | 기술 | 역할 |
|---|---|---|
| `frontend/` | **React** (Vite) | 업종 선택, 월 매출/지출 입력, 상위 % 결과·분포 차트 표시 |
| `backend/` | **Java Spring Boot** (Gradle) | 업종별 분포 데이터 로드, 퍼센타일·종합점수 계산 REST API |
| `pipeline/` | **Python** (+crontab) | 서울시 Open API에서 데이터 자동 수집 → 분포 데이터 재생성 |

동작 흐름:

```
[pipeline] 서울시 상권분석서비스 Open API / 공식 CSV
     │  collect_seoul_sales.py  (분기별 자동 수집, cron.example 참고)
     │  build_distributions.py  (업종별 점포당 월매출 분포로 가공)
     ▼
industry_distributions.json  (63개 업종 × 백분위 P0~P100 격자)
     ▼
[backend] Spring Boot  ──  POST /api/rank : 내 매출/지출 → 상위 % 계산
     ▼
[frontend] React  ──  입력 폼 + 결과(종합점수, 항목별 상위 %, 분포 곡선 위 내 위치)
```

## 2. 어떤 데이터를 썼나

> 📄 **데이터 범위·출처·한계 상세 정리: [docs/DATA.md](docs/DATA.md)** (서울 한정 여부, 홈택스와의 차이 등)

**(1) 업종별 매출 분포 — 서울시 상권분석서비스(추정매출-상권)**
- 출처: [서울 열린데이터광장 OA-15572](https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do) (서울신용보증재단, 카드사 매출 기반 추정)
- 동봉된 데이터: Open API 수집본 **최신 4개 분기(2025 Q2 ~ 2026 Q1)** — 60개 업종 ×
  1,576개 상권, 점포수 데이터와 조인
- 점포 단위로 비교 가능한 매출 공공데이터는 서울시만 공개하고 있어 **비교 범위는 서울**입니다
  (전국은 점포 위치·수만 공개되어 매출 분포를 만들 수 없음)

**(2) 점포수 데이터 — 서울시 상권분석서비스(점포-상권)**
- 출처: [서울 열린데이터광장 OA-15577](https://data.seoul.go.kr/dataList/OA-15577/S/1/datasetView.do)
- 최신 분기 수집 시 매출 데이터에 점포수가 없어 이 데이터와 조인해 사용

**(3) 업종별 수익성 벤치마크 — 소상공인실태조사 (통계청·중소벤처기업부)**
- 업종별 사업체당 연간 매출액·영업이익 (2022년 확정결과, 전체 평균은 2023년 잠정결과)
- 예: 숙박·음식점업 매출 1.45억/영업이익 0.32억 → 평균 영업이익률 22.1%
- `pipeline/benchmarks.json` 에 수치·출처·업종 매핑이 정리되어 있음

## 3. 상위 %는 어떻게 계산하나

1. **점포당 월매출** = 상권×업종 분기 추정매출 ÷ 3 ÷ 점포수
   (검증: 편의점 중위값이 월 5,400만원으로 업계 공표 평균과 부합)
2. 상권×업종 관측치를 점포수로 가중해 **업종별 백분위 분포(P0~P100)** 를 만든다
3. **매출 퍼센타일** — 내 월매출을 분포에서 역보간
4. **순수익 퍼센타일** — 매출 분포 × 업종 평균 영업이익률로 유도한 동종 순수익 분포에서
   내 순수익(매출−지출)을 역보간
5. **비용 효율 점수** — 내 영업이익률 ÷ 업종 벤치마크 × 50점 (0~100, 평균이면 50점)
6. **종합점수 = 매출 0.5 + 순수익 0.3 + 비용효율 0.2** (화면에서 가중치 조정 가능)
   → **상위 % = 100 − 종합점수**
7. (선택) **상권유형 비교** — 골목상권/발달상권/전통시장을 선택하면 동일 유형 상권의
   분포만으로 같은 방식의 보조 상위 %를 병행 표시 (표본 상권 30개 이상 유형만 제공,
   점수에 합산하지 않는 병렬 지표)

한계(화면에도 고지): 추정매출은 카드 데이터 기반 추정치이고, 상권 내 점포 간 편차는 상권
평균으로 근사됩니다. 순수익 분포는 업종 평균 이익률로 유도한 근사치입니다.

## 4. 실행 방법

### 백엔드 (JDK 17+, Gradle — 래퍼 동봉이라 별도 설치 불필요)
```bash
cd backend
./gradlew bootRun        # http://localhost:8080  (Windows: gradlew.bat bootRun)
./gradlew test           # 계산 로직 단위 테스트
```

### 프론트엔드 (Node 18+)
```bash
cd frontend
npm install
npm run dev              # http://localhost:5173  (API는 8080으로 자동 프록시)
```

브라우저에서 5173 접속 → 업종 선택 → 월 매출/지출 입력 → "내 위치 확인하기".

### API 요약
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/industries` | 업종 목록 (점포수·중위 월매출 포함) |
| GET | `/api/industries/{code}` | 업종 분포 상세 (차트용 백분위 격자) |
| POST | `/api/rank` | `{industryCode, monthlySales(원), monthlyExpense(원), weights?}` → 상위 % |
| GET | `/api/meta` | 데이터 출처·기준 분기 |
| POST | `/api/admin/reload` | 파이프라인 갱신 후 데이터 재적재 |

## 5. 데이터 자동 갱신 (Python + crontab)

서울시 데이터는 분기마다 갱신됩니다. 무료 API 키만 있으면 최신 분기로 교체할 수 있습니다.

```bash
cd pipeline
pip install -r requirements.txt

# 1) data.seoul.go.kr 회원가입 → 인증키 발급(즉시·무료)
export SEOUL_OPENAPI_KEY=발급받은키

# 2) 최신 데이터 전량 수집 (추정매출 + 점포수)
python3 collect_seoul_sales.py --out-dir raw

# 3) 분포 재계산 → 백엔드 데이터 교체
python3 build_distributions.py \
  --sales raw/sales_latest.csv --stores raw/stores_latest.csv \
  --out ../backend/src/main/resources/data/industry_distributions.json

# 4) 백엔드 재시작 또는 curl -X POST localhost:8080/api/admin/reload
```

분기별 자동 실행은 `pipeline/cron.example` 내용을 `crontab -e` 에 등록하면 됩니다
(1·4·7·10월 새벽에 수집→가공→교체까지 자동).

## 6. 파일 구조

```
KB_AI_Challenge_nyang/
├── README.md
├── backend/
│   ├── build.gradle, settings.gradle, gradlew          # Gradle 빌드 (래퍼 동봉)
│   └── src/                                             # 도메인 중심 계층 구조
│       ├── main/java/com/nyang/
│       │   ├── NyangApplication.java                   # 부트스트랩
│       │   ├── global/                                 # 공통 관심사
│       │   │   ├── config/CorsConfig.java              # 개발용 CORS
│       │   │   └── exception/                          # ErrorResponse·GlobalExceptionHandler
│       │   ├── industry/                               # 업종 데이터 도메인
│       │   │   ├── domain/Industry.java                # 업종 레코드
│       │   │   ├── repository/IndustryRepository.java  # 분포 JSON 로드/보관/리로드
│       │   │   ├── application/                        # IndustryService + dto(요약·메타)
│       │   │   ├── presentation/IndustryController.java# /meta·/industries·/admin/reload
│       │   │   └── exception/IndustryNotFoundException.java
│       │   └── rank/                                   # 상위 % 산출 도메인
│       │       ├── application/                        # RankService(핵심) + dto(요청·응답)
│       │       └── presentation/RankController.java    # POST /rank
│       ├── main/resources/data/industry_distributions.json   # 가공된 분포 데이터(동봉)
│       └── test/java/com/nyang/rank/application/RankServiceTest.java  # 계산 로직 단위 테스트
├── frontend/
│   └── src/App.jsx, api.js, styles.css                 # 입력 폼·결과·분포 차트·방법론 표시
└── pipeline/
    ├── collect_seoul_sales.py                          # Open API 전량 수집기
    ├── build_distributions.py                          # 분포 가공기 (구/신 스키마 모두 지원)
    ├── benchmarks.json                                 # 실태조사 벤치마크·업종 매핑
    ├── cron.example                                    # 분기별 자동 갱신 crontab 예시
    └── requirements.txt
```

## 7. 검증 내역

- `RankServiceTest` — 퍼센타일 역보간(선형·플랫 구간·경계값), 가중치 정규화, 적자 점포
  처리를 단위 테스트로 검증 (`./gradlew test`)
- Java 구현과 독립 작성한 Python 구현으로 동일 케이스를 교차 계산해 전 케이스 일치 확인
- 실데이터 스모크 테스트: 한식음식점, 월매출 2,500만·지출 1,900만
  → 매출 P61.4 / 순수익 P68.3 / 비용효율 54.4 → 종합 62.1점, **상위 37.9%**
- 실제 브라우저에서 전체 플로우(업종 선택→입력→결과 렌더링) 동작 확인
