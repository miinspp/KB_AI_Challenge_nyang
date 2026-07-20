package com.nyang.industry.application;

import com.nyang.industry.application.dto.IndustrySummaryResponse;
import com.nyang.industry.application.dto.MetaResponse;
import com.nyang.industry.domain.Industry;
import com.nyang.industry.exception.IndustryNotFoundException;
import com.nyang.industry.repository.IndustryRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/** 업종 데이터 조회·메타·재적재 유스케이스. */
@Service
public class IndustryService {

    private final IndustryRepository repository;

    public IndustryService(IndustryRepository repository) {
        this.repository = repository;
    }

    /** 업종 목록 (선택 UI용 요약) */
    public List<IndustrySummaryResponse> getSummaries() {
        return repository.all().stream().map(IndustrySummaryResponse::from).toList();
    }

    /** 업종 상세 (분포 격자 포함 — 차트용). 없으면 IndustryNotFoundException. */
    public Industry getDetail(String code) {
        return repository.find(code).orElseThrow(() -> new IndustryNotFoundException(code));
    }

    /** 데이터 출처·기준 분기 등 메타 정보 */
    public MetaResponse getMeta() {
        return new MetaResponse(repository.meta(), repository.benchmarkGroups());
    }

    /** 크론 파이프라인 갱신 후 데이터 재적재 */
    public void reload() {
        repository.load();
    }
}
