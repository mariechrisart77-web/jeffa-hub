// v82 C3: Systemprompt-Bausteine für Cast, Identität und Kappung (rein, Node-testbar).
// v84 P1: Die Implementierung liegt jetzt in apps/shared/promptapp/chat.js; hier nur Re-Export,
// damit bestehende Importe (chat.js, tests/v82-chat.test.mjs) unverändert funktionieren.
export { castLine, otherProfileNames, identityAnchor, capSystem } from './shared/promptapp/chat.js';
