# KB 금융상품 런타임 데이터 v4.0.3

## 팀에서 우선 사용하는 파일

- `catalog_runtime.json`: 전체 48개 상품 기준 데이터
- `recommendable_products.json`: 추천 엔진 사전후보 24개
- `source_registry.csv`: 공식 KB 출처와 판정 근거
- `validation_report.json`: 최종 검증 결과

## 검증·감사용 파일

- `catalog_audit.json`: 상품별 수집·판정 상세 근거
- `common_documents.json`: 공통·상품군·개별 상품 문서 30개의 통합 메타데이터
- `review_decisions.json`: 수동 검토 결정
- `correction_report.json`: v3부터 v4.0.3까지의 누적 수정 내역
- `validation_matrix.csv`: 48개 상품별 검증 결과
- `final_sha256.csv`: validation report를 포함한 패키지 파일별 무결성 해시
- `KB_catalog_v4_0_3_correction_report_20260721.md`: 최종 수정·재검토 요약

## 필드 해석

- `official_url`: 상품·서비스·연결계좌를 설명하는 공식 KB 페이지
- `application_url`: 현재 신규 신청·상담이 확인된 경우에만 제공
- `product_document_ids`: 해당 개별 상품에만 적용되는 특약·상품설명서
- `product_family_document_ids`: 복수 상품에 공통 적용되는 상품군 문서
- `common_document_ids`: 예금거래기본약관·여신거래기본약관 등 공통 문서

### application_mode

- `DIRECT_ONLINE`: 인터넷 또는 앱에서 직접 신청
- `DIRECT_MOBILE`: 모바일 중심 신청
- `ONLINE_OR_BRANCH`: 온라인 또는 영업점
- `BRANCH_OPENING`: 영업점 신규
- `CONSULTATION`: 상담 신청 후 진행
- `NOT_APPLICABLE`: 신규 신청 경로 없음

### application_channels

- `BRANCH`: 영업점
- `INTERNET_BANKING`: 인터넷뱅킹
- `KB_STAR_BANKING`: KB스타뱅킹
- `STAR_BUSINESS_BANKING`: 스타기업뱅킹
- `MOBILE`: 특정 앱을 단정하지 않는 모바일 신청·이용 채널
- `CUSTOMER_CENTER`: 고객센터

### recommendation_role

- `DIRECT_CANDIDATE`: 추천 로직 사전후보
- `COMPANION_ACCOUNT`: 함께 제안할 수 있는 보조계좌
- `REQUIRED_LINKED_ACCOUNT`: 특정 상품 이용에 필요한 연결계좌
- `HOLDING_ANALYSIS_ONLY`: 기존 보유상품 분석 전용
- `NOT_CURRENTLY_RECOMMENDABLE`: 현재 신규 추천 근거가 부족하거나 직접 추천 정책에서 제외된 상품
- `EXPANSION_REFERENCE`: 향후 범위 확장 또는 관련 서비스 설명을 위한 참고 항목
- `EXCLUDED_GENERAL`: 일반 추천에서 명시적으로 제외

### 추천 후보 정책

추천 후보는 다음 조건을 모두 만족해야 합니다.

- `availability_status`가 `AVAILABLE_APPLY` 또는 `AVAILABLE_CONSULT`
- `inclusion_level`이 `core`, `conditional`, `conditional_industry_only` 중 하나
- `recommendation_role`이 반드시 `DIRECT_CANDIDATE`
- 제외 역할에는 `NOT_CURRENTLY_RECOMMENDABLE`을 포함한 모든 비직접추천 역할이 포함됨

## 문서 메타데이터

- `mapping_status`: `VERIFIED`
- `mapping_reviewed_version`: 매핑을 마지막으로 검증한 패키지 버전
- `mapping_reviewed_at`: 매핑 검증 시각
- `bytes`: 정수 또는 `null`
- `captured_from_seed`: 문자열 또는 `null`

상품군·개별 상품 문서의 원본 파일 크기나 수집 seed가 패키지에 남지 않은 경우
`bytes`와 `captured_from_seed`는 `null`일 수 있습니다.

## source_registry.csv 스키마

- `product_id`: 항상 단일 상품 ID만 사용합니다. 공통 문서는 빈 값입니다.
- `scope`
  - `PRODUCT`: 개별 상품 근거
  - `PRODUCT_FAMILY`: 복수 상품에 공통 적용되는 근거
  - `COMMON`: 상품군 전체에 적용되는 공통 문서
- `applicable_product_ids`: 해당 근거가 적용되는 상품 ID의 JSON 배열
- 복수 상품 문서는 상품별로 한 행씩 분리되며 같은 `applicable_product_ids` 배열을 가집니다.

## 해시와 무결성 구조

- `validation_report.json`은 최종 확정된 콘텐츠 파일의 해시를 검증합니다.
- 자기참조를 방지하기 위해 `validation_report.json`은 자기 자신의 해시를 내부에 저장하지 않습니다.
- `final_sha256.csv`가 `validation_report.json`을 포함한 모든 패키지 파일을 검증합니다.
- `final_sha256.csv`는 자기 자신의 해시를 포함하지 않습니다.
- ZIP 전체 해시는 ZIP 외부의 `.zip.sha256` 사이드카 파일에서 제공합니다.

## 검증 요약

- 전체 상품: 48개
- 현재 신규 신청·상담 가능: 36개
- 직접 추천 사전후보: 24개
- 공식 수동 재검토: 18개
- 문서 메타데이터: 30개
  - 공통 문서: 7개
  - 상품군 문서: 3개
  - 개별 상품 문서: 20개
- source registry: 281행
- 상품별 validation matrix: 48/48 PASS
- 패키지 수준 검증 오류: 0개
- 최종 인계 가능: true

## v4.0.3 핵심 보정

1. validation report 내부의 오래된 파일 해시 제거 및 최종 해시 재계산
2. validation report 자기참조 해시 구조 제거
3. README의 누적 수정 버전 문구 정정
4. 추천 후보의 `DIRECT_CANDIDATE` 필수 역할 조건 추가
5. `NOT_CURRENTLY_RECOMMENDABLE`을 추천 제외 역할에 추가
6. 문서 매핑 상태와 검증 버전을 별도 필드로 분리
7. 패키지 수준 문서·정책·해시 회귀검사 추가

## 주의

추천 후보에 포함되어도 개인별 승인·가입을 보장하지 않습니다.
실제 승인 여부, 적용금리, 한도, 보증 가능 여부는 별도 심사 또는 사용자 자격 확인이 필요합니다.
상품 판매상태와 공개조건은 KB 공식 페이지 변경 이후 달라질 수 있으므로 운영 중 정기 갱신이 필요합니다.
