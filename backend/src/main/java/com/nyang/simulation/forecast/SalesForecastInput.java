package com.nyang.simulation.forecast;

import java.math.BigDecimal;
import java.util.List;

public record SalesForecastInput(
        List<BigDecimal> monthlySales,
        int horizonMonths,
        double maximumMonthlyTrendRatio,
        double volatility,
        String industryCode,
        String region
) {}
