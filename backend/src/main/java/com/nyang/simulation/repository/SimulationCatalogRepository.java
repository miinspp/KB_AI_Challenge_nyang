package com.nyang.simulation.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 서울시 정책 데이터와 KB 금융상품 데이터를 시뮬레이션 메타데이터로 로드한다. */
@Repository
public class SimulationCatalogRepository {
    private static final Logger log = LoggerFactory.getLogger(SimulationCatalogRepository.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private volatile Map<String, CatalogItem> kbProducts = Map.of();
    private volatile Map<String, CatalogItem> seoulPolicies = Map.of();

    @PostConstruct
    public void load() {
        try {
            this.kbProducts = Map.copyOf(loadKbProducts());
            this.seoulPolicies = Map.copyOf(loadSeoulPolicies());
            log.info("시뮬레이션 카탈로그 로드 완료: KB 상품 {}개, 서울시 정책 {}개",
                    kbProducts.size(), seoulPolicies.size());
        } catch (Exception e) {
            throw new IllegalStateException("시뮬레이션 카탈로그 로드 실패", e);
        }
    }

    public Optional<CatalogItem> find(String sourceType, String id) {
        if (sourceType == null || id == null || id.isBlank()) {
            return Optional.empty();
        }
        return switch (sourceType.toUpperCase()) {
            case "KB_PRODUCT" -> Optional.ofNullable(kbProducts.get(id));
            case "SEOUL_POLICY" -> Optional.ofNullable(seoulPolicies.get(id));
            default -> Optional.empty();
        };
    }

    private Map<String, CatalogItem> loadKbProducts() throws Exception {
        try (InputStream in = new ClassPathResource("data/kb-products/recommendable_products.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);
            Map<String, CatalogItem> result = new LinkedHashMap<>();
            for (JsonNode n : root.path("products")) {
                String id = text(n, "product_id");
                result.put(id, new CatalogItem(
                        "KB_PRODUCT",
                        id,
                        text(n, "product_name"),
                        text(n, "category"),
                        text(n, "summary"),
                        text(n, "official_url"),
                        text(n, "application_url"),
                        text(n, "availability_status"),
                        text(n, "application_mode"),
                        list(n.path("application_channels")),
                        List.of(),
                        null,
                        text(n, "public_conditions_summary")
                ));
            }
            return result;
        }
    }

    private Map<String, CatalogItem> loadSeoulPolicies() throws Exception {
        try (InputStream in = new ClassPathResource("data/seoul_policies_enriched.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);
            Map<String, CatalogItem> result = new LinkedHashMap<>();
            for (JsonNode n : root) {
                String id = text(n, "id");
                Double maxAmountWon = n.path("max_amount_manwon").isNumber()
                        ? n.path("max_amount_manwon").asDouble() * 10_000.0
                        : null;
                result.put(id, new CatalogItem(
                        "SEOUL_POLICY",
                        id,
                        text(n, "title"),
                        text(n, "category"),
                        text(n, "summary"),
                        text(n, "url"),
                        text(n, "url"),
                        n.path("is_open").asBoolean(false) ? "AVAILABLE_APPLY" : "CLOSED",
                        "POLICY_APPLICATION",
                        List.of(text(n, "apply_method")),
                        list(n.path("support_types")),
                        maxAmountWon,
                        "region=" + text(n, "region") + "; deadline=" + text(n, "deadline")
                ));
            }
            return result;
        }
    }

    private static String text(JsonNode n, String field) {
        JsonNode value = n.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText();
    }

    private static List<String> list(JsonNode n) {
        if (!n.isArray()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (JsonNode item : n) {
            if (!item.isNull()) {
                result.add(item.asText());
            }
        }
        return List.copyOf(result);
    }

    public record CatalogItem(
            String sourceType,
            String id,
            String name,
            String category,
            String summary,
            String sourceUrl,
            String applicationUrl,
            String availabilityStatus,
            String applicationMode,
            List<String> channels,
            List<String> supportTypes,
            Double maxAmountWon,
            String conditionSummary
    ) {}
}
