package com.nyang.reco.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nyang.reco.domain.RecoItem;
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

/**
 * 파이프라인 산출물(reco/enriched_items.json)을 로드해 보관한다.
 *  - items   : 정책 37건 + KB상품 24건, 각각 키워드·3줄 요약·임베딩 포함
 *  - anchors : 니즈 앵커 문장의 사전계산 임베딩 — 런타임 모델 추론 없이
 *              진단 신호의 가중합만으로 프로필 벡터를 합성하기 위한 기반
 */
@Repository
public class RecoItemRepository {
    private static final Logger log = LoggerFactory.getLogger(RecoItemRepository.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private volatile List<RecoItem> items = List.of();
    private volatile Map<String, double[]> anchors = Map.of();

    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("data/reco/enriched_items.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);

            Map<String, double[]> a = new LinkedHashMap<>();
            JsonNode anchorsNode = root.get("anchors");
            anchorsNode.fieldNames().forEachRemaining(k -> a.put(k, toVector(anchorsNode.get(k))));

            List<RecoItem> list = new ArrayList<>();
            for (JsonNode n : root.get("items")) {
                list.add(new RecoItem(
                        n.get("item_id").asText(),
                        n.get("source").asText(),
                        n.get("title").asText(),
                        n.get("summary").asText(),
                        text(n, "category"),
                        toStrings(n.get("support_types")),
                        n.path("is_finance").asBoolean(false),
                        n.path("is_open").asBoolean(false),
                        text(n, "deadline"),
                        text(n, "region"),
                        intOrNull(n, "max_biz_age"),
                        intOrNull(n, "max_amount_manwon"),
                        text(n, "agency"),
                        text(n, "url"),
                        toStrings(n.get("keywords")),
                        text(n, "summary_short"),
                        toVector(n.get("embedding"))
                ));
            }
            this.items = List.copyOf(list);
            this.anchors = Map.copyOf(a);
            log.info("추천 후보 {}건 로드 완료 (앵커 {}개, 임베딩 {}차원)",
                    items.size(), anchors.size(), root.get("meta").get("dim").asInt());
        } catch (Exception e) {
            throw new IllegalStateException("추천 데이터 로드 실패", e);
        }
    }

    public List<RecoItem> all() {
        return items;
    }

    public Map<String, double[]> anchors() {
        return anchors;
    }

    private static double[] toVector(JsonNode arr) {
        double[] v = new double[arr.size()];
        for (int i = 0; i < arr.size(); i++) v[i] = arr.get(i).asDouble();
        return v;
    }

    private static List<String> toStrings(JsonNode arr) {
        if (arr == null || arr.isNull()) return List.of();
        List<String> out = new ArrayList<>();
        arr.forEach(x -> out.add(x.asText()));
        return List.copyOf(out);
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static Integer intOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asInt();
    }
}
