// 든든이 AI 오케스트레이터 (Python /api/agent · /api/agent/stream, 포트 8000)
//   진단 입력을 넘기면 agent가 진단→추천→시뮬→포트폴리오를 자율 실행하고
//   { final(최종 제안), trace(도구 호출 기록), rank } 을 반환한다.
import { postJson, BASE } from './http';

export const postAgent = (payload) => postJson('/api/agent', payload);

/**
 * 실시간 스트리밍 버전 — 도구를 호출할 때마다 onEvent(event) 를 즉시 호출해
 * "지금 이 단계를 하고 있어요" 를 화면에 그대로 보여줄 수 있게 한다.
 * event.type: 'thinking' | 'tool_start' | 'tool_result' | 'final' | 'error'
 * (백엔드 agent.py 의 run_agent_events 가 그대로 흘려보내는 이벤트와 1:1 대응)
 */
export async function streamAgent(payload, onEvent) {
  const res = await fetch(BASE + '/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) {
    throw new Error(`요청 실패 (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE 프레임은 빈 줄(\n\n)로 구분된다. 마지막 조각은 아직 안 끝났을 수 있어 남겨둔다.
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch { /* 파싱 실패한 조각은 무시하고 계속 진행 */ }
    }
  }
}
