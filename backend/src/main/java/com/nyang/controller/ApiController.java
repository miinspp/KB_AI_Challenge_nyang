package com.nyang.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.nyang.model.Industry;
import com.nyang.model.RankRequest;
import com.nyang.model.RankResponse;
import com.nyang.service.DataStore;
import com.nyang.service.RankService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final DataStore store;
    private final RankService rankService;

    public ApiController(DataStore store, RankService rankService) {
        this.store = store;
        this.rankService = rankService;
    }

    /** 데이터 출처·기준 분기 등 메타 정보 */
    @GetMapping("/meta")
    public Map<String, JsonNode> meta() {
        return Map.of("meta", store.meta(), "benchmarkGroups", store.benchmarkGroups());
    }

    /** 업종 목록 (선택 UI용 요약) */
    @GetMapping("/industries")
    public List<Map<String, Object>> industries() {
        return store.all().stream()
                .<Map<String, Object>>map(i -> Map.of(
                        "code", i.code(),
                        "name", i.name(),
                        "group", i.group(),
                        "groupLabel", i.groupLabel(),
                        "nStores", i.nStores(),
                        "medianMonthlySales", i.medianMonthlySales()))
                .toList();
    }

    /** 업종 상세 (분포 격자 포함 — 차트용) */
    @GetMapping("/industries/{code}")
    public Industry industry(@PathVariable String code) {
        return store.find(code).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "업종 코드를 찾을 수 없습니다: " + code));
    }

    /** 상대적 위치 산출 */
    @PostMapping("/rank")
    public RankResponse rank(@Valid @RequestBody RankRequest req) {
        Industry ind = store.find(req.industryCode()).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "업종 코드를 찾을 수 없습니다: " + req.industryCode()));
        if (req.monthlySales() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "월 매출은 0보다 커야 합니다.");
        }
        return rankService.rank(ind, req);
    }

    /** 크론 파이프라인 갱신 후 데이터 재적재 */
    @PostMapping("/admin/reload")
    public ResponseEntity<String> reload() {
        store.load();
        return ResponseEntity.ok("reloaded");
    }
}
