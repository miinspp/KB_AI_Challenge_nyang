package com.nyang.industry.presentation;

import com.nyang.industry.application.IndustryService;
import com.nyang.industry.application.dto.IndustrySummaryResponse;
import com.nyang.industry.application.dto.MetaResponse;
import com.nyang.industry.domain.Industry;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class IndustryController {

    private final IndustryService industryService;

    public IndustryController(IndustryService industryService) {
        this.industryService = industryService;
    }

    /** 데이터 출처·기준 분기 등 메타 정보 */
    @GetMapping("/meta")
    public MetaResponse meta() {
        return industryService.getMeta();
    }

    /** 업종 목록 (선택 UI용 요약) */
    @GetMapping("/industries")
    public List<IndustrySummaryResponse> industries() {
        return industryService.getSummaries();
    }

    /** 업종 상세 (분포 격자 포함 — 차트용) */
    @GetMapping("/industries/{code}")
    public Industry industry(@PathVariable String code) {
        return industryService.getDetail(code);
    }

    /** 크론 파이프라인 갱신 후 데이터 재적재 */
    @PostMapping("/admin/reload")
    public ResponseEntity<String> reload() {
        industryService.reload();
        return ResponseEntity.ok("reloaded");
    }
}
