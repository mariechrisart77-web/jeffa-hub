// Typed facade for the pure image-service core (src/imgsvc-core.js is plain JS so node tests can import it).
import * as core from './imgsvc-core.js';

export interface Resolved {
  look?: string; identity?: string; defaults?: { outfit?: string; pose?: string; place?: string; expression?: string }; refLook?: string; styleText?: string; stylePose?: string; styleCustom?: boolean;
  presetTexts?: Record<string, string>; outfitKeyword?: string; outfitText?: string; outfitNeg?: string;
  photo?: { outfit?: string; pose?: string; scene?: string; light?: string; frame?: string; mood?: string; render?: string; intensity?: string; negative?: string };
}
export interface Conflict { slot: string; removed: string; kept: string; source: string }
export interface Layers {
  identity: string; outfit: string; outfitNeg: string; pose: string; place: string; light: string; frame: string; mood: string;
  expression: string; styleText: string; stylePose: string; styleCustom: boolean; scene: string; context: string; summary: string; fixed: string;
  corrections: { positive: string; negative: string }; conflicts: Conflict[];
  defaults: { outfit: string; place: string; pose: string; expression: string };
  sceneHas?: { outfit: boolean; place: boolean; pose: boolean };
  render?: string; vibe?: string;
}
export interface Route { kind: 'gen' | 'edit'; model: string; cost: number; label: string; refMode?: string; q?: string; steps?: number; edit?: { base: string; model: string } | null; mix?: boolean }
export interface Ctx { messages?: { role: string; content: string; generated?: boolean }[]; scene?: string; summary?: string; story?: Story }
export interface Story { location: string; time_of_day: string; present: string[]; outfit: string; outfit_state: string; action: string; updatedAt: number }
export interface ComposerParts { scene: string; action: string; pose: string; camera: string; lighting: string; outfit: string; outfit_state: string; background: string; expression: string; story: Story }
export interface NewBody {
  profile: string; conversationId?: string; profileData?: { profile?: any; resolved?: any };
  context?: Ctx; style?: string; adult?: boolean; quality?: string; seed?: number; seedMode?: string;
  photoOverride?: Record<string, string>; camera?: string; dryRun?: boolean; saveStory?: boolean;
}
export interface PlanResult {
  prompt: string; negative: string; parts: Partial<ComposerParts>; story: Story; seed: number; route: Route;
  composer: 'llm' | 'rule'; style: string; adult: boolean; quality: string; conflicts: Conflict[];
  intensity?: string; abgleich?: string[];
}
export interface PlanError { error: { status: number; code: string; message?: string } }

export const resolveLayers = core.resolveLayers as (o: { profile?: any; resolved?: Resolved; card?: any; scene?: string; context?: Ctx; corrections?: any }) => Layers;
export const buildRulePrompt = core.buildRulePrompt as (l: Layers, o?: { style?: string; adult?: boolean; angle?: string; llmScene?: string; variation?: string }) => { prompt: string; negative: string };
export const routeModel = core.routeModel as (o?: { style?: string; adult?: boolean; quality?: string; refMode?: string; hasRef?: boolean }) => Route;
export const pickAngle = core.pickAngle as (scene: string, rnd?: () => number) => string;
export const minorRisk = core.minorRisk as (p: any, r: any) => boolean;
export const addCues = core.addCues as (p: string, l: any, traits: string) => string;
export const vibeCues = core.vibeCues as (t: string) => string;
export const enforceLocked = core.enforceLocked as (p: string, l: Layers) => string;
export const composeInput = core.composeInput as (l: Layers, o?: { style?: string; angle?: string; llmScene?: string; variation?: string }) => string;
export const useScene = core.useScene as (l: Layers, chatText: string) => Partial<Layers>;
export const sceneVariation = core.sceneVariation as (v: string, llmScene: string) => string;
export const COMPOSER_SYSTEM: string = core.COMPOSER_SYSTEM;
export const pickVariation = core.pickVariation as (l: Layers, rnd?: () => number) => string;
export const normRefMode = core.normRefMode as (m: string) => string;
export const effectiveRefMode = core.effectiveRefMode as (refMode: string, l: Layers) => string;
export const buildEditPrompt = core.buildEditPrompt as (scenePrompt: string, full: boolean) => string;
export const shortModel = core.shortModel as (model: string, label: string) => string;
export const outfitFor = core.outfitFor as (r: any, sc: string) => { text: string; neg: string } | null;
export const stripConflicts = core.stripConflicts as (text: string, locked: any) => { text: string; removed: { slot: string; word: string }[] };
export const dedupeSeg = core.dedupeSeg as (t: string) => string;
export const oneBust = core.oneBust as (t: string, keepCup?: boolean) => string;
export const VARIATIONS: string[] = core.VARIATIONS;
export const MODEL_TABLE = core.MODEL_TABLE as Record<string, { label: string; safe: { model: string; cost: number; steps?: number; edit?: { base: string; model: string }; mix?: boolean }; adult: { model: string; cost: number; steps?: number; edit?: { base: string; model: string }; mix?: boolean } }>;
export const modelLabel = core.modelLabel as (quality: string, adult?: boolean) => string;
export const scrubYouth = core.scrubYouth as (t: string) => string;
export const youthRisk = core.youthRisk as (t: string) => boolean;
export const sceneSeed = core.sceneSeed as (base: number, key: string) => number;
export const resolveSeed = core.resolveSeed as (o: { bodySeed?: number; seedMode?: string; profile?: any; profileId?: string; sceneKey?: string; rnd?: () => number }) => number;
export const parseComposerJson = core.parseComposerJson as (t: string) => any | null;
export const compactIdentity = core.compactIdentity as (identity: string, max?: number) => string;
export const assemblePrompt = core.assemblePrompt as (parts: any, L: any, o?: { style?: string; adult?: boolean; variation?: string; solo?: boolean }) => { prompt: string; negative: string };
export const composeNegative = core.composeNegative as (l: any, o?: { style?: string; adult?: boolean }) => string;
export const stripWeights = core.stripWeights as (t: string) => string;
export const filterPeople = core.filterPeople as (parts: any, allowed?: boolean) => any;
export const mergeStory = core.mergeStory as (prev: any, next: any) => Story;
export const ruleComposer = core.ruleComposer as (l: Layers, story: any, msgs: any[]) => ComposerParts;
export const COMPOSER_JSON_SYSTEM: string = core.COMPOSER_JSON_SYSTEM;
export const buildImagePlan = core.buildImagePlan as (o: { profile?: any; resolved?: any; card?: any; corrections?: any; body?: any; prevStory?: any; composeLLM?: ((system: string, input: string) => Promise<string>) | null; rnd?: () => number }) => Promise<PlanResult | PlanError>;
export const mergeNegative = core.mergeNegative as (base: string, extra?: string[], max?: number) => string;
export const fitPrompt = core.fitPrompt as (prompt: string, max?: number) => string;
export const composerSystemFor = core.composerSystemFor as (o?: { adult?: boolean; intensity?: string }) => string;
