package com.nyang.industry.application.dto;

import com.nyang.industry.domain.Industry;

import java.util.List;

/** 업종 선택 UI용 요약 정보. */
public record IndustrySummaryResponse(
        String code,
        String name,
        String group,
        String groupLabel,
        int nStores,
        double medianMonthlySales,
        List<String> areaTypes   // 상권유형 비교가 가능한 유형 목록 (선택 UI용)
) {
    public static IndustrySummaryResponse from(Industry i) {
        List<String> types = i.areaTypes() == null ? List.of() : List.copyOf(i.areaTypes().keySet());
        return new IndustrySummaryResponse(
                i.code(), i.name(), i.group(), i.groupLabel(), i.nStores(), i.medianMonthlySales(), types);
    }
}
