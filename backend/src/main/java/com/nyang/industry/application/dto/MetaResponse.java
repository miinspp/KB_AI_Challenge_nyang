package com.nyang.industry.application.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** 데이터 출처·기준 분기 등 메타 정보. */
public record MetaResponse(JsonNode meta, JsonNode benchmarkGroups) {}
