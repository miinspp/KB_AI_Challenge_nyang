package com.nyang.industry.application.dto;

import com.nyang.industry.domain.Industry;

/** 업종 선택 UI용 요약 정보. */
public record IndustrySummaryResponse(
        String code,
        String name,
        String group,
        String groupLabel,
        int nStores,
        double medianMonthlySales
) {
    public static IndustrySummaryResponse from(Industry i) {
        return new IndustrySummaryResponse(
                i.code(), i.name(), i.group(), i.groupLabel(), i.nStores(), i.medianMonthlySales());
    }
}
