import type {
  DailyMenuCandidate,
  DailyMenuErrorCode,
  DailyMenuItem,
  DailyMenuLlmInput,
  DailyMenuPick,
  DailyMenuRecord,
  DailyMenuResponse,
  DailyMenuSelection,
  DailyMenuServiceOptions,
  DailyMenuStore,
  Recipe
} from "../../shared/types.js";
import { dailyMenuSelectionSchema } from "../lib/schema.js";
import { loadWorkshopLlmConfig } from "../lib/workshop-llm.js";
import { DailyMenuError, DAILY_MENU_PROMPT_VERSION, generateDailyMenu } from "../lib/daily-menu-llm.js";
import { toSummary, totalMinutes } from "./search.js";
import type { RecipeRepository } from "./recipe-repository.js";
import type { UserStateStore } from "./user-state-store.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_CANDIDATES = 180;
const MAX_INPUT_CHARS = 60_000;
const MAX_RESERVED_PER_GROUP = 40;
const MODEL = "deepseek-flash" as const;
const ROLE_ORDER = { main: 0, vegetable: 1, soup: 2 } as const;
const MEAT_INGREDIENT = /(?:五花肉|猪(?:肉|排|腿)|牛(?:肉|腩|排|腱)|羊(?:肉|排)|排骨|肉(?:末|丝|片|馅|丁)|鸡(?:肉|腿|翅|胸|爪|胗)|鸭(?:肉|腿|胸)|鹅肉|(?:鲫|鲤|鲈|鳕|草|鲢|带|秋刀|三文|金枪)鱼|鱼(?:肉|片|块|段|排)|虾|蟹(?:肉|柳)?|贝(?:类|肉)?|火腿|香肠|培根|腊肉|肝(?:脏|片|尖)?)/;
const EXCLUDED_RECIPE = /(?:饮品|饮料|甜品|甜点|调料|半成品)/;

export function beijingDate(date: Date): string {
  return new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextRefreshDelay(date: Date): number {
  const beijingNow = date.getTime() + BEIJING_OFFSET_MS;
  const shifted = new Date(beijingNow);
  const todayFivePast = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 5);
  const delay = todayFivePast - beijingNow;
  return delay > 0 ? delay : delay + DAY_MS;
}

function isSoup(recipe: Recipe): boolean {
  return recipe.category === "汤" || recipe.category === "汤羹" || recipe.category.includes("汤羹");
}

function hasMeat(recipe: Recipe): boolean {
  return recipe.ingredients.some(ingredient => MEAT_INGREDIENT.test(ingredient.name));
}

function isVegetableCandidate(recipe: Recipe): boolean {
  if (isSoup(recipe) || hasMeat(recipe)) return false;
  return recipe.category === "家常菜" || recipe.tags?.some(tag => /素菜|素食/.test(tag)) === true;
}

function priorityScore(recipe: Recipe, ownedTools: string[]): number {
  const owned = new Set(ownedTools.map(tool => tool.trim().toLocaleLowerCase()));
  const missingRequired = (recipe.equipment ?? []).filter(tool => !owned.has(tool.trim().toLocaleLowerCase())).length;
  const missingAlternatives = (recipe.equipmentAlternatives ?? []).filter(group =>
    !group.some(tool => owned.has(tool.trim().toLocaleLowerCase()))
  ).length;
  const servingsPenalty = Math.abs(recipe.servings - 2) * 100;
  const difficultyPenalty = recipe.difficulty * 10;
  const equipmentPenalty = missingRequired * 20 + missingAlternatives * 8;
  const timePenalty = totalMinutes(recipe) ?? 90;
  return servingsPenalty + difficultyPenalty + equipmentPenalty + timePenalty;
}

function candidateFor(recipe: Recipe): DailyMenuCandidate {
  const candidate: DailyMenuCandidate = {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    ingredients: recipe.ingredients.map(ingredient => ingredient.name),
    equipment: recipe.equipment ?? [],
    equipmentAlternatives: recipe.equipmentAlternatives ?? [],
    tags: recipe.tags ?? []
  };
  const minutes = totalMinutes(recipe);
  return minutes === undefined ? candidate : { ...candidate, totalMinutes: minutes };
}

function allowedRecipes(repository: RecipeRepository): Recipe[] {
  return repository.list().filter(recipe =>
    ["家常菜", "汤羹", "汤"].includes(recipe.category) && !EXCLUDED_RECIPE.test(recipe.category)
  );
}

