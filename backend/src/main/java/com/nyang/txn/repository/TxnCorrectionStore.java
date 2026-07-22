package com.nyang.txn.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 사용자 거래 교정 저장소(레이어⑥) — 원문 상호 → 카테고리 코드.
 *
 * append-only JSONL로 영속화한다. 이 로그가 곧 분류기 학습 라벨이 되고(축적이 핵심),
 * 파이프라인(report.py)이 같은 파일을 읽어 다음 분류부터 규칙보다 먼저 확정한다.
 * 정규화는 파이프라인 쪽(norm_key)에 맡기고 여기선 원문 상호를 그대로 보관한다.
 */
@Repository
public class TxnCorrectionStore {
    private static final Logger log = LoggerFactory.getLogger(TxnCorrectionStore.class);
    private final ObjectMapper mapper = new ObjectMapper();

    private final Path file;
    private final Map<String, String> byMerchant = new ConcurrentHashMap<>();  // merchant(원문) -> category

    public TxnCorrectionStore(@Value("${txn.corrections-file}") String path) {
        this.file = Path.of(path);
    }

    /** 기존 교정 로그를 메모리로 로드(재시작 후에도 유지). */
    @PostConstruct
    public void load() {
        if (!Files.exists(file)) {
            log.info("거래 교정 로그 없음(신규): {}", file.toAbsolutePath());
            return;
        }
        try {
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (line.isBlank()) continue;
                JsonNode n = mapper.readTree(line);
                byMerchant.put(n.get("merchant").asText(), n.get("category").asText());
            }
            log.info("거래 교정 {}건 로드: {}", byMerchant.size(), file.toAbsolutePath());
        } catch (Exception e) {
            log.warn("거래 교정 로그 로드 실패(무시하고 진행): {}", e.getMessage());
        }
    }

    /** 교정 저장 — 메모리 갱신 + JSONL 한 줄 append. */
    public synchronized void save(String merchant, String category) {
        byMerchant.put(merchant, category);
        try {
            Files.createDirectories(file.getParent());
            Map<String, String> row = new LinkedHashMap<>();
            row.put("merchant", merchant);
            row.put("category", category);
            String line = mapper.writeValueAsString(row) + System.lineSeparator();
            Files.writeString(file, line, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            // 영속화 실패해도 메모리 반영은 유지 — 서비스 흐름은 끊지 않는다.
            log.warn("거래 교정 append 실패: {}", e.getMessage());
        }
    }

    /** merchant(원문) -> category 전체. */
    public Map<String, String> all() {
        return Map.copyOf(byMerchant);
    }
}
