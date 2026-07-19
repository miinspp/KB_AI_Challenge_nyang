package com.nyang.rank.presentation;

import com.nyang.industry.application.IndustryService;
import com.nyang.industry.domain.Industry;
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

    public RankController(IndustryService industryService, RankService rankService) {
        this.industryService = industryService;
        this.rankService = rankService;
    }

    /** 상대적 위치(상위 %) 산출 */
    @PostMapping("/rank")
    public RankResponse rank(@Valid @RequestBody RankRequest req) {
        Industry ind = industryService.getDetail(req.industryCode());
        if (req.monthlySales() <= 0) {
            throw new IllegalArgumentException("월 매출은 0보다 커야 합니다.");
        }
        return rankService.rank(ind, req);
    }
}
