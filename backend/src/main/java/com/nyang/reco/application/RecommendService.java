package com.nyang.reco.application;

import com.nyang.reco.application.dto.RecommendRequest;
import com.nyang.reco.application.dto.RecommendResponse;
import com.nyang.reco.domain.RecoItem;
import com.nyang.reco.repository.RecoItemRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 임베딩 기반 추천 매칭.
 *
 * 진단 신호(상위 %·임대료 부담률·매출 추세·업력)를 니즈 앵커 임베딩의 가중합으로
 * 합성해 프로필 벡터를 만들고, 항목 임베딩과의 코사인 유사도로 랭킹한다.
 * 앵커·항목 임베딩은 파이프라인이 사전계산(ko-sroberta)하므로 런타임 모델 추론이 없다.
 *
 * 규칙 보정:
 *  - 하드 필터: 마감 경과, 지역 불일치, 업력 요건 초과(업력 입력 시)
 *  - 폐업·재기류 감점: 심각한 위기 신호(하위 25% + 매출 하락)가 없으면 -0.10
 *    (임베딩만으로는 "경영이 어렵다"와 "폐업 준비"가 구분되지 않는 약점 보완)
 */
@Service
public class RecommendService {

    private static final int TOP_POLICIES = 5;
    private static final int TOP_PRODUCTS = 3;
    private static final double CLOSURE_PENALTY = 0.10;
    private static final List<String> CLOSURE_TERMS = List.of("폐업", "재기", "재도전", "사업정리");

    private static final Map<String, String> ANCHOR_REASONS = Map.of(
            "tier_low", "매출 회복·경영안정이 필요한 신호와 맞는 지원이에요",
            "tier_mid", "경영 개선·매출 증대 니즈와 맞는 지원이에요",
            "tier_high", "상위권 성장 모멘텀에 맞는 지원이에요",
            "rent_burden", "임대료·고정비 부담 완화에 도움되는 지원이에요",
            "unstable_sales", "매출 하락 추세 방어에 맞는 지원이에요",
            "early_stage", "창업 초기 정착에 맞는 지원이에요",
            "funding_need", "자금 조달(대출·보증) 니즈와 맞는 지원이에요",
            "digital_sales", "온라인 판로·마케팅 확장에 맞는 지원이에요");

    private final RecoItemRepository repository;

    public RecommendService(RecoItemRepository repository) {
        this.repository = repository;
    }

    public RecommendResponse recommend(RecommendRequest req) {
        Map<String, Double> weights = anchorWeights(req);
        double[] profile = composeProfile(weights);
        boolean severeDistress = req.topPercent() >= 75
                && req.trendPerMonth() != null && req.trendPerMonth() < -0.005;
        LocalDate today = LocalDate.now();

        List<RecommendResponse.Item> scored = new ArrayList<>();
        for (RecoItem item : repository.all()) {
            if (!passesFilters(item, req, today)) continue;
            double score = dot(profile, item.embedding());
            if (!severeDistress && isClosureItem(item)) score -= CLOSURE_PENALTY;
            scored.add(toDto(item, score, bestAnchor(item, weights)));
        }
        scored.sort(Comparator.comparingDouble(RecommendResponse.Item::score).reversed());

        return new RecommendResponse(
                profileSignals(req),
                scored.stream().filter(i -> i.source().equals("policy")).limit(TOP_POLICIES).toList(),
                scored.stream().filter(i -> i.source().equals("kb_product")).limit(TOP_PRODUCTS).toList());
    }

