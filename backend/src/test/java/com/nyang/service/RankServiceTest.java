package com.nyang.service;

import com.nyang.model.Industry;
import com.nyang.model.RankRequest;
import com.nyang.model.RankResponse;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RankServiceTest {

    private final RankService svc = new RankService();

    /** q[i] = i * 100_000 (0원 ~ 1,000만원 선형 격자) */
    private List<Double> linearGrid() {
        List<Double> q = new ArrayList<>();
        for (int i = 0; i <= 100; i++) q.add(i * 100_000.0);
        return q;
    }

    @Test
    void percentile_linear_grid_interpolates_exactly() {
        List<Double> q = linearGrid();
        assertEquals(50.0, svc.percentileOf(q, 5_000_000), 1e-9);
        assertEquals(25.5, svc.percentileOf(q, 2_550_000), 1e-9);
        assertEquals(0.0, svc.percentileOf(q, -10), 1e-9);
        assertEquals(0.0, svc.percentileOf(q, 0), 1e-9);
        assertEquals(100.0, svc.percentileOf(q, 999_999_999), 1e-9);
    }

    @Test
    void percentile_flat_region_returns_midpoint() {
        List<Double> q = new ArrayList<>();
        for (int i = 0; i <= 100; i++) q.add(i < 40 ? 1000.0 * i : (i < 60 ? 40_000.0 : 1000.0 * i));
        // 값 40_000 은 인덱스 40~59 에 걸친 플랫 구간 → 중앙 49.5
        assertEquals(49.5, svc.percentileOf(q, 40_000.0), 1e-9);
    }

    @Test
    void margin_score_benchmark_mapping() {
        assertEquals(50.0, svc.marginScore(0.22, 0.22), 1e-9);
        assertEquals(100.0, svc.marginScore(0.50, 0.22), 1e-9); // 2배 이상 → 상한
        assertEquals(0.0, svc.marginScore(-0.1, 0.22), 1e-9);
        assertEquals(25.0, svc.marginScore(0.11, 0.22), 1e-9);
    }

    @Test
    void rank_composite_and_top_percent_consistent() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid());
        // 매출 500만(=P50), 지출 389.65만 → 순수익 110.35만 = 500만*0.2207 → 유도분포 P50, 이익률 = 벤치마크 → 50점
        RankRequest req = new RankRequest("CS100001", 5_000_000, 3_896_500, null);
        RankResponse res = svc.rank(ind, req);
        assertEquals(50.0, res.sales().percentile(), 0.01);
        assertEquals(50.0, res.profit().percentile(), 0.01);
        assertEquals(50.0, res.margin().score(), 0.01);
        assertEquals(50.0, res.compositeScore(), 0.05);
        assertEquals(50.0, res.topPercent(), 0.05);
        assertEquals(res.sales().topPercent(), 100 - res.sales().percentile(), 1e-9);
    }

    @Test
    void rank_custom_weights_normalized() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid());
        // 매출 100% 가중치 → 종합 = 매출 퍼센타일
        RankRequest req = new RankRequest("CS100001", 8_000_000, 8_000_000,
                new RankRequest.Weights(2, 0, 0));
        RankResponse res = svc.rank(ind, req);
        assertEquals(res.sales().percentile(), res.compositeScore(), 1e-9);
        assertEquals(1.0, res.weightsUsed().get("sales"), 1e-9);
    }

    @Test
    void negative_profit_lands_at_bottom() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid());
        RankRequest req = new RankRequest("CS100001", 3_000_000, 5_000_000, null);
        RankResponse res = svc.rank(ind, req);
        assertEquals(0.0, res.profit().percentile(), 1e-9);
        assertEquals(0.0, res.margin().score(), 1e-9);
    }
}
