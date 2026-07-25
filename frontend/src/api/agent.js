// 든든이 AI 오케스트레이터 (Python /api/agent, 포트 8000)
//   진단 입력을 넘기면 agent가 진단→추천→시뮬→포트폴리오를 자율 실행하고
//   { final(최종 제안), trace(도구 호출 기록), rank } 을 반환한다.
import { postJson } from './http';

export const postAgent = (payload) => postJson('/api/agent', payload);
