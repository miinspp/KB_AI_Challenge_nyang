package com.nyang.reco.application.dto;

import java.util.List;

/**
 * 추천 결과 — 정책·지원제도와 KB 금융상품을 분리해 반환.
 *  profileSignals : 프로필 벡터 합성에 사용된 진단 신호 설명 (UI 배지용)
 *  score          : 프로필-항목 코사인 유사도 (0~1, 규칙 감점 반영)
 *  reason         : 가장 강하게 매칭된 니즈 앵커 기반 추천 사유
 */
public record RecommendResponse(
        List<String> profileSignals,
        List<Item> policies,
        List<Item> products
) {
    public record Item(
            String id,
            String source,
            String title,
            String agency,
            String category,
            List<String> keywords,
            String summaryShort,
            Integer maxAmountManwon,
            String deadline,
            String url,
            double score,
            String reason
    ) {}
}
