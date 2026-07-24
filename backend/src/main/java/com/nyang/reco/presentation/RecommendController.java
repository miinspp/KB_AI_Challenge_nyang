package com.nyang.reco.presentation;

import com.nyang.reco.application.RecommendService;
import com.nyang.reco.application.dto.RecommendRequest;
import com.nyang.reco.application.dto.RecommendResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RecommendController {

    private final RecommendService recommendService;

    public RecommendController(RecommendService recommendService) {
        this.recommendService = recommendService;
    }

    /** 진단 신호 기반 맞춤 정책·KB상품 추천 (임베딩 매칭) */
    @PostMapping("/recommend")
    public RecommendResponse recommend(@Valid @RequestBody RecommendRequest req) {
        return recommendService.recommend(req);
    }
}
