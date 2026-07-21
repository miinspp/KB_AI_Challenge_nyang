package com.nyang.industry.domain;

/**
 * 업종 그룹별 비용구조 벤치마크 — public_benchmarks.json 의 groups 항목.
 * 소상공인실태조사(2023 영업비용) + 중기부 보도자료(매출·이익)에서 유도한
 * 원가율/인건비율/임차료율 실측 평균. RankService 비용구조 축의 기준선으로 쓴다.
 *
 * 비율은 모두 연간 금액 ÷ 연간 매출 (0~1).
 */
public record CostBenchmark(
        String industryLabel,
        double operatingMargin,   // 영업이익률
        double purchaseRatio,     // 원가율 (매출원가 ÷ 매출)
        double laborRatio,        // 인건비율 (급여총액 ÷ 매출)
        double rentRatio,         // 임차료율 (임차료 ÷ 매출)
        Integer monthlyRentManwon // 임차 기업체 평균 월세(만원), 참고
) {}
