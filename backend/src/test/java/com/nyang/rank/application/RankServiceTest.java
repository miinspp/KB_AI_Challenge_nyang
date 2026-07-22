package com.nyang.rank.application;

import com.nyang.industry.domain.CostBenchmark;
import com.nyang.industry.domain.Industry;
import com.nyang.rank.application.dto.RankRequest;
import com.nyang.rank.application.dto.RankResponse;
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
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // 매출 500만(=P50), 지출 389.65만 → 순수익 110.35만 = 500만*0.2207 → 유도분포 P50, 이익률 = 벤치마크 → 50점
        RankRequest req = new RankRequest("CS100001", 5_000_000, 3_896_500, null, null);
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
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // 매출 100% 가중치 → 종합 = 매출 퍼센타일
        RankRequest req = new RankRequest("CS100001", 8_000_000, 8_000_000, null,
                new RankRequest.Weights(2, 0, 0));
        RankResponse res = svc.rank(ind, req);
        assertEquals(res.sales().percentile(), res.compositeScore(), 1e-9);
        assertEquals(1.0, res.weightsUsed().get("sales"), 1e-9);
    }

    @Test
    void area_type_rank_uses_area_distribution() {
        // 골목상권 격자 = 전체 격자 × 0.5 → 같은 매출이면 골목상권 내 퍼센타일이 더 높아야 함
        List<Double> alley = linearGrid().stream().map(x -> x * 0.5).toList();
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(),
                java.util.Map.of("골목상권", new Industry.AreaTypeDist(920, 16256, 2_500_000, alley)));
        RankRequest req = new RankRequest("CS100001", 5_000_000, 3_896_500, "골목상권", null);
        RankResponse res = svc.rank(ind, req);
        assertNotNull(res.areaRank());
        assertEquals("골목상권", res.areaRank().areaType());
        assertEquals(100.0, res.areaRank().salesPercentile(), 1e-9); // 500만 = 골목 격자 최댓값
        assertTrue(res.areaRank().compositeScore() > res.compositeScore());
        assertTrue(res.notes().stream().anyMatch(n -> n.contains("상권유형 비교")));
    }

    @Test
    void area_type_absent_or_unknown_yields_null_area_rank() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // areaType 미지정 → null
        assertNull(svc.rank(ind, new RankRequest("CS100001", 5_000_000, 0, null, null)).areaRank());
        // 표본 없는 유형 지정 → null + 안내 note
        RankResponse res = svc.rank(ind, new RankRequest("CS100001", 5_000_000, 0, "관광특구", null));
        assertNull(res.areaRank());
        assertTrue(res.notes().stream().anyMatch(n -> n.contains("표본 상권이 부족")));
    }

    @Test
    void negative_profit_lands_at_bottom() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        RankRequest req = new RankRequest("CS100001", 3_000_000, 5_000_000, null, null);
        RankResponse res = svc.rank(ind, req);
        assertEquals(0.0, res.profit().percentile(), 1e-9);
        assertEquals(0.0, res.margin().score(), 1e-9);
    }

    // ── v2 보정축 ──────────────────────────────────────────────

    @Test
    void rent_burden_score_encodes_ten_percent_rule() {
        assertEquals(100.0, svc.rentBurdenScore(0.05), 1e-9);   // 10% 이하 → 만점
        assertEquals(100.0, svc.rentBurdenScore(0.10), 1e-9);
        assertEquals(50.0, svc.rentBurdenScore(0.175), 1e-9);   // 중간
        assertEquals(0.0, svc.rentBurdenScore(0.25), 1e-9);     // 25% 이상 → 0점
        assertEquals(0.0, svc.rentBurdenScore(0.40), 1e-9);
    }

    @Test
    void trend_and_volatility_score_mapping() {
        assertEquals(50.0, svc.trendScore(0.0), 1e-9);          // 성장률 0 → 중립
        assertEquals(100.0, svc.trendScore(0.05), 1e-9);        // +5%/월 → 포화
        assertEquals(0.0, svc.trendScore(-0.05), 1e-9);
        assertEquals(75.0, svc.trendScore(0.025), 1e-9);
        assertEquals(100.0, svc.volatilityScore(0.05), 1e-9);   // CV 5% 이하 → 만점
        assertEquals(0.0, svc.volatilityScore(0.30), 1e-9);
        assertEquals(50.0, svc.volatilityScore(0.175), 1e-9);
    }

    @Test
    void v2_composite_blends_extras_and_stays_v1_without_them() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // 기본 3축이 전부 50이 되는 시나리오 (기존 rank_composite 테스트와 동일)
        double sales = 5_000_000, expense = 3_896_500;

        // 보정 없음 → v1 그대로 50점
        RankResponse v1 = svc.rank(ind, new RankRequest("CS100001", sales, expense, null, null));
        assertEquals(50.0, v1.compositeScore(), 0.05);
        assertNull(v1.costHealth());
        assertNull(v1.stability());

        // 임대료 50만(부담률 10% → 100점) + 평탄한 6개월 매출(성장 0 → 50, CV 0 → 100 ⇒ 안정성 75)
        var cb = new RankRequest.CostBreakdown(null, null, 500_000.0, null);
        var history = java.util.stream.IntStream.range(0, 6)
                .mapToObj(i -> new RankRequest.MonthlyAmount("2026-0" + (i + 1), sales)).toList();
        RankResponse v2 = svc.rank(ind, new RankRequest("CS100001", sales, expense, null, null, cb, history));

        assertNotNull(v2.costHealth());
        assertEquals(0.10, v2.costHealth().rentBurden(), 1e-9);
        assertEquals(100.0, v2.costHealth().score(), 1e-9);
        assertNotNull(v2.stability());
        assertEquals(6, v2.stability().months());
        assertEquals(75.0, v2.stability().score(), 1e-9);
        // 종합 = 0.7×50 + 0.15×100 + 0.15×75 = 61.25
        assertEquals(61.3, v2.compositeScore(), 0.05);
        assertEquals(38.8, v2.topPercent(), 0.05);
        // 가중치 재배분: sales 0.5×0.7 = 0.35
        assertEquals(0.35, v2.weightsUsed().get("sales"), 1e-9);
        assertEquals(0.15, v2.weightsUsed().get("cost"), 1e-9);
        assertEquals(0.15, v2.weightsUsed().get("stability"), 1e-9);
        assertTrue(v2.notes().stream().anyMatch(n -> n.contains("임대료 부담률")));
        assertTrue(v2.notes().stream().anyMatch(n -> n.contains("매출 안정성")));
    }

    @Test
    void extras_skipped_without_required_inputs() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // rent 없는 breakdown → 비용 축 미산출, 2개월 이력 → 안정성 축 미산출
        var cb = new RankRequest.CostBreakdown(1_000_000.0, 500_000.0, null, null);
        var shortHistory = List.of(
                new RankRequest.MonthlyAmount("2026-05", 5_000_000.0),
                new RankRequest.MonthlyAmount("2026-06", 5_000_000.0));
        RankResponse res = svc.rank(ind,
                new RankRequest("CS100001", 5_000_000, 3_896_500, null, null, cb, shortHistory));
        assertNull(res.costHealth());
        assertNull(res.stability());
        assertEquals(50.0, res.compositeScore(), 0.05); // v1 과 동일
        assertFalse(res.weightsUsed().containsKey("cost"));
    }

    @Test
    void cost_ratio_score_vs_benchmark() {
        // 벤치마크와 같으면 50, 절반이면 75, 2배면 0
        assertEquals(50.0, svc.costRatioScore(0.10, 0.10), 1e-9);
        assertEquals(75.0, svc.costRatioScore(0.05, 0.10), 1e-9);
        assertEquals(0.0, svc.costRatioScore(0.20, 0.10), 1e-9);
        assertEquals(100.0, svc.costRatioScore(0.0, 0.10), 1e-9);
        assertEquals(50.0, svc.costRatioScore(0.10, 0.0), 1e-9); // 벤치마크 없으면 중립 50
    }

    @Test
    void cost_health_uses_industry_benchmark_when_provided() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // 숙박·음식점 벤치마크: 임차료율 9.3% · 인건비율 15.9% · 원가율 46.4%
        CostBenchmark bm = new CostBenchmark("숙박 및 음식점업", 0.2119, 0.4636, 0.1589, 0.0927, 102);
        // 매출 500만 · 임대료 46.35만(부담률 9.27% = 벤치마크와 동일 → 50점만)
        var cb = new RankRequest.CostBreakdown(null, null, 463_500.0, null);
        RankResponse res = svc.rank(ind,
                new RankRequest("CS100001", 5_000_000, 0, null, null, cb, null), bm);
        assertNotNull(res.costHealth());
        assertNotNull(res.costHealth().benchmark());
        assertEquals("숙박 및 음식점업", res.costHealth().benchmark().industryLabel());
        assertEquals(0.0927, res.costHealth().benchmark().rentRatio(), 1e-4);
        assertEquals(50.0, res.costHealth().score(), 0.2); // 임차료율만, 벤치마크와 동일 → ~50
        assertTrue(res.notes().stream().anyMatch(n -> n.contains("소상공인실태조사") && n.contains("업종 평균")));

        // 벤치마크 없이 같은 입력 → 경험칙(9.27% → 만점에 가까움)
        RankResponse flat = svc.rank(ind,
                new RankRequest("CS100001", 5_000_000, 0, null, null, cb, null));
        assertNull(flat.costHealth().benchmark());
        assertTrue(flat.costHealth().score() > 95); // 10% 이하 → 100점 근처
    }

    @Test
    void area_rent_multiplier_adjusts_rent_benchmark() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(),
                java.util.Map.of("발달상권", new Industry.AreaTypeDist(100, 5000, 2_500_000, linearGrid())));
        CostBenchmark bm = new CostBenchmark("숙박 및 음식점업", 0.2119, 0.4636, 0.1589, 0.0927, 102);
        // 임차료율 9.27% (= 전국 벤치마크와 동일)
        var cb = new RankRequest.CostBreakdown(null, null, 463_500.0, null);

        // 발달상권 선택 + 보정 배수 1.0743 → 벤치마크가 9.27%→9.96%로 올라가 같은 부담률이 더 후하게 채점
        RankResponse dev = svc.rank(ind,
                new RankRequest("CS100001", 5_000_000, 0, "발달상권", null, cb, null), bm, 1.0743);
        assertNotNull(dev.costHealth().benchmark().rentRatioAdjusted());
        assertEquals("발달상권", dev.costHealth().benchmark().areaType());
        assertEquals(0.0996, dev.costHealth().benchmark().rentRatioAdjusted(), 1e-3);
        assertTrue(dev.costHealth().score() > 50, "발달상권 보정으로 50점 초과: " + dev.costHealth().score());
        assertTrue(dev.notes().stream().anyMatch(n -> n.contains("발달상권 보정") && n.contains("한국부동산원")));

        // 지역 보정 없이(서울 전체) 같은 입력 → 벤치마크와 동일 → 정확히 50점, 조정 필드 null
        RankResponse plain = svc.rank(ind,
                new RankRequest("CS100001", 5_000_000, 0, null, null, cb, null), bm, 1.0743);
        assertNull(plain.costHealth().benchmark().rentRatioAdjusted());
        assertEquals(50.0, plain.costHealth().score(), 0.2);
    }

    @Test
    void stability_detects_growth_and_volatility() {
        Industry ind = new Industry("CS100001", "한식음식점", "food", "숙박·음식점업",
                0.2207, 1444, 38233, 5_000_000, 5_000_000, linearGrid(), null);
        // 매달 +5% 성장하는 매출 (기하 성장 ≈ 월 5% 기울기) → 추세 점수 상단
        List<RankRequest.MonthlyAmount> growing = new ArrayList<>();
        double v = 4_000_000;
        for (int i = 0; i < 6; i++) { growing.add(new RankRequest.MonthlyAmount("2026-0" + (i + 1), v)); v *= 1.05; }
        RankResponse res = svc.rank(ind,
                new RankRequest("CS100001", 5_000_000, 0, null, null, null, growing));
        assertNotNull(res.stability());
        assertTrue(res.stability().trendPerMonth() > 0.04, "성장률 " + res.stability().trendPerMonth());
        assertTrue(res.stability().trendScore() > 90);
        assertTrue(res.stability().volatilityScore() > 50); // 완만한 성장의 CV 는 크지 않음
    }
}
