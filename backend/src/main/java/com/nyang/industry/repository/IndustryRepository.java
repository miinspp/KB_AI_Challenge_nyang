package com.nyang.industry.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nyang.industry.domain.Industry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 파이프라인 산출물(industry_distributions.json)을 로드해 보관한다.
 * 기본은 클래스패스 리소스, 운영 중 크론 갱신을 반영하려면
 * app.data-file 프로퍼티(또는 DATA_FILE 환경변수)로 외부 파일 경로를 지정하고
 * POST /api/admin/reload 를 호출한다.
 */
@Repository
public class IndustryRepository {
    private static final Logger log = LoggerFactory.getLogger(IndustryRepository.class);
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${app.data-file:}")
    private String externalDataFile;

    private volatile Map<String, Industry> industries = Map.of();
    private volatile JsonNode meta;
    private volatile JsonNode benchmarkGroups;

    @PostConstruct
    public void load() {
        try {
            JsonNode root;
            if (externalDataFile != null && !externalDataFile.isBlank()) {
                root = mapper.readTree(Files.newInputStream(Path.of(externalDataFile)));
                log.info("외부 데이터 파일 로드: {}", externalDataFile);
            } else {
                try (InputStream in = new ClassPathResource("data/industry_distributions.json").getInputStream()) {
                    root = mapper.readTree(in);
                }
                log.info("클래스패스 데이터 로드");
            }
            Map<String, Industry> m = new LinkedHashMap<>();
            List<Industry> list = new ArrayList<>();
            for (JsonNode n : root.get("industries")) {
                Industry ind = mapper.treeToValue(n, Industry.class);
                m.put(ind.code(), ind);
                list.add(ind);
            }
            this.industries = Map.copyOf(m);
            this.meta = root.get("meta");
            this.benchmarkGroups = root.get("benchmarkGroups");
            log.info("업종 {}개 로드 완료 (기준 분기: {})", list.size(), meta.get("quartersCovered"));
        } catch (Exception e) {
            throw new IllegalStateException("분포 데이터 로드 실패", e);
        }
    }

    public List<Industry> all() {
        return List.copyOf(industries.values());
    }

    public Optional<Industry> find(String code) {
        return Optional.ofNullable(industries.get(code));
    }

    public JsonNode meta() {
        return meta;
    }

    public JsonNode benchmarkGroups() {
        return benchmarkGroups;
    }
}