    /** 진단 신호 → 앵커 가중치. 프로필 문장을 쓰는 대신 사전계산 앵커의 선형결합으로 표현한다. */
    private Map<String, Double> anchorWeights(RecommendRequest req) {
        Map<String, Double> w = new LinkedHashMap<>();
        double top = req.topPercent();
        if (top <= 30) {
            w.merge("tier_high", 1.0, Double::sum);
            w.merge("digital_sales", 0.4, Double::sum);   // 상위권은 성장·판로 확장 니즈
        } else if (top <= 60) {
            w.merge("tier_mid", 1.0, Double::sum);
        } else {
            w.merge("tier_low", 1.0, Double::sum);
            w.merge("funding_need", 0.4, Double::sum);    // 하위권은 자금 조달 니즈
        }
        if (req.rentBurden() != null && req.rentBurden() > 0.10) w.merge("rent_burden", 0.7, Double::sum);
        if (req.trendPerMonth() != null && req.trendPerMonth() < -0.005) w.merge("unstable_sales", 0.7, Double::sum);
        if (req.bizAgeYears() != null && req.bizAgeYears() <= 2) w.merge("early_stage", 0.7, Double::sum);

        for (String need : req.needsOrEmpty()) {
            switch (need) {
                case "funding" -> w.merge("funding_need", 0.8, Double::sum);
                case "cost" -> w.merge("rent_burden", 0.6, Double::sum);
                case "growth" -> { w.merge("tier_high", 0.5, Double::sum); w.merge("digital_sales", 0.3, Double::sum); }
                case "digital" -> w.merge("digital_sales", 0.8, Double::sum);
                case "consulting" -> w.merge("early_stage", 0.6, Double::sum);
                default -> { /* 알 수 없는 관심사는 무시 */ }
            }
        }
        return w;
    }

    private double[] composeProfile(Map<String, Double> weights) {
        Map<String, double[]> anchors = repository.anchors();
        int dim = anchors.values().iterator().next().length;
        double[] v = new double[dim];
        weights.forEach((key, w) -> {
            double[] a = anchors.get(key);
            if (a != null) for (int i = 0; i < dim; i++) v[i] += w * a[i];
        });
        double norm = Math.sqrt(dot(v, v));
        if (norm > 0) for (int i = 0; i < dim; i++) v[i] /= norm;
        return v;
    }

    private boolean passesFilters(RecoItem item, RecommendRequest req, LocalDate today) {
        if (!item.isOpen()) return false;
        if (item.deadline() != null) {
            try {
                if (LocalDate.parse(item.deadline()).isBefore(today)) return false;
            } catch (DateTimeParseException ignored) { /* 형식 불명 마감일은 필터하지 않음 */ }
        }
        if (item.maxBizAge() != null && req.bizAgeYears() != null
                && req.bizAgeYears() > item.maxBizAge()) return false;
        String region = item.region() == null ? "전국" : item.region();
        return region.equals("전국") || region.contains(req.regionOrDefault());
    }

    private static boolean isClosureItem(RecoItem item) {
        String text = item.title() + String.join(" ", item.keywords());
        return CLOSURE_TERMS.stream().anyMatch(text::contains);
    }

    /** 가중치가 실린 앵커 중 이 항목과 가장 유사한 것 — 추천 사유 생성에 사용. */
    private String bestAnchor(RecoItem item, Map<String, Double> weights) {
        String best = null;
        double bestSim = -1;
        for (String key : weights.keySet()) {
            double[] a = repository.anchors().get(key);
            if (a == null) continue;
            double sim = dot(a, item.embedding());
            if (sim > bestSim) { bestSim = sim; best = key; }
        }
        return best;
    }

    private List<String> profileSignals(RecommendRequest req) {
        List<String> signals = new ArrayList<>();
        double top = req.topPercent();
        signals.add(top <= 30 ? "업종 내 상위권" : top <= 60 ? "업종 내 중위권" : "업종 내 하위권");
        if (req.rentBurden() != null && req.rentBurden() > 0.10) signals.add("임대료 부담 과중");
        if (req.trendPerMonth() != null && req.trendPerMonth() < -0.005) signals.add("매출 하락 추세");
        if (req.bizAgeYears() != null && req.bizAgeYears() <= 2) signals.add("창업 초기");
        return signals;
    }

    private static RecommendResponse.Item toDto(RecoItem item, double score, String anchorKey) {
        return new RecommendResponse.Item(
                item.itemId(), item.source(), item.title(), item.agency(), item.category(),
                item.keywords(), item.summaryShort(), item.maxAmountManwon(), item.deadline(),
                item.url(), Math.round(score * 1000) / 1000.0,
                ANCHOR_REASONS.getOrDefault(anchorKey, "진단 결과와 유사도가 높은 지원이에요"));
    }

    private static double dot(double[] a, double[] b) {
        double s = 0;
        for (int i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    }
}
