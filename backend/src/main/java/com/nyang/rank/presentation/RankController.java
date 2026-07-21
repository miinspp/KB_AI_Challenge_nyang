package com.nyang.rank.presentation;

import com.nyang.industry.application.IndustryService;
import com.nyang.industry.domain.CostBenchmark;
import com.nyang.industry.domain.Industry;
import com.nyang.industry.repository.CostBenchmarkRepository;
import com.nyang.rank.application.RankService;
import com.nyang.rank.application.dto.RankRequest;
import com.nyang.rank.application.dto.RankResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RankController {

    private final IndustryService industryService;
    private final RankService rankService;
    private final CostBenchmarkRepository costBenchmarks;

    public RankController(IndustryService industryService, RankService rankService,
                          CostBenchmarkRepository costBenchmarks) {
        this.industryService = industryService;
        this.rankService = rankService;
        this.costBenchmarks = costBenchmarks;
    }

    /** 상대적 위치(상위 %) 산출 */
    @PostMapping("/rank")
    public RankResponse rank(@Valid @RequestBody RankRequest req) {
        Industry ind = industryService.getDetail(req.industryCode());
        if (req.monthlySales() <= 0) {
            throw new IllegalArgumentException("월 매출은 0보다 커야 합니다.");
        }
        // 업종 그룹(food/retail/...)에 해당하는 비용구조 벤치마크가 있으면 비용 축을 업종 실측 대비로 산출.
        // 상권유형이 선택됐으면 서울 상가유형별 임대료 기반 지역 보정 배수를 함께 넘긴다.
        CostBenchmark bm = costBenchmarks.find(ind.group()).orElse(null);
        Double areaMult = costBenchmarks.areaRentMultiplier(req.areaType());
        return rankService.rank(ind, req, bm, areaMult);
    }
}
