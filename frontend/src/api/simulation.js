import { postJson } from './http';

export const postSimulation = (payload) => postJson('/api/simulation', payload);
