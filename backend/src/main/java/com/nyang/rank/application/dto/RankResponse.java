package com.nyang.rank.application.dto;

import java.util.List;
import java.util.Map;

/** 순위 산출 결과. percentile: 0~100 (높을수록 상위), topPercent = 100 - percentile. */
public record RankResponse(
        String industryCode,
        String industryName,
        String benchmarkGroupLabel,
        double compositeScore,
        double topPercent,
        Component sales,
        Component profit,
        MarginComponent margin,
        CostHealth costHealth,     // 비용 구조 축 (costBreakdown.rent 제공 시, 아니면 null)
        Stability stability,       // 매출 안정성 축 (salesHistory 3개월 이상 제공 시, 아니면 null)
        Map<String, Double> weightsUsed,
        Peer peer,
        AreaRank areaRank,
        List<String> notes
) {
    /** 실측 분포 기반 구성요소 (매출, 순수익) */
    public record Component(double value, double percentile, double topPercent,
                            double peerMedian, double peerP25, double peerP75) {}

    /** 벤치마크 대비 휴리스틱 점수 (비용 효율 = 영업이익률) */
    public record MarginComponent(double value, double benchmark, double score) {}

    /**
     * 비용 구조 건전성 — 임대료 부담률(임대료÷매출) 기반 점수.
     * 10% 이하 건전 경험칙: 부담률 10% 이하 100점, 25% 이상 0점 (선형).
     * laborRatio/purchaseRatio 는 점수에 반영하지 않는 참고 지표 (업종별 기준 분포 데이터 부재).
     */
    public record CostHealth(double rentBurden, Double laborRatio, Double purchaseRatio, double score) {}

    /**
     * 매출 안정성 — 최근 월별 매출의 추세와 변동성.
     *  trendPerMonth   : 월평균 성장률 (OLS 기울기 ÷ 평균, ±5%/월에서 점수 포화)
     *  volatility      : 변동계수 CV = 표준편차 ÷ 평균 (5% 이하 안정 ~ 30% 이상 불안정)
     *  score = trendScore·volatilityScore 50:50 합산
     */
    public record Stability(int months, double trendPerMonth, double volatility,
                            double trendScore, double volatilityScore, double score) {}

    /** 동종 업종 참고 정보 */
    public record Peer(int nAreas, int nStores, double medianMonthlySales) {}

    /** 동일 상권유형(골목/발달/전통시장) 내 보조 순위. 요청에 areaType 이 없거나 표본 미달이면 null. */
    public record AreaRank(String areaType, double compositeScore, double topPercent,
                           double salesPercentile, double salesTopPercent,
                           int nAreas, int nStores, double peerMedian) {}
}
