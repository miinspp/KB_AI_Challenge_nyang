package com.nyang.hometax.presentation;

import com.nyang.hometax.application.HometaxService;
import com.nyang.hometax.application.dto.HometaxLinkRequest;
import com.nyang.hometax.application.dto.HometaxLinkResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HometaxController {

    private final HometaxService hometaxService;

    public HometaxController(HometaxService hometaxService) {
        this.hometaxService = hometaxService;
    }

    /** 홈택스 연동(동의 필수). 미동의·형식 오류는 400 + 안내 메시지. */
    @PostMapping("/hometax/link")
    public HometaxLinkResponse link(@Valid @RequestBody HometaxLinkRequest req) {
        return hometaxService.link(req.businessNumber(), req.consent());
    }
}
