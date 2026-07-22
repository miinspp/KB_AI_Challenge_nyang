package com.nyang.simulation.presentation;

import com.nyang.simulation.application.SimulationService;
import com.nyang.simulation.application.dto.SimulationRequest;
import com.nyang.simulation.application.dto.SimulationResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class SimulationController {
    private final SimulationService simulationService;

    public SimulationController(SimulationService simulationService) {
        this.simulationService = simulationService;
    }

    /** 정책/금융상품 선택에 따른 12개월 자금흐름 시뮬레이션 */
    @PostMapping("/simulation")
    public SimulationResponse simulate(@Valid @RequestBody SimulationRequest req) {
        return simulationService.simulate(req);
    }
}
