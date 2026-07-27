package com.nyang.simulation.forecast;

import java.math.BigDecimal;
import java.util.List;

public record SalesForecastInput(
        List<BigDecimal> monthlySales,
        int horizonMonths,
        double maximumMonthlyTrendRatio,
        double volatility,
        String industryCode,
        String region,
        List<String> monthlySalesMonths
) {
    public SalesForecastInput(List<BigDecimal> monthlySales, int horizonMonths,
                              double maximumMonthlyTrendRatio, double volatility,
                              String industryCode, String region) {
        this(monthlySales, horizonMonths, maximumMonthlyTrendRatio, volatility,
                industryCode, region, null);
    }
}
