package com.nyang.reco.domain;

import java.util.List;

/**
 * 추천 후보 항목 — 파이프라인(enrich_recommendables.py)이 정책 공고·KB상품을
 * 공통 스키마로 정규화하고 키워드·임베딩·3줄 요약을 붙인 결과.
 * source: "policy"(정책·지원제도) | "kb_product"(KB 금융상품)
 * embedding: ko-sroberta 768차원 정규화 벡터 (코사인 = 내적)
 */
public record RecoItem(
        String itemId,
        String source,
        String title,
        String summary,
        String category,
        List<String> supportTypes,
        boolean isFinance,
        boolean isOpen,
        String deadline,          // "YYYY-MM-DD" 또는 null(상시)
        String region,            // "전국" 또는 지역명
        Integer maxBizAge,        // 업력 요건(년) — null 이면 제한 없음
        Integer maxAmountManwon,
        String agency,
        String url,
        List<String> keywords,
        String summaryShort,      // "지원:/대상:/신청:" 3줄 요약 (파인튜닝 KoBART 생성)
        double[] embedding
) {}
