package com.nyang.simulation.forecast;

import java.math.BigDecimal;
import java.util.List;

public record SalesForecast(
        List<MonthlyForecast> months,
        String provider,
        String modelVersion,
        String dataSource,
        boolean fallback
) {
    public SalesForecast {
        if (months == null || months.isEmpty()) {
            throw new IllegalArgumentException("매출 예측 결과가 비어 있습니다.");
        }
        for (MonthlyForecast point : months) {
            if (point.p10().signum() < 0 || point.p50().signum() < 0 || point.p90().signum() < 0) {
                throw new IllegalArgumentException("매출 예측값은 음수일 수 없습니다.");
            }
            if (point.p10().compareTo(point.p50()) > 0 || point.p50().compareTo(point.p90()) > 0) {
                throw new IllegalArgumentException("매출 예측 분위수는 P10 <= P50 <= P90 순서여야 합니다.");
            }
        }
        months = List.copyOf(months);
    }

    public record MonthlyForecast(int month, BigDecimal p10, BigDecimal p50, BigDecimal p90) {}
}
