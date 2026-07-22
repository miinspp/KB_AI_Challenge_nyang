package com.nyang.industry.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nyang.industry.domain.CostBenchmark;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * public_benchmarks.json(파이프라인 collect_public_benchmarks.py 산출물)의
 * 업종 그룹별 비용구조 벤치마크를 로드한다. 파일이 없으면 비어 있는 상태로 두어
 * 비용구조 축이 기존(일반 경험칙)으로 자연스럽게 폴백되도록 한다(선택적 강화).
 */
@Repository
public class CostBenchmarkRepository {
    private static final Logger log = LoggerFactory.getLogger(CostBenchmarkRepository.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private volatile Map<String, CostBenchmark> byGroup = Map.of();
    private volatile Map<String, Double> areaRentMultiplier = Map.of();  // 상권유형 → 임차료율 보정 배수
    private volatile JsonNode meta;

    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("data/public_benchmarks.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);
            Map<String, CostBenchmark> m = new LinkedHashMap<>();
            JsonNode groups = root.get("groups");
            if (groups != null) {
                groups.fields().forEachRemaining(e -> {
                    JsonNode g = e.getValue();
                    JsonNode cs = g.get("costStructure");
                    JsonNode tn = g.get("tenancy");
                    m.put(e.getKey(), new CostBenchmark(
                            g.path("industryLabel").asText(""),
                            g.path("operatingMargin").asDouble(0),
                            cs.path("purchaseRatio").asDouble(0),
                            cs.path("laborRatio").asDouble(0),
                            cs.path("rentRatio").asDouble(0),
                            tn != null && tn.has("monthlyRentManwon") ? tn.get("monthlyRentManwon").asInt() : null));
                });
            }
            Map<String, Double> mult = new LinkedHashMap<>();
            JsonNode adj = root.path("rentAdjustment").path("areaTypeRentMultiplier");
            if (adj.isObject()) {
                adj.fields().forEachRemaining(e -> mult.put(e.getKey(), e.getValue().asDouble()));
            }
            this.byGroup = Map.copyOf(m);
            this.areaRentMultiplier = Map.copyOf(mult);
            this.meta = root.get("meta");
            log.info("비용구조 벤치마크 {}개 그룹, 상권유형 임대료 보정 {}종 로드", m.size(), mult.size());
        } catch (Exception e) {
            log.warn("public_benchmarks.json 로드 실패 — 비용구조 축은 일반 경험칙으로 동작합니다: {}", e.getMessage());
            this.byGroup = Map.of();
            this.areaRentMultiplier = Map.of();
        }
    }

    public Optional<CostBenchmark> find(String group) {
        return Optional.ofNullable(byGroup.get(group));
    }

    /** 상권유형별 임차료율 지역 보정 배수(골목=1.0). 없으면 null. */
    public Double areaRentMultiplier(String areaType) {
        return areaType == null ? null : areaRentMultiplier.get(areaType);
    }

    public boolean isEmpty() {
        return byGroup.isEmpty();
    }

    public JsonNode meta() {
        return meta;
    }
}
