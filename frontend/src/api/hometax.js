// 홈택스 연동(현재 백엔드는 시뮬레이션). 동의(consent=true) 없이는 조회하지 않음.
//   POST /api/hometax/link  { businessNumber, consent } → { consented, financials, notice }
import { postJson } from './http';

export const postHometaxLink = (payload) => postJson('/api/hometax/link', payload);
