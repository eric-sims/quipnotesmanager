import { mockApiRequest } from './mockApi.js';

const API_URL = import.meta.env.VITE_API_URL;

// When VITE_OFFLINE is set, requests are served by the in-memory mock
// backend (mockApi.js) so the manager runs with no server. See the
// `dev:offline` npm script / .env.offline.
export const IS_OFFLINE = import.meta.env.VITE_OFFLINE === 'true';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Helper function for making HTTP requests
export async function apiRequest(method, url, body = null, headers = {}) {
    if (IS_OFFLINE) {
        return mockApiRequest(method, url, body);
    }

    const options = {
        method: method,
        headers: headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    return await fetch(`${API_URL}${url}`, options);
}

// Rounds / prompts. Thin wrappers over apiRequest that return the raw Response,
// so callers keep the same .ok / .status / .json() handling used elsewhere.

// Draw the next prompt (start a round). 201 -> { round, prompt }.
export function startRound(code) {
    return apiRequest('POST', `/games/${code}/rounds`, null, JSON_HEADERS);
}

// Current round for a game. 200 -> { round, prompt } (round 0 before any draw).
export function getRound(code) {
    return apiRequest('GET', `/games/${code}/round`, null, JSON_HEADERS);
}

// Current roster for a game. 200 -> { players: [{ id }] }. Used to restore the
// player list on mount/reconnect; live updates arrive via the `players` event.
export function getPlayers(code) {
    return apiRequest('GET', `/games/${code}/players`, null, JSON_HEADERS);
}