function makeInput(
  date: string,
  recipes: Recipe[],
  ownedTools: string[],
  recentRecipeIds: string[]
): DailyMenuLlmInput {
  const ranked = [...recipes].sort((a, b) =>
    priorityScore(a, ownedTools) - priorityScore(b, ownedTools) || a.id.localeCompare(b.id)
  );
  const reserved = [
    ...ranked.filter(isSoup).slice(0, MAX_RESERVED_PER_GROUP),
    ...ranked.filter(isVegetableCandidate).slice(0, MAX_RESERVED_PER_GROUP)
  ];
  const seen = new Set<string>();
  const ordered = [...reserved, ...ranked].filter(recipe => {
    if (seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return true;
  });
  const input: DailyMenuLlmInput = { date, people: 2, candidates: [], ownedTools, recentRecipeIds };
  const candidates: DailyMenuCandidate[] = [];
  for (const recipe of ordered) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const next = [...candidates, candidateFor(recipe)];
    if (JSON.stringify({ ...input, candidates: next }).length > MAX_INPUT_CHARS) continue;
    candidates.push(next[next.length - 1]);
  }
  return { ...input, candidates };
}

function recentIds(store: DailyMenuStore, date: string, repository: RecipeRepository): string[] {
  const start = new Date(`${date}T00:00:00Z`).getTime() - 7 * DAY_MS;
  const unique = new Set<string>();
  for (const record of Object.values(store.records)) {
    if (record.status !== "ready" || record.date >= date || new Date(`${record.date}T00:00:00Z`).getTime() < start) continue;
    for (const pick of record.picks ?? []) if (repository.get(pick.recipeId)) unique.add(pick.recipeId);
  }
  return [...unique];
}

function selectionFrom(value: unknown, input: DailyMenuLlmInput): DailyMenuSelection {
  const parsed = dailyMenuSelectionSchema.safeParse(value);
  if (!parsed.success) throw new DailyMenuError("invalid-result");
  const allowedIds = new Set(input.candidates.map(candidate => candidate.id));
  if (parsed.data.picks.some(pick => !allowedIds.has(pick.recipeId))) throw new DailyMenuError("invalid-result");
  return parsed.data;
}

function makeRecord(
  date: string,
  attemptedAt: string,
  status: "ready" | "failed",
  selection?: DailyMenuSelection,
  errorCode?: DailyMenuErrorCode,
  generatedAt?: string
): DailyMenuRecord {
  if (status === "ready" && selection && generatedAt) {
    return {
      date, attemptedAt, status, model: MODEL, promptVersion: DAILY_MENU_PROMPT_VERSION,
      generatedAt, picks: selection.picks, reason: selection.reason,
      ...(selection.usage ? { usage: selection.usage } : {})
    };
  }
  return {
    date, attemptedAt, status: "failed", model: MODEL, promptVersion: DAILY_MENU_PROMPT_VERSION,
    errorCode: errorCode ?? "provider"
  };
}

export class DailyMenuService {
  readonly #repository: RecipeRepository;
  readonly #state: UserStateStore;
  readonly #config: DailyMenuServiceOptions["config"];
  readonly #generate: NonNullable<DailyMenuServiceOptions["generate"]>;
  readonly #now: () => Date;
  readonly #warn: (code: string) => void;
  #started = false;
  #closed = false;
  #timer?: ReturnType<typeof setTimeout>;
  #running?: Promise<void>;
  #controller?: AbortController;
  #activeDate?: string;

  constructor(repository: RecipeRepository, state: UserStateStore, options: DailyMenuServiceOptions = {}) {
    this.#repository = repository;
    this.#state = state;
    this.#config = options.config === undefined ? loadWorkshopLlmConfig() : options.config;
    this.#generate = options.generate ?? generateDailyMenu;
    this.#now = options.now ?? (() => new Date());
    this.#warn = options.warn ?? (code => console.warn(`[daily-menu] ${code}`));
  }

