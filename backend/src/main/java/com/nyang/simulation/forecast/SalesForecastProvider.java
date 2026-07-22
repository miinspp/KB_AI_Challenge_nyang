package com.nyang.simulation.forecast;

public interface SalesForecastProvider {
    SalesForecast forecast(SalesForecastInput input);
}
