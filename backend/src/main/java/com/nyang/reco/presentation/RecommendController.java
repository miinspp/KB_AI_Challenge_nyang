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

    /**
     * 진단 신호 기반 맞춤 정책·KB상품 추천 (사전계산 임베딩 앵커 매칭).
     *
     * 경로가 {@code /api/reco} 인 이유: 프론트가 쓰는 {@code /api/recommend} 는
     * Python 추천 서비스(:8000)로 프록시된다. 같은 경로를 쓰면 vite 프록시가
     * 더 구체적인 규칙을 먼저 잡아 이 엔드포인트가 영영 호출되지 않는다.
     */
    @PostMapping("/reco")
    public RecommendResponse recommend(@Valid @RequestBody RecommendRequest req) {
        return recommendService.recommend(req);
    }
}