  start(): void {
    if (this.#started || this.#closed) return;
    this.#started = true;
    void this.refreshToday().catch(() => this.#report("refresh-failed"));
    this.#scheduleNext();
  }

  async close(): Promise<void> {
    this.#closed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#controller?.abort();
    await this.#running?.catch(() => undefined);
  }

  refreshToday(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    if (this.#running) return this.#running;

    const date = beijingDate(this.#now());
    const controller = new AbortController();
    this.#activeDate = date;
    this.#controller = controller;
    const running = this.#refreshDate(date, controller).catch(() => {
      this.#report("refresh-failed");
    }).finally(() => {
      if (this.#running === running) this.#running = undefined;
      if (this.#controller === controller) this.#controller = undefined;
      if (this.#activeDate === date) this.#activeDate = undefined;
    });
    this.#running = running;
    return running;
  }

  async getMenu(): Promise<DailyMenuResponse> {
    const date = beijingDate(this.#now());
    let store: DailyMenuStore;
    try {
      store = await this.#repository.readDailyMenus();
    } catch {
      this.#report("cache-unavailable");
      return this.#fallbackResponse(date);
    }

    const today = store.records[date];
    const todayReady = today?.status === "ready" ? this.#readyResponse(today, date) : null;
    if (todayReady) return todayReady;

    const latest = Object.values(store.records)
      .filter(record => record.status === "ready" && record.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(record => this.#readyResponse(record, date))
      .find((response): response is DailyMenuResponse => response !== null);

    if (this.#activeDate === date) {
      const base = latest ?? this.#fallbackResponse(date);
      return { ...base, date, status: "updating", reason: latest?.reason ?? "今日搭配正在准备。" };
    }
    if (latest) return { ...latest, date, status: "stale" };
    return this.#fallbackResponse(date);
  }

  async #refreshDate(date: string, controller: AbortController): Promise<void> {
    let store: DailyMenuStore;
    try {
      store = await this.#repository.readDailyMenus();
    } catch {
      this.#report("cache-unavailable");
      return;
    }
    if (store.records[date] || !this.#config || this.#closed) return;

    const ownedTools = this.#state.snapshot().kitchen?.tools ?? this.#repository.meta().defaultOwned;
    const input = makeInput(date, allowedRecipes(this.#repository), ownedTools, recentIds(store, date, this.#repository));
    const attemptedAt = this.#now().toISOString();
    const claim: DailyMenuRecord = {
      date, attemptedAt, status: "generating", model: MODEL, promptVersion: DAILY_MENU_PROMPT_VERSION
    };
    let claimed = false;
    try {
      claimed = await this.#repository.claimDailyMenu(claim);
    } catch {
      this.#report("claim-failed");
      return;
    }
    if (!claimed) return;

    if (input.candidates.length < 3) {
      await this.#finishFailure(date, attemptedAt, "no-candidates");
      return;
    }

    try {
      if (controller.signal.aborted || this.#closed) throw new DailyMenuError("interrupted");
      const generated = await this.#generate(input, this.#config, { signal: controller.signal });
      const selection = selectionFrom(generated, input);
      const record = makeRecord(date, attemptedAt, "ready", selection, undefined, this.#now().toISOString());
      try {
        await this.#repository.finishDailyMenu(record);
      } catch {
        this.#report("finish-failed");
      }
    } catch (error) {
      const code: DailyMenuErrorCode = error instanceof DailyMenuError
        ? error.code
        : controller.signal.aborted || this.#closed ? "interrupted" : "provider";
      await this.#finishFailure(date, attemptedAt, code);
    }
  }

  async #finishFailure(date: string, attemptedAt: string, errorCode: DailyMenuErrorCode): Promise<void> {
    try {
      await this.#repository.finishDailyMenu(makeRecord(date, attemptedAt, "failed", undefined, errorCode));
    } catch {
      this.#report("finish-failed");
    }
  }

  #readyResponse(record: DailyMenuRecord, today: string): DailyMenuResponse | null {
    if (!record.picks || !record.reason || !record.generatedAt) return null;
    const items = this.#itemsForPicks(record.picks);
    if (!items) return null;
    return {
      date: today,
      menuDate: record.date,
      people: 2,
      source: "llm",
      status: record.date === today ? "ready" : "stale",
      items,
      reason: record.reason,
      generatedAt: record.generatedAt
    };
  }

  #itemsForPicks(picks: DailyMenuPick[]): DailyMenuItem[] | null {
    const ordered = [...picks].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    const items: DailyMenuItem[] = [];
    for (const pick of ordered) {
      const recipe = this.#repository.get(pick.recipeId);
      if (!recipe) return null;
      items.push({
        role: pick.role,
        recipe: toSummary(recipe, this.#state.get(recipe.id), this.#repository.media(recipe.id))
      });
    }
    return items.length === 3 ? items : null;
  }

  #fallbackResponse(date: string): DailyMenuResponse {
    const recipes = allowedRecipes(this.#repository);
    const ownedTools = this.#state.snapshot().kitchen?.tools ?? this.#repository.meta().defaultOwned;
    const ranked = [...recipes].sort((a, b) =>
      priorityScore(a, ownedTools) - priorityScore(b, ownedTools) || a.id.localeCompare(b.id)
    );
    const main = ranked.find(recipe => !isSoup(recipe) && hasMeat(recipe));
    const vegetable = ranked.find(recipe => recipe.id !== main?.id && isVegetableCandidate(recipe));
    const soup = ranked.find(isSoup);
    const picks: DailyMenuPick[] = main && vegetable && soup
      && new Set([main.id, vegetable.id, soup.id]).size === 3
      ? [
        { role: "main", recipeId: main.id },
        { role: "vegetable", recipeId: vegetable.id },
        { role: "soup", recipeId: soup.id }
      ]
      : [];
    const items = picks.length === 3 ? this.#itemsForPicks(picks) ?? [] : [];
    return {
      date,
      people: 2,
      source: "fallback",
      status: "fallback",
      items,
      reason: items.length === 3
        ? "暂时显示普通搭配，并非今日 AI 推荐。"
        : "当前没有完整的三道菜组合。"
    };
  }

  #scheduleNext(): void {
    if (this.#closed) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.refreshToday().finally(() => this.#scheduleNext());
    }, nextRefreshDelay(this.#now()));
    this.#timer.unref?.();
  }

  #report(code: string): void {
    try { this.#warn(code); } catch { /* 告警回调不能中断菜单降级。 */ }
  }
}
