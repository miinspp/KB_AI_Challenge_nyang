package com.nyang.reco.application.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 추천 요청 — /api/rank 결과의 신호를 그대로 넘긴다.
 *  topPercent    : 종합 상위 % (필수, 낮을수록 상위)
 *  rentBurden    : 임대료/매출 비율 (선택, 0.14 = 14%. costHealth.rentBurden)
 *  trendPerMonth : 월평균 매출 성장률 (선택, 음수 = 하락. stability.trendPerMonth)
 *  bizAgeYears   : 업력(년) — 있으면 정책 업력요건(max_biz_age) 필터 적용
 *  region        : 기본 "서울"
 *  needs         : 사용자가 직접 고른 관심사 (funding|cost|growth|digital|consulting)
 */
public record RecommendRequest(
        @NotNull Double topPercent,
        Double rentBurden,
        Double trendPerMonth,
        Integer bizAgeYears,
        String region,
        List<String> needs
) {
    public String regionOrDefault() {
        return region == null || region.isBlank() ? "서울" : region;
    }

    public List<String> needsOrEmpty() {
        return needs == null ? List.of() : needs;
    }
}
