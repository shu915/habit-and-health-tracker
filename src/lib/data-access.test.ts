import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { todayString } from "./date";
import { DAY_LIMITS, type DayLimitedField } from "./day-limits";
import { EXERCISE_LIMITS, EXERCISE_MAX_PER_DAY } from "./exercise-limits";
import { MEAL_LIMITS, type MealLimitedField } from "./meal-limits";
import { PROFILE_LIMITS, type LimitedField } from "./profile-limits";

// 実際の PostgreSQL を使うテスト。TEST_DATABASE_URL が無いと実行されない(CI では未実行を失敗として扱う)。
// 「他のユーザーの記録が見えない・書き換えられない」ことを守る。本物のデータが入った DB を指さないこと。
// このテストは、user テーブルに "test-user-" で始まる ID の行を作り、終わったら消す
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

// CI で DB が無いまま黙って未実行にならないよう、ここで失敗させる(出力の文字列に頼らない)
if (process.env.CI && !testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required in CI (the database tests must run)");
}

// getCurrentUserId はセッションを読むので、テストでは「ログイン中のユーザー」を差し替える
const currentUser = vi.hoisted(() => ({ id: "" }));
vi.mock("server-only", () => ({}));
// 未ログイン(id が空)のときは、本物と同じく /login へのリダイレクト(例外)にする
vi.mock("@/lib/current-user", () => ({
  getCurrentUserId: async () => {
    if (!currentUser.id) throw new Error("NEXT_REDIRECT:/login");
    return currentUser.id;
  },
}));
// redirect は本物と同じく例外を投げて処理を止める。revalidatePath は呼ばれたかどうかを見る
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// AI の呼び出しは、返事を模した固定の JSON に差し替える(実際の API は呼ばない)
const ai = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/openrouter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openrouter")>()),
  completeJson: ai.complete,
}));

// DB が返したエラーが、指定した制約の違反であることを確かめる(drizzle はエラーを cause に入れる)
async function expectViolation(attempt: Promise<unknown>, constraint: string, label: string) {
  const error = await attempt.then(
    () => null,
    (e: unknown) => e,
  );
  const cause = error instanceof Error ? error.cause : undefined;
  const violated = typeof cause === "object" && cause !== null && "constraint" in cause ? cause.constraint : undefined;
  expect(violated, `${label} は ${constraint} で拒否されるはず`).toBe(constraint);
}

const USER_A = "test-user-a";
const USER_B = "test-user-b";

describe.runIf(testDatabaseUrl)("データ操作(実 DB)", () => {
  let dbModule: typeof import("@/db");
  let schema: typeof import("@/db/schema");
  let daysModule: typeof import("@/lib/days");
  let mealsModule: typeof import("@/lib/meals");
  let exercisesModule: typeof import("@/lib/exercises");
  let exerciseActionsModule: typeof import("@/app/(app)/days/[date]/exercises/actions");
  let positiveModule: typeof import("@/lib/positive-entries");
  let positiveActionsModule: typeof import("@/app/(app)/days/[date]/positive/actions");
  let aiLimitModule: typeof import("@/lib/ai-limit");
  // 全期間の記録(期間の絞り込みが要らないテスト用)
  const listAllDays = () => daysModule.listDaysInRange("1900-01-01", "2100-12-31");
  let mealActionsModule: typeof import("@/app/(app)/days/[date]/meals/actions");
  let profilesModule: typeof import("@/lib/profiles");
  let actionsModule: typeof import("@/app/(app)/profile/actions");
  let dayActionsModule: typeof import("@/app/(app)/days/[date]/edit/actions");
  let reflectionActionsModule: typeof import("@/app/(app)/days/[date]/reflection/actions");

  beforeAll(async () => {
    // 開発用の DB を取り違えて、テスト用のユーザーを作ったりマイグレーションを流したりしないための確認。
    // 許可するのは、名前が _test で終わる DB と、CI の使い捨ての DB(app)だけ
    const dbName = new URL(testDatabaseUrl ?? "").pathname.replace(/^\//, "");
    if (!/_test$/.test(dbName) && dbName !== "app") {
      throw new Error(`TEST_DATABASE_URL must point to a test database (got "${dbName}")`);
    }

    // @/db は import したときに DATABASE_URL を読むので、先にテスト用の接続先を入れてから読み込む
    process.env.DATABASE_URL = testDatabaseUrl;
    dbModule = await import("@/db");
    schema = await import("@/db/schema");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbModule.db, { migrationsFolder: "./drizzle" });
    daysModule = await import("@/lib/days");
    mealsModule = await import("@/lib/meals");
    exercisesModule = await import("@/lib/exercises");
    exerciseActionsModule = await import("@/app/(app)/days/[date]/exercises/actions");
    positiveModule = await import("@/lib/positive-entries");
    positiveActionsModule = await import("@/app/(app)/days/[date]/positive/actions");
    aiLimitModule = await import("@/lib/ai-limit");
    mealActionsModule = await import("@/app/(app)/days/[date]/meals/actions");
    profilesModule = await import("@/lib/profiles");
    actionsModule = await import("@/app/(app)/profile/actions");
    dayActionsModule = await import("@/app/(app)/days/[date]/edit/actions");
    reflectionActionsModule = await import("@/app/(app)/days/[date]/reflection/actions");
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { inArray } = await import("drizzle-orm");
    // user を消すと、days と profiles も cascade で消える
    await dbModule.db.delete(schema.user).where(inArray(schema.user.id, [USER_A, USER_B]));
    await dbModule.db.insert(schema.user).values([
      { id: USER_A, name: "A", email: "test-user-a@example.com" },
      { id: USER_B, name: "B", email: "test-user-b@example.com" },
    ]);
  });

  // 記録を始められるプロフィール(目標カロリーと活動係数が決まっている)。日を作る Server Action のテストの前提
  const readyProfiles = async () => {
    await dbModule.db
      .insert(schema.profiles)
      .values([USER_A, USER_B].map((userId) => ({ userId, targetCalories: 1800, activityLevel: "1.375" })))
      .onConflictDoNothing();
  };

  afterAll(async () => {
    if (!dbModule) return; // beforeAll で接続先の確認に失敗した場合は、片づけるものが無い
    const { inArray } = await import("drizzle-orm");
    await dbModule.db.delete(schema.user).where(inArray(schema.user.id, [USER_A, USER_B]));
    await dbModule.db.$client.end();
  });

  describe("days", () => {
    it("他のユーザーの記録は一覧にも個別取得にも出ない", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-29", { morningWeightKg: "70.00", reflection: "Aの日記" });

      currentUser.id = USER_B;
      expect(await listAllDays()).toEqual([]);
      expect(await daysModule.getDay("2026-10-29")).toBeNull();
    });

    it("同じ日付でも、ユーザーごとに別の行になり、互いを上書きしない", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-29", { reflection: "Aの日記" });
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-10-29", { reflection: "Bの日記" });

      currentUser.id = USER_A;
      expect((await daysModule.getDay("2026-10-29"))?.reflection).toBe("Aの日記");
      currentUser.id = USER_B;
      expect((await daysModule.getDay("2026-10-29"))?.reflection).toBe("Bの日記");
    });

    it("同じ日を二重に作らず、2 回目は更新になる", async () => {
      currentUser.id = USER_A;
      const first = await daysModule.saveDay("2026-10-29", { morningWeightKg: "70.00" });
      const second = await daysModule.saveDay("2026-10-29", { morningWeightKg: "69.50" });

      expect(second.id).toBe(first.id);
      expect(await listAllDays()).toHaveLength(1);
      expect(second.morningWeightKg).toBe("69.50");
    });

    it("入力に無い項目は変更しない(体重だけ更新しても振り返りが消えない)", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-29", { morningWeightKg: "70.00", reflection: "書いた日記" });
      const updated = await daysModule.saveDay("2026-10-29", { morningWeightKg: "69.00" });

      expect(updated.morningWeightKg).toBe("69.00");
      expect(updated.reflection).toBe("書いた日記");
    });

    it("null を渡した項目は空になる", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-29", { morningWeightKg: "70.00", reflection: "書いた日記" });
      const cleared = await daysModule.saveDay("2026-10-29", { reflection: null });

      expect(cleared.reflection).toBeNull();
      expect(cleared.morningWeightKg).toBe("70.00");
    });

    it("入力に user_id が紛れ込んでも、ログイン中のユーザーの記録になる", async () => {
      currentUser.id = USER_A;
      // 型の外から来る余計なキーを想定した入力(検証を通らず直接渡された場合)
      const sneaky = { reflection: "x", userId: USER_B, id: 999 };
      const saved = await daysModule.saveDay("2026-10-29", sneaky);

      expect(saved.userId).toBe(USER_A);
      currentUser.id = USER_B;
      expect(await listAllDays()).toEqual([]);
    });

    it("日付は新しい順に並ぶ", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-27", {});
      await daysModule.saveDay("2026-10-29", {});
      await daysModule.saveDay("2026-10-28", {});

      expect((await listAllDays()).map((d) => d.date)).toEqual([
        "2026-10-29",
        "2026-10-28",
        "2026-10-27",
      ]);
    });

    it("期間で絞った一覧は、両端を含み、他のユーザーの記録を含まない", async () => {
      currentUser.id = USER_A;
      for (const date of ["2026-10-06", "2026-10-07", "2026-10-20", "2026-11-03", "2026-11-04"]) {
        await daysModule.saveDay(date, {});
      }
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-10-10", {});

      currentUser.id = USER_A;
      expect((await daysModule.listDaysInRange("2026-10-07", "2026-11-03")).map((d) => d.date)).toEqual([
        "2026-11-03",
        "2026-10-20",
        "2026-10-07",
      ]);
      await expect(daysModule.listDaysInRange("2026-02-30", "2026-11-03")).rejects.toThrow("invalid date");
    });

    it("推移用の取得: 日付と朝の体重・体脂肪率だけを、期間で絞って古い順に返す(自分の記録だけ。本文などの列は含まない)", async () => {
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-10-12", { morningWeightKg: "50.00" });

      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-12", { morningWeightKg: "98.00", morningBodyFatPercent: "32.0", reflection: "メモ" });
      await daysModule.saveDay("2026-10-10", { morningWeightKg: "99.00" });
      await daysModule.saveDay("2026-10-20", { morningWeightKg: "97.00" });

      const rows = await daysModule.listBodyMeasures("2026-10-10", "2026-10-15");
      expect(rows).toEqual([
        { date: "2026-10-10", morningWeightKg: "99.00", morningBodyFatPercent: null },
        { date: "2026-10-12", morningWeightKg: "98.00", morningBodyFatPercent: "32.0" },
      ]);
      expect(Object.keys(rows[0]).sort()).toEqual(["date", "morningBodyFatPercent", "morningWeightKg"]); // reflection などは読まない
      await expect(daysModule.listBodyMeasures("2026-02-30", "2026-10-15")).rejects.toThrow("invalid date");
    });

    it("前後の記録の日: いちばん近い記録のある日を返す(自分の記録だけ。date 自身や、記録の無い日でもよい)", async () => {
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-10-12", {});

      currentUser.id = USER_A;
      expect(await daysModule.getAdjacentDays("2026-10-10")).toEqual({ previous: null, next: null });
      for (const date of ["2026-10-05", "2026-10-10", "2026-10-20"]) await daysModule.saveDay(date, {});

      expect(await daysModule.getAdjacentDays("2026-10-10")).toEqual({ previous: "2026-10-05", next: "2026-10-20" }); // 記録のある日自身
      expect(await daysModule.getAdjacentDays("2026-10-07")).toEqual({ previous: "2026-10-05", next: "2026-10-10" }); // 記録の無い日(間)
      expect(await daysModule.getAdjacentDays("2026-10-05")).toEqual({ previous: null, next: "2026-10-10" }); // いちばん古い日
      expect(await daysModule.getAdjacentDays("2026-10-20")).toEqual({ previous: "2026-10-10", next: null }); // いちばん新しい日
      expect(await daysModule.getAdjacentDays("2026-11-01")).toEqual({ previous: "2026-10-20", next: null });
      await expect(daysModule.getAdjacentDays("2026-02-30")).rejects.toThrow("invalid date");
    });

    it("一覧: 記録のある日の件数と、新しい日から 14 件ずつのページは、自分の記録だけから決まる", async () => {
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-01-01", {});

      currentUser.id = USER_A;
      expect(await daysModule.countDays()).toBe(0);
      expect(await daysModule.listDaysPage(1)).toEqual([]);
      for (let day = 1; day <= 20; day++) await daysModule.saveDay(`2026-09-${String(day).padStart(2, "0")}`, {});

      expect(await daysModule.countDays()).toBe(20);
      const first = await daysModule.listDaysPage(1);
      expect(first).toHaveLength(14);
      expect(first[0].date).toBe("2026-09-20"); // 新しい日から
      expect(first[13].date).toBe("2026-09-07");
      const second = await daysModule.listDaysPage(2);
      expect(second.map((d) => d.date)).toEqual(["2026-09-06", "2026-09-05", "2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01"]);
      expect(await daysModule.listDaysPage(3)).toEqual([]);
      await expect(daysModule.listDaysPage(0)).rejects.toThrow("invalid page");
    });

    it("その日の体重: 朝の体重 → それ以前の最新の朝の体重 → プロフィールの体重。他のユーザーの体重は使わない", async () => {
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-10-20", { morningWeightKg: "99.00" });

      currentUser.id = USER_A;
      expect(await daysModule.getDayWeight("2026-10-20")).toEqual({ kg: null, source: null, earlierDate: null });
      await profilesModule.updateProfile({ currentWeightKg: "72.00" });
      expect(await daysModule.getDayWeight("2026-10-20")).toEqual({ kg: 72, source: "profile", earlierDate: null });

      await daysModule.saveDay("2026-10-10", { morningWeightKg: "71.00" });
      await daysModule.saveDay("2026-10-15", {}); // 体重の無い日は飛ばす
      await daysModule.saveDay("2026-10-25", { morningWeightKg: "70.00" });
      expect(await daysModule.getDayWeight("2026-10-15")).toEqual({ kg: 71, source: "earlier", earlierDate: "2026-10-10" });
      expect(await daysModule.getDayWeight("2026-10-20")).toEqual({ kg: 71, source: "earlier", earlierDate: "2026-10-10" }); // 後の日(25 日)の体重は使わない
      expect(await daysModule.getDayWeight("2026-10-25")).toEqual({ kg: 70, source: "morning", earlierDate: null });
      expect(await daysModule.getDayWeight("2026-10-05")).toEqual({ kg: 72, source: "profile", earlierDate: null }); // それ以前に朝の体重が無い
      await expect(daysModule.getDayWeight("2026-02-30")).rejects.toThrow("invalid date");
    });

    it("日の行を作ったときのプロフィールの目標・活動係数を写し、あとでプロフィールを直しても過去の日は変わらない", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1800, activityLevel: "1.375", currentBodyFatPercent: "30.0" });
      await daysModule.saveDay("2026-10-20", { morningBodyFatPercent: "22.5" });

      await profilesModule.updateProfile({ targetCalories: 1500, activityLevel: "1.55", currentBodyFatPercent: "28.0" });
      await daysModule.saveDay("2026-10-20", { reflection: "更新しても写しは変わらない" }); // 更新では写し直さない
      await daysModule.saveDay("2026-10-21", {}); // 新しい日は、直したあとの値を写す

      const old = await daysModule.getDayBasis("2026-10-20");
      expect(old.profile.targetCalories).toBe(1800);
      expect(old.profile.activityLevel).toBe("1.375");
      expect(old.bodyFat).toEqual({ value: 22.5, source: "morning", earlierDate: null }); // 体脂肪率はその日の朝の値
      expect(old.profile.currentBodyFatPercent).toBe("22.5");

      const next = await daysModule.getDayBasis("2026-10-21");
      expect(next.profile.targetCalories).toBe(1500);
      expect(next.profile.activityLevel).toBe("1.550");
      expect(next.bodyFat).toEqual({ value: 22.5, source: "earlier", earlierDate: "2026-10-20" });
    });

    it("プロフィールの目標カロリー・活動係数を直すと、書きかけの日(今日)の写しも新しくなる。過ぎた日は当時のまま", async () => {
      const { defaultMealDayAndTime } = await import("./meal-time");
      const today = defaultMealDayAndTime().date;
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1800, activityLevel: "1.375" });
      await daysModule.saveDay("2026-10-24", {});
      await daysModule.saveDay(today, {});

      await profilesModule.updateProfile({ targetCalories: 1500, activityLevel: "1.55" });
      expect((await daysModule.getDayBasis(today)).profile.targetCalories).toBe(1500);
      expect((await daysModule.getDayBasis(today)).profile.activityLevel).toBe("1.550");
      expect((await daysModule.getDayBasis("2026-10-24")).profile.targetCalories).toBe(1800); // 過ぎた日は変わらない

      // 関係ない項目だけを直しても、写しは書き換わらない(写しを直接ずらしておき、ずれが残ることで確かめる)
      const { and, eq } = await import("drizzle-orm");
      const todayRow = and(eq(schema.days.userId, USER_A), eq(schema.days.date, today));
      await dbModule.db.update(schema.days).set({ profileTargetCalories: 999, profileActivityLevel: "1.900" }).where(todayRow);
      await profilesModule.updateProfile({ age: 40 });
      expect((await daysModule.getDayBasis(today)).profile.targetCalories).toBe(999);
      // 目標カロリーだけを直しても、活動係数の写しは書き換わらない
      await profilesModule.updateProfile({ targetCalories: 1400 });
      const basis = (await daysModule.getDayBasis(today)).profile;
      expect(basis.targetCalories).toBe(1400);
      expect(basis.activityLevel).toBe("1.900");
    });

    it("目標カロリーを空にして保存すると、書きかけの日の写しも空になり、今のプロフィール(空)で補われる", async () => {
      const { defaultMealDayAndTime } = await import("./meal-time");
      const today = defaultMealDayAndTime().date;
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1800 });
      await daysModule.saveDay(today, {});
      await profilesModule.updateProfile({ targetCalories: null });
      expect((await daysModule.getDayBasis(today)).profile.targetCalories).toBeNull();
      const { and, eq } = await import("drizzle-orm");
      const [row] = await dbModule.db.select().from(schema.days).where(and(eq(schema.days.userId, USER_A), eq(schema.days.date, today)));
      expect(row.profileTargetCalories).toBeNull();
    });

    it("画面の保存(saveDayUnlessEmpty): 行が無い日を空のまま保存しても、行を作らない(目標が早く固まらない)", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1800 });
      expect(await daysModule.saveDayUnlessEmpty("2026-10-23", { morningWeightKg: null, reflection: null })).toBeNull();
      expect(await daysModule.getDay("2026-10-23")).toBeNull();

      await profilesModule.updateProfile({ targetCalories: 1500 });
      await daysModule.saveDayUnlessEmpty("2026-10-23", { morningWeightKg: "70.00" }); // 中身があれば作り、そのときの目標を写す
      expect((await daysModule.getDayBasis("2026-10-23")).profile.targetCalories).toBe(1500);

      // すでに行がある日は、空に直す保存も通る
      const cleared = await daysModule.saveDayUnlessEmpty("2026-10-23", { morningWeightKg: null });
      expect(cleared?.morningWeightKg).toBeNull();
    });

    it("不正な日付は DB に触る前にエラーにする", async () => {
      currentUser.id = USER_A;
      await expect(daysModule.saveDay("2026-02-30", {})).rejects.toThrow("invalid date");
      await expect(daysModule.saveDay("0000-01-01", {})).rejects.toThrow("invalid date");
      await expect(daysModule.getDay("abc")).rejects.toThrow("invalid date");
    });

    it("ユーザーを消すと、その人の記録も消える(他の人の記録は残る)", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-29", { reflection: "A" });
      currentUser.id = USER_B;
      await daysModule.saveDay("2026-10-29", { reflection: "B" });

      const { eq } = await import("drizzle-orm");
      await dbModule.db.delete(schema.user).where(eq(schema.user.id, USER_A));

      const remaining = await dbModule.db.select().from(schema.days);
      expect(remaining.filter((d) => d.userId === USER_A)).toEqual([]);
      expect(remaining.filter((d) => d.userId === USER_B)).toHaveLength(1);
    });

    it("体脂肪率を保存でき、体重だけの更新では消えない", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-29", { morningWeightKg: "70.00", morningBodyFatPercent: "22.5" });
      const updated = await daysModule.saveDay("2026-10-29", { morningWeightKg: "69.50" });

      expect(updated.morningWeightKg).toBe("69.50");
      expect(updated.morningBodyFatPercent).toBe("22.5");
    });

    it("体脂肪率の範囲外は DB の制約でも拒否される", async () => {
      currentUser.id = USER_A;
      await expect(daysModule.saveDay("2026-10-29", { morningBodyFatPercent: "100.0" })).rejects.toThrow();
      await expect(daysModule.saveDay("2026-10-29", { morningBodyFatPercent: "0.0" })).rejects.toThrow();
      await expect(daysModule.saveDay("2026-10-29", { morningBodyFatPercent: "99.9" })).resolves.toBeDefined();
    });

    it("体重の範囲外は DB の制約でも拒否される", async () => {
      currentUser.id = USER_A;
      await expect(daysModule.saveDay("2026-10-29", { morningWeightKg: "500.00" })).rejects.toThrow();
      await expect(daysModule.saveDay("2026-10-29", { morningWeightKg: "0.00" })).rejects.toThrow();
    });
  });

  describe("profiles", () => {
    it("行が無ければ空の行を作って返し、2 回目は同じ行を返す", async () => {
      currentUser.id = USER_A;
      const first = await profilesModule.getProfile();
      const second = await profilesModule.getProfile();

      expect(first.userId).toBe(USER_A);
      expect(first.gender).toBeNull();
      expect(first.targetCalories).toBeNull();
      expect(first.targetSleepMinutes).toBe(450);
      expect(first.targetSleepMidpoint).toBe("03:15");
      expect(second.createdAt).toEqual(first.createdAt);
    });

    // 制約ごとに「通る端の値」と「落ちる直外の値」を確かめる。端の値は profile-limits.ts の db の範囲から作るので、
    // 定数と実際の DB(マイグレーション)が食い違うと落ちる(範囲を緩めても、定数だけ直しても)
    type ProfileValues = Partial<typeof schema.profiles.$inferInsert>;
    type ConstraintCase = { constraint: string; passes: ProfileValues[]; fails: ProfileValues[] };

    const limitCases: ConstraintCase[] = (Object.keys(PROFILE_LIMITS) as LimitedField[]).map((field) => {
      const { db, scale } = PROFILE_LIMITS[field];
      const step = 10 ** -scale;
      const lowestOk = db.minExclusive ? db.min + step : db.min;
      const highestOk = db.maxExclusive ? db.max - step : db.max;
      // 整数の列は数値で、numeric の列は文字列で渡す
      const value = (n: number): ProfileValues => ({ [field]: scale === 0 ? Math.round(n) : n.toFixed(scale) });
      return {
        constraint: `profiles_${field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}_range`,
        passes: [value(lowestOk), value(highestOk)],
        fails: [value(lowestOk - step), value(highestOk + step)],
      };
    });

    const constraintCases: ConstraintCase[] = [
      ...limitCases,
      {
        constraint: "profiles_target_sleep_midpoint_format",
        passes: [{ targetSleepMidpoint: "00:00" }, { targetSleepMidpoint: "23:59" }],
        fails: [
          { targetSleepMidpoint: "24:00" },
          { targetSleepMidpoint: "03:60" },
          { targetSleepMidpoint: "3:15" },
          { targetSleepMidpoint: "03:5" },
          { targetSleepMidpoint: "abc" },
        ],
      },
    ];

    it.each(constraintCases)("$constraint: 端の値は通り、直外の値は拒否される", async ({ constraint, passes, fails }) => {
      currentUser.id = USER_A;
      await profilesModule.getProfile();
      const { eq } = await import("drizzle-orm");
      const update = (values: ProfileValues) =>
        dbModule.db.update(schema.profiles).set(values).where(eq(schema.profiles.userId, USER_A));

      for (const values of passes) {
        await expect(update(values), `${JSON.stringify(values)} は通るはず`).resolves.toBeDefined();
      }
      for (const values of fails) {
        await expectViolation(update(values), constraint, JSON.stringify(values));
      }
    });

    it("未入力(null)に戻す更新は、制約に関係なく通る", async () => {
      currentUser.id = USER_A;
      await profilesModule.getProfile();
      const { eq } = await import("drizzle-orm");

      await dbModule.db
        .update(schema.profiles)
        .set({ age: 30, heightCm: "170.0", activityLevel: "1.375", targetCalories: 2000 })
        .where(eq(schema.profiles.userId, USER_A));
      await dbModule.db
        .update(schema.profiles)
        .set({ age: null, heightCm: null, activityLevel: null, targetCalories: null })
        .where(eq(schema.profiles.userId, USER_A));

      const row = await profilesModule.getProfile();
      expect(row.age).toBeNull();
      expect(row.heightCm).toBeNull();
      expect(row.activityLevel).toBeNull();
      expect(row.targetCalories).toBeNull();
    });

    it("updateProfile: 保存した値が getProfile で読める", async () => {
      currentUser.id = USER_A;
      const saved = await profilesModule.updateProfile({
        gender: "male",
        age: 35,
        heightCm: "175.0",
        currentWeightKg: "80.50",
        targetCalories: 1800,
        targetSleepMidpoint: "03:30",
      });

      expect(saved.userId).toBe(USER_A);
      const loaded = await profilesModule.getProfile();
      expect(loaded).toMatchObject({
        gender: "male",
        age: 35,
        heightCm: "175.0",
        currentWeightKg: "80.50",
        targetCalories: 1800,
        targetSleepMidpoint: "03:30",
        targetSleepMinutes: 450, // 渡さなかった項目は変わらない
        currentWaistCm: null,
      });
    });

    it("updateProfile: 渡した項目だけを書き、null を渡した項目は空になる", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ age: 35, heightCm: "175.0" });
      await profilesModule.updateProfile({ age: 36 }); // 身長は変わらない
      expect((await profilesModule.getProfile()).heightCm).toBe("175.0");
      expect((await profilesModule.getProfile()).age).toBe(36);

      await profilesModule.updateProfile({ heightCm: null });
      const cleared = await profilesModule.getProfile();
      expect(cleared.heightCm).toBeNull();
      expect(cleared.age).toBe(36);
    });

    it("睡眠の目標は、空(null)にでき、使わない人の行を作っても既定値が入る", async () => {
      currentUser.id = USER_A;
      const fresh = await profilesModule.getProfile();
      expect(fresh.targetSleepMinutes).toBe(450); // 新しい行には一般的な値が最初から入る
      expect(fresh.targetSleepMidpoint).toBe("03:15");

      const cleared = await profilesModule.updateProfile({ targetSleepMinutes: null, targetSleepMidpoint: null });
      expect(cleared.targetSleepMinutes).toBeNull();
      expect(cleared.targetSleepMidpoint).toBeNull();
      // 空にしたあとで、ほかの項目だけを更新しても、空のまま
      const after = await profilesModule.updateProfile({ age: 40 });
      expect(after.targetSleepMinutes).toBeNull();
    });

    it("updateProfile: 他のユーザーのプロフィールは変わらない", async () => {
      currentUser.id = USER_B;
      await profilesModule.updateProfile({ age: 50 });

      currentUser.id = USER_A;
      await profilesModule.updateProfile({ age: 20 });

      currentUser.id = USER_B;
      expect((await profilesModule.getProfile()).age).toBe(50);
      currentUser.id = USER_A;
      expect((await profilesModule.getProfile()).age).toBe(20);
    });

    it("updateProfile: 行が無くても作って保存する", async () => {
      currentUser.id = USER_A;
      const { eq } = await import("drizzle-orm");
      await dbModule.db.delete(schema.profiles).where(eq(schema.profiles.userId, USER_A));

      const saved = await profilesModule.updateProfile({ age: 40 });
      expect(saved.userId).toBe(USER_A);
      expect(saved.age).toBe(40);
    });

    it("updateProfile: 余計なキー(user_id など)は書かれない", async () => {
      currentUser.id = USER_A;
      // 型の外から来る余計なキーを想定した入力(検証を通らず直接渡された場合)
      const sneaky = { age: 33, userId: USER_B, createdAt: new Date(0) };
      const saved = await profilesModule.updateProfile(sneaky);

      expect(saved.userId).toBe(USER_A);
      expect(saved.age).toBe(33);
      expect(saved.createdAt.getFullYear()).toBeGreaterThan(2000);
      currentUser.id = USER_B;
      expect((await profilesModule.getProfile()).age).toBeNull();
    });

    it("ユーザーごとに別のプロフィールになる", async () => {
      currentUser.id = USER_A;
      await profilesModule.getProfile();
      currentUser.id = USER_B;
      const b = await profilesModule.getProfile();

      expect(b.userId).toBe(USER_B);
      const rows = await dbModule.db.select().from(schema.profiles);
      expect(rows.filter((p) => [USER_A, USER_B].includes(p.userId))).toHaveLength(2);
    });
  });

  describe("saveProfileAction", () => {
    const sleep = { targetSleepMinutes: "450", targetSleepMidpoint: "03:15" };
    const formOf = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.set(name, value);
      return formData;
    };
    // redirect は例外を投げるので、成功時は「/ への移動」の例外になる
    const expectRedirectTo = (promise: Promise<unknown>, url: string) =>
      expect(promise).rejects.toThrow(`NEXT_REDIRECT:${url}`);

    it("正しい値を送ると保存され、画面の再取得を依頼して / へ移動する", async () => {
      currentUser.id = USER_A;
      await expectRedirectTo(
        actionsModule.saveProfileAction(null, formOf({ ...sleep, gender: "male", age: "35", heightCm: "175" })),
        "/",
      );

      expect(await profilesModule.getProfile()).toMatchObject({ gender: "male", age: 35, heightCm: "175.0" });
      expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(["/"]);
      expect(vi.mocked(redirect)).toHaveBeenCalledWith("/");
    });

    it("検証に失敗すると、エラーと入力値を返し、何も保存せず、移動もしない", async () => {
      currentUser.id = USER_A;
      const state = await actionsModule.saveProfileAction(null, formOf({ ...sleep, age: "200", heightCm: "abc" }));

      expect(state?.errors.age).toBeDefined();
      expect(state?.errors.heightCm).toBeDefined();
      expect(state?.values).toMatchObject({ age: "200", heightCm: "abc" }); // フォームに残す値
      expect((await profilesModule.getProfile()).age).toBeNull();
      expect(vi.mocked(redirect)).not.toHaveBeenCalled();
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
    });

    it("フォームに無かった項目は変更しない(空欄で送った項目は空にする)", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ age: 30, heightCm: "170.0", currentWaistCm: "80.0" });

      await expectRedirectTo(
        actionsModule.saveProfileAction(null, formOf({ age: "31", currentWaistCm: "" })),
        "/",
      );

      const row = await profilesModule.getProfile();
      expect(row.age).toBe(31);
      expect(row.heightCm).toBe("170.0"); // 送られなかったので変わらない
      expect(row.currentWaistCm).toBeNull(); // 空欄で送ったので空になる
    });

    it("user_id などの余計な項目は無視し、ログイン中のユーザーのプロフィールだけを書く", async () => {
      currentUser.id = USER_A;
      await expectRedirectTo(
        actionsModule.saveProfileAction(null, formOf({ age: "33", userId: USER_B, user_id: USER_B, createdAt: "2000-01-01" })),
        "/",
      );

      expect((await profilesModule.getProfile()).age).toBe(33);
      currentUser.id = USER_B;
      expect((await profilesModule.getProfile()).age).toBeNull();
    });

    it("未ログインなら /login へ送られ、検証にも保存にも進まない", async () => {
      currentUser.id = "";
      await expect(actionsModule.saveProfileAction(null, formOf({ ...sleep, age: "35" }))).rejects.toThrow(
        "NEXT_REDIRECT:/login",
      );

      // 不正な入力でも、検証の結果(エラー)を返さず、先に認証で止まる(認証が検証より前にある)
      await expect(actionsModule.saveProfileAction(null, formOf({ age: "200" }))).rejects.toThrow(
        "NEXT_REDIRECT:/login",
      );

      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      currentUser.id = USER_A;
      expect((await profilesModule.getProfile()).age).toBeNull();
    });
  });
  describe("days の CHECK 制約", () => {
    // 端の値は day-limits.ts の db の範囲から作る。定数と実際の DB(マイグレーション)が食い違うと落ちる
    const cases = (Object.keys(DAY_LIMITS) as DayLimitedField[]).map((field) => {
      const { db, scale } = DAY_LIMITS[field];
      const step = 10 ** -scale;
      const lowestOk = db.minExclusive ? db.min + step : db.min;
      const highestOk = db.maxExclusive ? db.max - step : db.max;
      const value = (n: number) => ({ [field]: n.toFixed(scale) });
      return {
        constraint: `days_${field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}_range`,
        passes: [value(lowestOk), value(highestOk)],
        fails: [value(lowestOk - step), value(highestOk + step)],
      };
    });

    it.each(cases)("$constraint: 端の値は通り、直外の値は拒否される", async ({ constraint, passes, fails }) => {
      currentUser.id = USER_A;
      let index = 0;
      const save = (values: Record<string, string>) =>
        daysModule.saveDay(`2026-01-${String(++index).padStart(2, "0")}`, values);

      for (const values of passes) await expect(save(values), `${JSON.stringify(values)} は通るはず`).resolves.toBeDefined();
      for (const values of fails) await expectViolation(save(values), constraint, JSON.stringify(values));
    });
  });

  describe("days の睡眠の列", () => {
    it.each([
      { constraint: "days_sleep_bedtime_format", field: "sleepBedtime" },
      { constraint: "days_sleep_wake_time_format", field: "sleepWakeTime" },
    ])("$constraint: \"HH:MM\" の端は通り、不正な形は拒否される", async ({ constraint, field }) => {
      currentUser.id = USER_A;
      let index = 0;
      const save = (value: string) => daysModule.saveDay(`2026-02-${String(++index).padStart(2, "0")}`, { [field]: value });

      for (const value of ["00:00", "23:59"]) await expect(save(value), `${value} は通るはず`).resolves.toBeDefined();
      for (const value of ["24:00", "23:60", "3:15", "03:5", "abc"]) await expectViolation(save(value), constraint, value);
    });

    it("就寝・起床を保存して読み戻せる。他の項目だけ保存しても変わらず、空にすれば null", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-03-01", { sleepBedtime: "23:30", sleepWakeTime: "06:05" });
      await daysModule.saveDay("2026-03-01", { morningWeightKg: "70.00" });
      const kept = await daysModule.getDay("2026-03-01");
      expect(kept?.sleepBedtime).toBe("23:30");
      expect(kept?.sleepWakeTime).toBe("06:05");

      await daysModule.saveDay("2026-03-01", { sleepBedtime: null });
      const cleared = await daysModule.getDay("2026-03-01");
      expect(cleared?.sleepBedtime).toBeNull();
      expect(cleared?.sleepWakeTime).toBe("06:05");
    });
  });

  describe("meals(食事)", () => {
    // 必須の列だけを埋めた食事。テストごとに、調べる列だけを上書きする
    const mealValues = (dayId: number, userId: string, overrides: Record<string, unknown> = {}) => ({
      userId,
      dayId,
      eatenTime: "12:30",
      dishName: "焼鮭定食",
      kcal: 600,
      proteinG: "30.0",
      fatG: "15.0",
      netCarbG: "70.0",
      items: [],
      ...overrides,
    });
    const insertMeal = (dayId: number, overrides: Record<string, unknown> = {}, userId = USER_A) =>
      dbModule.db.insert(schema.meals).values(mealValues(dayId, userId, overrides));
    const makeDay = async (date = "2026-03-05", userId = USER_A) => {
      currentUser.id = userId;
      return daysModule.saveDay(date, {});
    };

    // 端の値は meal-limits.ts の db の範囲から作る。定数と実際の DB(マイグレーション)が食い違うと落ちる
    const cases = (Object.keys(MEAL_LIMITS) as MealLimitedField[]).map((field) => {
      const { db, scale } = MEAL_LIMITS[field];
      const step = 10 ** -scale;
      const value = (n: number) => (scale === 0 ? n : n.toFixed(scale));
      return {
        field,
        constraint: `meals_${field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}_range`,
        passes: [value(db.min), value(db.max)],
        fails: [value(db.min - step), value(db.max + step)],
      };
    });

    it.each(cases)("$constraint: 端の値は通り、直外の値は拒否される", async ({ field, constraint, passes, fails }) => {
      const day = await makeDay();
      for (const value of passes) {
        await expect(insertMeal(day.id, { [field]: value }), `${field}=${value} は通るはず`).resolves.toBeDefined();
      }
      for (const value of fails) await expectViolation(insertMeal(day.id, { [field]: value }), constraint, `${field}=${value}`);
    });

    it("食物繊維と食塩相当量は、空(null)でもよい。ほかの合計は必須", async () => {
      const day = await makeDay();
      await expect(insertMeal(day.id, { fiberG: null, saltG: null })).resolves.toBeDefined();
      await expect(insertMeal(day.id, { kcal: null })).rejects.toThrow();
    });

    it("meals_eaten_time_format: 00:00〜26:59 は通り、27:00 以降と不正な形は拒否される", async () => {
      const day = await makeDay();
      for (const time of ["00:00", "03:00", "23:59", "24:00", "26:59"]) {
        await expect(insertMeal(day.id, { eatenTime: time }), `${time} は通るはず`).resolves.toBeDefined();
      }
      for (const time of ["27:00", "26:60", "3:15", "03:5", "abc", "99:99"]) {
        await expectViolation(insertMeal(day.id, { eatenTime: time }), "meals_eaten_time_format", time);
      }
    });

    it("存在しない日には紐づけられない(外部キー)", async () => {
      await expectViolation(insertMeal(2_000_000_000), "meals_user_day_fk", "day_id=2000000000");
    });

    it("他のユーザーの日には、食事を紐づけられない(user_id と day の持ち主が一致しなければ、DB が拒否する)", async () => {
      const dayOfB = await makeDay("2026-03-05", USER_B);

      // A の user_id で、B の日に紐づけようとする
      await expectViolation(insertMeal(dayOfB.id, {}, USER_A), "meals_user_day_fk", "A の食事を B の日に");
      // B の持ち主として挿入するなら通る(拒否されるのは、持ち主の食い違いだけ)
      await expect(insertMeal(dayOfB.id, {}, USER_B)).resolves.toBeDefined();
    });

    it("日の持ち主を変えるような更新も、食事が残っていれば拒否される", async () => {
      const { eq } = await import("drizzle-orm");
      const day = await makeDay("2026-03-05", USER_A);
      await insertMeal(day.id);

      await expect(
        dbModule.db.update(schema.meals).set({ userId: USER_B }).where(eq(schema.meals.dayId, day.id)),
      ).rejects.toThrow();
    });

    it("日を消すと、その日の食事も消える(ほかの日の食事は残る)", async () => {
      const { eq } = await import("drizzle-orm");
      const day = await makeDay("2026-03-05");
      const other = await makeDay("2026-03-06");
      await insertMeal(day.id);
      await insertMeal(day.id, { eatenTime: "19:00" });
      await insertMeal(other.id);

      await dbModule.db.delete(schema.days).where(eq(schema.days.id, day.id));

      const rest = await dbModule.db.select().from(schema.meals).where(eq(schema.meals.userId, USER_A));
      expect(rest.map((meal) => meal.dayId)).toEqual([other.id]);
    });

    it("ユーザーを消すと、そのユーザーの食事も消える(ほかのユーザーの食事は残る)", async () => {
      const { eq } = await import("drizzle-orm");
      const dayA = await makeDay("2026-03-05", USER_A);
      const dayB = await makeDay("2026-03-05", USER_B);
      await insertMeal(dayA.id, {}, USER_A);
      await insertMeal(dayB.id, {}, USER_B);

      await dbModule.db.delete(schema.user).where(eq(schema.user.id, USER_A));

      expect(await dbModule.db.select().from(schema.meals).where(eq(schema.meals.userId, USER_A))).toEqual([]);
      expect(await dbModule.db.select().from(schema.meals).where(eq(schema.meals.userId, USER_B))).toHaveLength(1);
    });

    it("jsonb の内訳(items)は、入れた形のまま読み戻せる", async () => {
      const { eq } = await import("drizzle-orm");
      const day = await makeDay();
      const items = [{ name: "焼鮭", kcal: 200 }, { name: "ご飯", kcal: 250 }];
      await insertMeal(day.id, { items });

      const [row] = await dbModule.db.select().from(schema.meals).where(eq(schema.meals.dayId, day.id));
      expect(row.items).toEqual(items);
    });
  });

  describe("meals の保存処理(lib/meals.ts)", () => {
    const item = { name: "焼鮭", amount: "1切れ 約80g", kcal: 150, proteinG: 18, fatG: 8, carbohydrateG: 0, fiberG: 0, saltG: 1.4 };
    const input = (overrides: Partial<import("@/lib/meals").MealInput> = {}): import("@/lib/meals").MealInput => ({
      eatenTime: "12:30",
      dishName: "焼鮭定食",
      alias: null,
      description: "焼鮭と白ご飯",
      items: [item],
      totals: { kcal: 432, proteinG: 24.3, fatG: 9.5, netCarbG: 57.7, fiberG: 1.2, saltG: 2.6 },
      ...overrides,
    });
    const DATE = "2026-04-10";

    it("食事から日の行ができたときも、プロフィールの値を写す。写しが null の日は今のプロフィールで補う", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1900, activityLevel: "1.2" });
      await mealsModule.saveMeal("2026-10-22", input());
      await profilesModule.updateProfile({ targetCalories: 1600, activityLevel: "1.725" });
      expect((await daysModule.getDayBasis("2026-10-22")).profile.targetCalories).toBe(1900);

      // 写しが無い(null)日は、今の値になる
      const { and, eq } = await import("drizzle-orm");
      await dbModule.db
        .update(schema.days)
        .set({ profileTargetCalories: null, profileActivityLevel: null })
        .where(and(eq(schema.days.userId, USER_A), eq(schema.days.date, "2026-10-22")));
      const basis = await daysModule.getDayBasis("2026-10-22");
      expect(basis.profile.targetCalories).toBe(1600);
      expect(basis.profile.activityLevel).toBe("1.725");
    });

    it("保存すると、その日の days の行が無ければ空で作られ、合計が列の形で入る", async () => {
      currentUser.id = USER_A;
      const meal = await mealsModule.saveMeal(DATE, input());

      expect(meal).toMatchObject({
        userId: USER_A,
        eatenTime: "12:30",
        dishName: "焼鮭定食",
        alias: null,
        kcal: 432,
        proteinG: "24.3",
        fatG: "9.5",
        netCarbG: "57.7",
        fiberG: "1.2",
        saltG: "2.6",
        itemsValid: true,
      });
      const day = await daysModule.getDay(DATE);
      expect(day).not.toBeNull();
      expect(day?.id).toBe(meal.dayId);
      expect(day?.morningWeightKg).toBeNull(); // 空の日の行(体重などは未入力のまま)
    });

    it("同じ日に 2 食保存しても、days の行は 1 つのまま(同じ日に紐づく)。すでにある日の記録は変わらない", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay(DATE, { morningWeightKg: "70.00", reflection: "良い日" });
      const first = await mealsModule.saveMeal(DATE, input());
      const second = await mealsModule.saveMeal(DATE, input({ eatenTime: "19:00" }));

      expect(second.dayId).toBe(first.dayId);
      expect(await listAllDays()).toHaveLength(1);
      expect(await daysModule.getDay(DATE)).toMatchObject({ morningWeightKg: "70.00", reflection: "良い日" });
    });

    it("食物繊維・食塩相当量が null のまま保存でき、一覧は食べた時刻の順(24 時以降は最後)", async () => {
      currentUser.id = USER_A;
      await mealsModule.saveMeal(DATE, input({ eatenTime: "25:30", dishName: "夜食のラーメン" }));
      await mealsModule.saveMeal(DATE, input({ eatenTime: "19:00", dishName: "夕食" }));
      await mealsModule.saveMeal(DATE, input({ eatenTime: "07:30", dishName: "朝食", totals: { ...input().totals, fiberG: null, saltG: null } }));

      const list = await mealsModule.listMealsOfDay(DATE);
      expect(list.map((meal) => meal.dishName)).toEqual(["朝食", "夕食", "夜食のラーメン"]);
      expect(list[0]).toMatchObject({ fiberG: null, saltG: null });
    });

    it("内訳(items)は、読むときも検証される。形が壊れた jsonb は、空にして itemsValid が false", async () => {
      currentUser.id = USER_A;
      const meal = await mealsModule.saveMeal(DATE, input());
      expect(meal.items).toEqual([item]);

      const { eq } = await import("drizzle-orm");
      await dbModule.db.update(schema.meals).set({ items: [{ name: "壊れた", kcal: "文字列" }] }).where(eq(schema.meals.id, meal.id));
      const [broken] = await mealsModule.listMealsOfDay(DATE);
      expect(broken).toMatchObject({ items: [], itemsValid: false });
    });

    it("1 件取得・更新・削除ができる(更新しても、日と作成日時は変わらない)", async () => {
      currentUser.id = USER_A;
      const meal = await mealsModule.saveMeal(DATE, input());

      const found = await mealsModule.getMeal(meal.id);
      expect(found?.date).toBe(DATE);
      expect(found?.meal.dishName).toBe("焼鮭定食");

      const updated = await mealsModule.updateMeal(meal.id, input({ eatenTime: "13:00", alias: "ホテルの鮭定食", totals: { ...input().totals, kcal: 900 } }));
      expect(updated).toMatchObject({ id: meal.id, dayId: meal.dayId, eatenTime: "13:00", alias: "ホテルの鮭定食", kcal: 900 });
      expect(updated?.createdAt).toEqual(meal.createdAt);

      expect(await mealsModule.deleteMeal(meal.id)).toBe(true);
      expect(await mealsModule.getMeal(meal.id)).toBeNull();
      expect(await mealsModule.deleteMeal(meal.id)).toBe(false); // もう無い
    });

    it("他のユーザーの食事は、一覧にも取得にも出ず、更新も削除もできない", async () => {
      currentUser.id = USER_A;
      const meal = await mealsModule.saveMeal(DATE, input());

      currentUser.id = USER_B;
      expect(await mealsModule.listMealsOfDay(DATE)).toEqual([]);
      expect(await mealsModule.getMeal(meal.id)).toBeNull();
      expect(await mealsModule.updateMeal(meal.id, input({ dishName: "乗っ取り" }))).toBeNull();
      expect(await mealsModule.deleteMeal(meal.id)).toBe(false);

      currentUser.id = USER_A;
      expect((await mealsModule.getMeal(meal.id))?.meal.dishName).toBe("焼鮭定食"); // 変わっていない
    });

    it("同じ日付でも、ユーザーごとに別の日に紐づく(他のユーザーの days を使わない)", async () => {
      currentUser.id = USER_A;
      const mealA = await mealsModule.saveMeal(DATE, input());
      currentUser.id = USER_B;
      const mealB = await mealsModule.saveMeal(DATE, input());

      expect(mealB.dayId).not.toBe(mealA.dayId);
      expect(mealB.userId).toBe(USER_B);
      expect(await mealsModule.listMealsOfDay(DATE)).toHaveLength(1);
    });

    it("int4 の範囲外の id は、DB に渡さず、「無い」として返す(DB のエラーにならない)", async () => {
      currentUser.id = USER_A;
      for (const id of [2_147_483_648, 9_999_999_999, 0, -1, 1.5, Number.NaN]) {
        expect(await mealsModule.getMeal(id)).toBeNull();
        expect(await mealsModule.updateMeal(id, input())).toBeNull();
        expect(await mealsModule.deleteMeal(id)).toBe(false);
      }
      // 範囲の端(2147483647)は、DB に渡して「無い」と返る(存在しない id)
      expect(await mealsModule.getMeal(2_147_483_647)).toBeNull();
    });

    it("未ログインなら、どの関数も /login へ送られ、DB には何も書かれない", async () => {
      currentUser.id = "";
      const nothingWritten = async () => {
        currentUser.id = USER_A;
        expect(await mealsModule.listMealsOfDay(DATE)).toEqual([]);
        expect(await listAllDays()).toEqual([]);
        currentUser.id = "";
      };

      await expect(mealsModule.saveMeal(DATE, input())).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(mealsModule.listMealsOfDay(DATE)).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(mealsModule.getMeal(1)).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(mealsModule.updateMeal(1, input())).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(mealsModule.deleteMeal(1)).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(mealsModule.listRecentDishNames()).rejects.toThrow("NEXT_REDIRECT:/login");
      await nothingWritten();
    });

    it("日付が不正なら、保存も一覧もエラーになる(認証のあとで検証する)", async () => {
      currentUser.id = USER_A;
      await expect(mealsModule.saveMeal("2026-02-30", input())).rejects.toThrow("invalid date");
      await expect(mealsModule.listMealsOfDay("abc")).rejects.toThrow("invalid date");
      expect(await listAllDays()).toEqual([]);
    });

    it("範囲外の値は、DB の CHECK 制約が最後に止める(保存は失敗し、食事は残らない)", async () => {
      currentUser.id = USER_A;
      await expectViolation(mealsModule.saveMeal(DATE, input({ eatenTime: "27:00" })), "meals_eaten_time_format", "27:00");
      await expectViolation(
        mealsModule.saveMeal(DATE, input({ totals: { ...input().totals, kcal: 20001 } })),
        "meals_kcal_range",
        "kcal 20001",
      );
      expect(await mealsModule.listMealsOfDay(DATE)).toEqual([]);
    });

    it("過去の料理名の一覧: 最近使った順で、重複なし、別名(alias)は入れず、自分の分だけ、件数の上限がある", async () => {
      currentUser.id = USER_A;
      await mealsModule.saveMeal("2026-04-01", input({ dishName: "カレー" }));
      await mealsModule.saveMeal("2026-04-02", input({ dishName: "焼鮭定食", alias: "ホテルの鮭" }));
      await mealsModule.saveMeal("2026-04-03", input({ dishName: "カレー" })); // 最後に使った
      currentUser.id = USER_B;
      await mealsModule.saveMeal("2026-04-04", input({ dishName: "他人の料理" }));

      currentUser.id = USER_A;
      expect(await mealsModule.listRecentDishNames()).toEqual(["カレー", "焼鮭定食"]);
      expect(await mealsModule.listRecentDishNames(1)).toEqual(["カレー"]);
    });
  });

  describe("AI の呼び出しの回数制限(lib/ai-limit.ts)", () => {
    // n 件の記録を、ago 前に作る(DB の now() 基準。アプリと DB のタイムゾーンの違いに左右されない)
    const seed = async (userId: string, n: number, ago: string) => {
      const { sql } = await import("drizzle-orm");
      await dbModule.db.insert(schema.aiRequests).values(Array.from({ length: n }, () => ({ userId, createdAt: sql`now() - ${ago}::interval` })));
    };
    const countOf = async (userId: string) => {
      const { eq } = await import("drizzle-orm");
      return (await dbModule.db.select().from(schema.aiRequests).where(eq(schema.aiRequests.userId, userId))).length;
    };

    it("上限の回数までは通り、超えたら通さず、記録も増やさない", async () => {
      currentUser.id = USER_A;
      for (let i = 0; i < aiLimitModule.AI_LIMITS.perHour; i++) {
        expect(await aiLimitModule.consumeAiRequest(), `${i + 1} 回目は通るはず`).toEqual({ ok: true });
      }
      const over = await aiLimitModule.consumeAiRequest();
      expect(over).toEqual({ ok: false, message: aiLimitModule.AI_LIMIT_MESSAGE });
      expect(await countOf(USER_A)).toBe(aiLimitModule.AI_LIMITS.perHour);
    });

    it("同時に何本送っても、通るのは上限まで(並列の要求が、すべて「0 件」を見て通らない)", async () => {
      currentUser.id = USER_A;
      const results = await Promise.all(Array.from({ length: 60 }, () => aiLimitModule.consumeAiRequest()));

      expect(results.filter((result) => result.ok)).toHaveLength(aiLimitModule.AI_LIMITS.perHour);
      expect(results.filter((result) => !result.ok)).toHaveLength(60 - aiLimitModule.AI_LIMITS.perHour);
      expect(await countOf(USER_A)).toBe(aiLimitModule.AI_LIMITS.perHour); // 記録も、上限までしか増えない
    });

    it("同時に送っても、残りの回数だけ通る(すでに 15 回使っていれば、残り 5 回)", async () => {
      await seed(USER_A, 15, "10 minutes");
      currentUser.id = USER_A;
      const results = await Promise.all(Array.from({ length: 30 }, () => aiLimitModule.consumeAiRequest()));

      expect(results.filter((result) => result.ok)).toHaveLength(aiLimitModule.AI_LIMITS.perHour - 15);
      expect(await countOf(USER_A)).toBe(aiLimitModule.AI_LIMITS.perHour);
    });

    it("同時に送る要求は、ユーザーごとに別々に数える(一方が使い切っても、他方は上限まで通る)", async () => {
      // currentUser は 1 つなので、ユーザーごとに順に並列で呼ぶ(各ユーザーの 30 本は、それぞれ同時)
      currentUser.id = USER_A;
      const a = await Promise.all(Array.from({ length: 30 }, () => aiLimitModule.consumeAiRequest()));
      currentUser.id = USER_B;
      const b = await Promise.all(Array.from({ length: 30 }, () => aiLimitModule.consumeAiRequest()));

      expect(a.filter((result) => result.ok)).toHaveLength(aiLimitModule.AI_LIMITS.perHour);
      expect(b.filter((result) => result.ok)).toHaveLength(aiLimitModule.AI_LIMITS.perHour);
    });

    it("制限はユーザーごと(他のユーザーが使い切っても、自分は通る)", async () => {
      await seed(USER_A, aiLimitModule.AI_LIMITS.perHour, "1 minute");
      currentUser.id = USER_A;
      expect((await aiLimitModule.consumeAiRequest()).ok).toBe(false);
      currentUser.id = USER_B;
      expect(await aiLimitModule.consumeAiRequest()).toEqual({ ok: true });
    });

    it("1 時間より前の記録は、1 時間の上限に数えない", async () => {
      await seed(USER_A, aiLimitModule.AI_LIMITS.perHour, "2 hours");
      currentUser.id = USER_A;
      expect(await aiLimitModule.consumeAiRequest()).toEqual({ ok: true });
    });

    it("1 日の上限もある(1 時間より前でも、1 日以内なら数える)", async () => {
      await seed(USER_A, aiLimitModule.AI_LIMITS.perDay, "3 hours");
      currentUser.id = USER_A;
      expect((await aiLimitModule.consumeAiRequest()).ok).toBe(false);
    });

    it("1 日より前の記録は、1 日の上限に数えない", async () => {
      await seed(USER_A, aiLimitModule.AI_LIMITS.perDay, "25 hours");
      currentUser.id = USER_A;
      expect(await aiLimitModule.consumeAiRequest()).toEqual({ ok: true });
    });

    it("2 日より古い記録は、記録を足すときに消える(表が育たない)", async () => {
      await seed(USER_A, 5, "3 days");
      currentUser.id = USER_A;
      await aiLimitModule.consumeAiRequest();
      expect(await countOf(USER_A)).toBe(1);
    });

    it("未ログインなら /login へ送られ、何も記録されない", async () => {
      currentUser.id = "";
      await expect(aiLimitModule.consumeAiRequest()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(await countOf(USER_A)).toBe(0);
    });
  });

  describe("食事の Server Action(meals/actions.ts)", () => {
    const DATE = "2026-04-10";
    const item = { name: "焼鮭", amount: "1切れ 約80g", kcal: 150, proteinG: 18, fatG: 8, carbohydrateG: 0, fiberG: 0, saltG: 1.4 };
    const rice = { name: "白ご飯", amount: "約150g", kcal: 252, proteinG: 3.8, fatG: 0.5, carbohydrateG: 55.7, fiberG: 0.5, saltG: 0 };
    const estimate = { dishName: "焼鮭定食", description: "焼鮭と白ご飯", items: [item, rice] };
    const aiReply = JSON.stringify({ isMeal: true, notMealReason: "", ...estimate });
    const payload = (overrides: Record<string, unknown> = {}) => ({ eatenTime: "12:30", alias: "", estimate, ...overrides });
    const mealsOf = async (userId: string) => {
      const { eq } = await import("drizzle-orm");
      return dbModule.db.select().from(schema.meals).where(eq(schema.meals.userId, userId));
    };
    const aiRequestsOf = async (userId: string) => {
      const { eq } = await import("drizzle-orm");
      return (await dbModule.db.select().from(schema.aiRequests).where(eq(schema.aiRequests.userId, userId))).length;
    };
    const expectRedirectTo = (promise: Promise<unknown>, url: string) => expect(promise).rejects.toThrow(`NEXT_REDIRECT:${url}`);

    describe("estimateMealAction", () => {
      // 波括弧で囲む: アロー関数の式の値(モック自身)を返すと、Vitest が「後片付けの関数」として、テストのあとに呼んでしまう
      beforeEach(() => {
        ai.complete.mockResolvedValue(aiReply);
      });

      it("推定を返す(合計はコードで計算)。1 回分を数えるが、食事は保存しない", async () => {
        currentUser.id = USER_A;
        const result = await mealActionsModule.estimateMealAction({ text: "焼鮭定食" });

        expect(result.ok && result.estimate.totals).toMatchObject({ kcal: 402, proteinG: 21.8, fatG: 8.5 });
        expect(ai.complete).toHaveBeenCalledTimes(1);
        expect(await aiRequestsOf(USER_A)).toBe(1);
        expect(await mealsOf(USER_A)).toEqual([]);
      });

      it("過去の料理名(自分の分だけ)を AI に渡す", async () => {
        currentUser.id = USER_B;
        await mealsModule.saveMeal(DATE, { eatenTime: "12:00", dishName: "他人のカレー", alias: null, description: "x", items: [item], totals: { kcal: 1, proteinG: 1, fatG: 1, netCarbG: 1, fiberG: null, saltG: null } });
        currentUser.id = USER_A;
        await mealsModule.saveMeal(DATE, { eatenTime: "12:00", dishName: "自分の親子丼", alias: null, description: "x", items: [item], totals: { kcal: 1, proteinG: 1, fatG: 1, netCarbG: 1, fiberG: null, saltG: null } });

        await mealActionsModule.estimateMealAction({ text: "焼鮭定食" });
        const userMessage = JSON.stringify(ai.complete.mock.calls[0][0].messages[1].content);
        expect(userMessage).toContain("自分の親子丼");
        expect(userMessage).not.toContain("他人のカレー");
      });

      it("未ログインなら /login へ送られ、AI も呼ばず、回数も数えない", async () => {
        currentUser.id = "";
        await expect(mealActionsModule.estimateMealAction({ text: "焼鮭定食" })).rejects.toThrow("NEXT_REDIRECT:/login");
        expect(ai.complete).not.toHaveBeenCalled();
        expect(await aiRequestsOf(USER_A)).toBe(0);
      });

      it.each([
        ["文章も写真も無い", { text: "  " }],
        ["文章が長すぎる", { text: "あ".repeat(2001) }],
        ["写真が偽物", { text: "x", imageDataUrls: ["data:image/png;base64,AAAA"] }],
        ["写真が 5 枚(別々の写真)", { text: "x", imageDataUrls: Array.from({ length: 5 }, (_, n) => `data:image/png;base64,AAA${n}`) }],
        ["形が違う入力", { foo: 1 }],
        ["null", null],
        ["文字列", "焼鮭"],
      ])("不正な入力は、AI を呼ばず、回数も数えずに失敗にする: %s", async (_label, raw) => {
        currentUser.id = USER_A;
        const result = await mealActionsModule.estimateMealAction(raw);
        expect(result.ok).toBe(false);
        expect(ai.complete).not.toHaveBeenCalled();
        expect(await aiRequestsOf(USER_A)).toBe(0);
      });

      it("回数の上限に達していたら、AI を呼ばずに失敗にする", async () => {
        currentUser.id = USER_A;
        for (let i = 0; i < aiLimitModule.AI_LIMITS.perHour; i++) await aiLimitModule.consumeAiRequest();

        const result = await mealActionsModule.estimateMealAction({ text: "焼鮭定食" });
        expect(result).toEqual({ ok: false, message: aiLimitModule.AI_LIMIT_MESSAGE });
        expect(ai.complete).not.toHaveBeenCalled();
      });

      it("食べ物でない入力(AI が isMeal を false で返した)は、推定を返さず、何も保存されない(回数は数える)", async () => {
        ai.complete.mockResolvedValue(JSON.stringify({ isMeal: false, notMealReason: "子猫の写真で、食べ物ではないため", dishName: "", description: "", items: [] }));
        currentUser.id = USER_A;

        const result = await mealActionsModule.estimateMealAction({ text: "子猫の写真" });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain("子猫の写真で、食べ物ではないため");
        expect(await mealsOf(USER_A)).toEqual([]);
        expect(await aiRequestsOf(USER_A)).toBe(1); // AI は呼んだので、1 回分は数える
      });

      it("AI が失敗(HTTP 400)しても、画面には利用者向けの文言を返す(内部の理由は返さない)", async () => {
        // 本物の completeJson を、400 を返す偽の fetch で動かす(モックの中で例外を投げずに、実際の失敗の経路を通す)
        const actual = await vi.importActual<typeof import("@/lib/openrouter")>("@/lib/openrouter");
        vi.stubEnv("OPENROUTER_API_KEY", "test-key");
        vi.stubEnv("OPENROUTER_MODEL", "test/model");
        const failingFetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "内部の理由" } }), { status: 400 }));
        ai.complete.mockImplementation((options: Parameters<typeof actual.completeJson>[0]) => actual.completeJson({ ...options, fetchImpl: failingFetch }));
        const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
        currentUser.id = USER_A;

        const result = await mealActionsModule.estimateMealAction({ text: "焼鮭定食" });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).not.toContain("内部の理由");
        expect(failingFetch).toHaveBeenCalledTimes(1);
        errorLog.mockRestore();
        vi.unstubAllEnvs();
      });
    });

    describe("saveMealAction", () => {
      beforeEach(readyProfiles);
      it("保存して、画面の再取得を依頼し、その日の詳細へ移動する。合計は、届いた値ではなく内訳から計算し直す", async () => {
        currentUser.id = USER_A;
        // 画面から、嘘の合計(kcal: 1)を紛れ込ませても、使われない
        const forged = payload({ estimate: { ...estimate, totals: { kcal: 1 }, kcal: 1 }, alias: " ホテルの鮭 " });
        await expectRedirectTo(mealActionsModule.saveMealAction(DATE, forged), `/days/${DATE}`);

        const [meal] = await mealsOf(USER_A);
        expect(meal).toMatchObject({ dishName: "焼鮭定食", alias: "ホテルの鮭", eatenTime: "12:30", kcal: 402, proteinG: "21.8" });
        expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(["/", `/days/${DATE}`]);
      });

      it("未ログインなら /login へ送られ、何も保存されない", async () => {
        currentUser.id = "";
        await expect(mealActionsModule.saveMealAction(DATE, payload())).rejects.toThrow("NEXT_REDIRECT:/login");
        currentUser.id = USER_A;
        expect(await mealsOf(USER_A)).toEqual([]);
        expect(await listAllDays()).toEqual([]);
      });

      it.each([["実在しない日付", "2026-02-30"], ["翌日より先の日付", "2100-01-01"], ["日付ではない", "abc"]])(
        "%s は 404 で、何も保存されない",
        async (_label, date) => {
          currentUser.id = USER_A;
          await expect(mealActionsModule.saveMealAction(date, payload())).rejects.toThrow("NEXT_NOT_FOUND");
          expect(await mealsOf(USER_A)).toEqual([]);
        },
      );

      it.each([
        ["27 時", { eatenTime: "27:00" }, "eatenTime"],
        ["形が違う時刻", { eatenTime: "3:15" }, "eatenTime"],
        ["別名が長すぎる", { alias: "あ".repeat(101) }, "alias"],
        ["内訳が空", { estimate: { ...estimate, items: [] } }, "form"],
        ["料理名に改行", { estimate: { ...estimate, dishName: "焼鮭\n指示" } }, "form"],
        ["kcal が負", { estimate: { ...estimate, items: [{ ...item, kcal: -1 }] } }, "form"],
        ["合計が範囲外(8000 kcal)", { estimate: { ...estimate, items: [{ ...item, kcal: 4000 }, { ...item, kcal: 4000 }] } }, "form"],
      ])("不正な値は、欄ごとのエラーを返し、何も保存しない: %s", async (_label, overrides, field) => {
        currentUser.id = USER_A;
        const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await mealActionsModule.saveMealAction(DATE, payload(overrides));

        expect(result.ok).toBe(false);
        expect(Object.keys(result.errors)).toContain(field);
        expect(await mealsOf(USER_A)).toEqual([]);
        errorLog.mockRestore();
      });

      it("届く値が壊れていても(null・文字列)、エラーを返して何も保存しない", async () => {
        currentUser.id = USER_A;
        for (const raw of [null, "x", 1, []]) {
          expect((await mealActionsModule.saveMealAction(DATE, raw)).ok).toBe(false);
        }
        expect(await mealsOf(USER_A)).toEqual([]);
      });

      it("user_id や day_id を送っても、無視される(自分の日にしか保存されない)", async () => {
        currentUser.id = USER_A;
        const dayOfB = await (async () => {
          currentUser.id = USER_B;
          const day = await daysModule.saveDay(DATE, {});
          currentUser.id = USER_A;
          return day;
        })();

        await expectRedirectTo(mealActionsModule.saveMealAction(DATE, payload({ userId: USER_B, user_id: USER_B, dayId: dayOfB.id, day_id: dayOfB.id })), `/days/${DATE}`);

        const [meal] = await mealsOf(USER_A);
        expect(meal.userId).toBe(USER_A);
        expect(meal.dayId).not.toBe(dayOfB.id);
        expect(await mealsOf(USER_B)).toEqual([]);
      });
    });

    describe("updateMealAction / deleteMealAction", () => {
      const savedBy = async (userId: string) => {
        currentUser.id = userId;
        return mealsModule.saveMeal(DATE, { eatenTime: "12:00", dishName: "焼鮭定食", alias: null, description: "x", items: [item], totals: { kcal: 150, proteinG: 18, fatG: 8, netCarbG: 0, fiberG: 0, saltG: 1.4 } });
      };

      it("自分の食事を直せる。その日の詳細へ移動し、画面の再取得を依頼する", async () => {
        const meal = await savedBy(USER_A);
        await expectRedirectTo(mealActionsModule.updateMealAction(meal.id, payload({ eatenTime: "19:00", alias: "夕飯" })), `/days/${DATE}`);

        const [updated] = await mealsOf(USER_A);
        expect(updated).toMatchObject({ id: meal.id, eatenTime: "19:00", alias: "夕飯", kcal: 402 });
        expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(["/", `/days/${DATE}`]);
      });

      it("他のユーザーの食事は、直せず消せない(404 で、中身は変わらない)", async () => {
        const meal = await savedBy(USER_A);
        currentUser.id = USER_B;

        await expect(mealActionsModule.updateMealAction(meal.id, payload({ alias: "乗っ取り" }))).rejects.toThrow("NEXT_NOT_FOUND");
        await expect(mealActionsModule.deleteMealAction(meal.id)).rejects.toThrow("NEXT_NOT_FOUND");

        const [kept] = await mealsOf(USER_A);
        expect(kept).toMatchObject({ id: meal.id, alias: null, kcal: 150 });
      });

      it("自分の食事を消せる。その日の詳細へ移動する", async () => {
        const meal = await savedBy(USER_A);
        await expectRedirectTo(mealActionsModule.deleteMealAction(meal.id), `/days/${DATE}`);
        expect(await mealsOf(USER_A)).toEqual([]);
        // 食事を消しても、日(days)の行は残る
        expect(await daysModule.getDay(DATE)).not.toBeNull();
      });

      it.each([[0], [-1], [1.5], [Number.NaN], [2_147_483_648], [9_999_999_999], [Number.MAX_SAFE_INTEGER], [Infinity]])("不正な id(%s)は 404(DB のエラー(500)にならない)", async (id) => {
        currentUser.id = USER_A;
        await expect(mealActionsModule.updateMealAction(id, payload())).rejects.toThrow("NEXT_NOT_FOUND");
        await expect(mealActionsModule.deleteMealAction(id)).rejects.toThrow("NEXT_NOT_FOUND");
      });

      it("未ログインなら /login へ送られ、何も変わらない", async () => {
        const meal = await savedBy(USER_A);
        currentUser.id = "";
        await expect(mealActionsModule.updateMealAction(meal.id, payload({ alias: "x" }))).rejects.toThrow("NEXT_REDIRECT:/login");
        await expect(mealActionsModule.deleteMealAction(meal.id)).rejects.toThrow("NEXT_REDIRECT:/login");
        expect(await mealsOf(USER_A)).toHaveLength(1);
      });
    });
  });

  describe("運動(lib/exercises.ts と exercises/actions.ts)", () => {
    const DATE = "2026-05-12";
    const input = { type: "walk", intensity: "normal", minutes: 30, startTime: null, memo: null };
    const formOf = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      return formData;
    };
    const validForm = (overrides: Record<string, string> = {}) => formOf({ type: "walk", intensity: "normal", minutes: "30", startTime: "", memo: "", ...overrides });
    const exercisesOf = async (userId: string) => {
      const { eq } = await import("drizzle-orm");
      return dbModule.db.select().from(schema.exercises).where(eq(schema.exercises.userId, userId));
    };
    const insertExercise = (dayId: number, overrides: Record<string, unknown> = {}, userId = USER_A) =>
      dbModule.db.insert(schema.exercises).values({ userId, dayId, type: "walk", intensity: "normal", minutes: 30, ...overrides });
    const makeDay = async (date = DATE, userId = USER_A) => {
      currentUser.id = userId;
      return daysModule.saveDay(date, {});
    };

    describe("DB の制約", () => {
      it("exercises_minutes_range: db の範囲の端は通り、直外は拒否される", async () => {
        const day = await makeDay();
        const { min, max } = EXERCISE_LIMITS.minutes.db;
        for (const minutes of [min, max]) await expect(insertExercise(day.id, { minutes })).resolves.toBeDefined();
        for (const minutes of [min - 1, max + 1]) await expectViolation(insertExercise(day.id, { minutes }), "exercises_minutes_range", String(minutes));
      });

      it("exercises_intensity_values: light / normal / hard だけ通る。種類は文字列なら何でも入る(種類の追加でマイグレーションが要らない)", async () => {
        const day = await makeDay();
        for (const intensity of ["light", "normal", "hard"]) await expect(insertExercise(day.id, { intensity })).resolves.toBeDefined();
        for (const intensity of ["", "easy", "HARD"]) await expectViolation(insertExercise(day.id, { intensity }), "exercises_intensity_values", intensity);
        await expect(insertExercise(day.id, { type: "future-type" })).resolves.toBeDefined();
      });

      it("exercises_start_time_format: 00:00〜26:59 の HH:MM か null だけ通る", async () => {
        const day = await makeDay();
        for (const startTime of [null, "00:00", "07:30", "23:59", "24:00", "26:59"]) await expect(insertExercise(day.id, { startTime })).resolves.toBeDefined();
        for (const startTime of ["27:00", "26:60", "7:30", "07:5", "ab:cd", ""]) {
          await expectViolation(insertExercise(day.id, { startTime }), "exercises_start_time_format", JSON.stringify(startTime));
        }
      });

      it("メモは 200 文字まで", async () => {
        const day = await makeDay();
        await expect(insertExercise(day.id, { memo: "あ".repeat(200) })).resolves.toBeDefined();
        await expect(insertExercise(day.id, { memo: "あ".repeat(201) })).rejects.toThrow();
      });

      it("他のユーザーの日には紐づけられない(複合外部キー)", async () => {
        const dayOfB = await makeDay(DATE, USER_B);
        await expectViolation(insertExercise(dayOfB.id, {}, USER_A), "exercises_user_day_fk", "A の運動を B の日に");
      });

      it("日を消すと、その日の運動も消える", async () => {
        const day = await makeDay();
        await insertExercise(day.id);
        const { eq } = await import("drizzle-orm");
        await dbModule.db.delete(schema.days).where(eq(schema.days.id, day.id));
        expect(await exercisesOf(USER_A)).toEqual([]);
      });
    });

    describe("lib/exercises.ts", () => {
      it("追加すると、その日の行が無ければ作られ、一覧には追加した順に出る", async () => {
        currentUser.id = USER_A;
        expect(await daysModule.getDay(DATE)).toBeNull();
        const first = await exercisesModule.saveExercise(DATE, input);
        const second = await exercisesModule.saveExercise(DATE, { ...input, type: "strength", minutes: 45, memo: "脚の日" });

        expect(await daysModule.getDay(DATE)).not.toBeNull();
        const list = await exercisesModule.listExercisesOfDay(DATE);
        expect(list.map((exercise) => exercise.id)).toEqual([first.id, second.id]);
        expect(list[1]).toMatchObject({ type: "strength", minutes: 45, memo: "脚の日", userId: USER_A });
      });

      it("一覧は開始時刻の早い順。時刻なしは最後で、同じ時刻や時刻なし同士は追加した順(24 時以降は深夜として最後のほう)", async () => {
        currentUser.id = USER_A;
        const none1 = await exercisesModule.saveExercise(DATE, input);
        const morning = await exercisesModule.saveExercise(DATE, { ...input, startTime: "07:30" });
        const none2 = await exercisesModule.saveExercise(DATE, input);
        const lateNight = await exercisesModule.saveExercise(DATE, { ...input, startTime: "25:10" });
        const sameAsMorning = await exercisesModule.saveExercise(DATE, { ...input, startTime: "07:30" });

        const list = await exercisesModule.listExercisesOfDay(DATE);
        expect(list.map((exercise) => exercise.id)).toEqual([morning.id, sameAsMorning.id, lateNight.id, none1.id, none2.id]);
        expect(list.map((exercise) => exercise.startTime)).toEqual(["07:30", "07:30", "25:10", null, null]);
      });

      it("直すと、開始時刻も変わる(時刻を消して null にもできる)", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, { ...input, startTime: "06:00" });
        expect((await exercisesModule.updateExercise(saved.id, { ...input, startTime: "18:45" }))?.startTime).toBe("18:45");
        expect((await exercisesModule.updateExercise(saved.id, { ...input, startTime: null }))?.startTime).toBeNull();
      });

      it("他のユーザーの運動は、一覧にも取得にも出ず、直せず、消せない", async () => {
        currentUser.id = USER_A;
        const mine = await exercisesModule.saveExercise(DATE, input);

        currentUser.id = USER_B;
        expect(await exercisesModule.listExercisesOfDay(DATE)).toEqual([]);
        expect(await exercisesModule.getExercise(mine.id)).toBeNull();
        expect(await exercisesModule.updateExercise(mine.id, { ...input, minutes: 99 })).toBeNull();
        expect(await exercisesModule.deleteExercise(mine.id)).toBe(false);

        currentUser.id = USER_A;
        expect((await exercisesModule.getExercise(mine.id))?.exercise.minutes).toBe(30);
      });

      it("直すと、日は変わらず中身だけが変わる。消すと一覧から消える", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, input);
        const updated = await exercisesModule.updateExercise(saved.id, { type: "indoor", intensity: "hard", minutes: 20, startTime: null, memo: "HIIT" });
        expect(updated).toMatchObject({ id: saved.id, dayId: saved.dayId, type: "indoor", intensity: "hard", minutes: 20, memo: "HIIT" });
        expect((await exercisesModule.getExercise(saved.id))?.date).toBe(DATE);

        expect(await exercisesModule.deleteExercise(saved.id)).toBe(true);
        expect(await exercisesModule.listExercisesOfDay(DATE)).toEqual([]);
      });

      it("1 日に追加できるのは 5 件まで。6 件目は ExerciseLimitError で、保存されない", async () => {
        currentUser.id = USER_A;
        expect(EXERCISE_MAX_PER_DAY).toBe(5);
        for (let n = 0; n < EXERCISE_MAX_PER_DAY; n++) await exercisesModule.saveExercise(DATE, input);

        await expect(exercisesModule.saveExercise(DATE, input)).rejects.toBeInstanceOf(exercisesModule.ExerciseLimitError);
        expect(await exercisesOf(USER_A)).toHaveLength(5);
      });

      it("上限は、日ごと・ユーザーごとに数える。消すと 1 件分が空き、直すのは上限に影響されない", async () => {
        currentUser.id = USER_A;
        const saved = [];
        for (let n = 0; n < EXERCISE_MAX_PER_DAY; n++) saved.push(await exercisesModule.saveExercise(DATE, input));

        await expect(exercisesModule.saveExercise("2026-05-13", input)).resolves.toBeDefined(); // 別の日
        currentUser.id = USER_B;
        await expect(exercisesModule.saveExercise(DATE, input)).resolves.toBeDefined(); // 別のユーザー

        currentUser.id = USER_A;
        await expect(exercisesModule.updateExercise(saved[0].id, { ...input, minutes: 99 })).resolves.toMatchObject({ minutes: 99 }); // 満杯でも直せる
        await exercisesModule.deleteExercise(saved[0].id);
        await expect(exercisesModule.saveExercise(DATE, input)).resolves.toBeDefined(); // 1 件空いた
        await expect(exercisesModule.saveExercise(DATE, input)).rejects.toBeInstanceOf(exercisesModule.ExerciseLimitError);
      });

      it("同時に届いた要求でも、上限を超えない(その日の行のロックで直列にする)", async () => {
        currentUser.id = USER_A;
        const results = await Promise.allSettled(Array.from({ length: 12 }, () => exercisesModule.saveExercise(DATE, input)));

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(EXERCISE_MAX_PER_DAY);
        for (const result of results) {
          if (result.status === "rejected") expect(result.reason).toBeInstanceOf(exercisesModule.ExerciseLimitError);
        }
        expect(await exercisesOf(USER_A)).toHaveLength(EXERCISE_MAX_PER_DAY);
      });

      it("範囲外の id は DB に渡さず、無いものとして扱う", async () => {
        currentUser.id = USER_A;
        for (const id of [0, -1, 1.5, 2_147_483_648, Number.NaN]) {
          expect(await exercisesModule.getExercise(id)).toBeNull();
          expect(await exercisesModule.updateExercise(id, input)).toBeNull();
          expect(await exercisesModule.deleteExercise(id)).toBe(false);
        }
      });

      it("日付が不正なら投げる。未ログインなら /login へ送る", async () => {
        currentUser.id = USER_A;
        await expect(exercisesModule.saveExercise("2026-02-30", input)).rejects.toThrow("invalid date");
        await expect(exercisesModule.listExercisesOfDay("abc")).rejects.toThrow("invalid date");
        currentUser.id = "";
        await expect(exercisesModule.listExercisesOfDay(DATE)).rejects.toThrow("NEXT_REDIRECT:/login");
        await expect(exercisesModule.getExercise(1)).rejects.toThrow("NEXT_REDIRECT:/login");
      });
    });

    describe("Server Action", () => {
      beforeEach(readyProfiles);
      it("追加: 保存してその日の詳細へ移動し、再描画を頼む。メモの空欄は null", async () => {
        currentUser.id = USER_A;
        await expect(exerciseActionsModule.saveExerciseAction(DATE, null, validForm())).rejects.toThrow(`NEXT_REDIRECT:/days/${DATE}`);

        const [saved] = await exercisesOf(USER_A);
        expect(saved).toMatchObject({ type: "walk", intensity: "normal", minutes: 30, memo: null });
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/days/${DATE}`);
        expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
      });

      it("追加: 開始時刻を保存する。空欄は null。24 時以降も保存できる", async () => {
        currentUser.id = USER_A;
        await expect(exerciseActionsModule.saveExerciseAction(DATE, null, validForm({ startTime: "07:05" }))).rejects.toThrow("NEXT_REDIRECT");
        await expect(exerciseActionsModule.saveExerciseAction(DATE, null, validForm({ startTime: "25:30" }))).rejects.toThrow("NEXT_REDIRECT");
        await expect(exerciseActionsModule.saveExerciseAction(DATE, null, validForm({ startTime: "" }))).rejects.toThrow("NEXT_REDIRECT");
        expect((await exercisesOf(USER_A)).map((exercise) => exercise.startTime).sort()).toEqual(["07:05", "25:30", null]);
      });

      it("追加: 開始時刻が範囲外・形が違うなら、保存せず、その欄のエラーを返す", async () => {
        currentUser.id = USER_A;
        for (const startTime of ["27:00", "12:60", "7:5", "abc"]) {
          const result = await exerciseActionsModule.saveExerciseAction(DATE, null, validForm({ startTime }));
          expect(result?.errors.startTime, startTime).toContain("0〜26");
          expect(result?.values).toMatchObject({ startTime });
        }
        expect(await exercisesOf(USER_A)).toEqual([]);
      });

      it("追加: その日が 5 件なら、保存せず、理由と入力した値を返す(移動もしない)", async () => {
        currentUser.id = USER_A;
        for (let n = 0; n < EXERCISE_MAX_PER_DAY; n++) await exercisesModule.saveExercise(DATE, input);

        const result = await exerciseActionsModule.saveExerciseAction(DATE, null, validForm({ memo: "残る" }));
        expect(result?.message).toContain("5 件までです");
        expect(result?.errors).toEqual({});
        expect(result?.values).toMatchObject({ memo: "残る" });
        expect(await exercisesOf(USER_A)).toHaveLength(5);
        expect(vi.mocked(redirect)).not.toHaveBeenCalled();
      });

      it("追加: フォームに user_id や day_id を紛れ込ませても無視される", async () => {
        currentUser.id = USER_A;
        const form = validForm({ userId: USER_B, user_id: USER_B, dayId: "999", id: "1" });
        await expect(exerciseActionsModule.saveExerciseAction(DATE, null, form)).rejects.toThrow("NEXT_REDIRECT");
        expect(await exercisesOf(USER_B)).toEqual([]);
        expect(await exercisesOf(USER_A)).toHaveLength(1);
      });

      it.each([
        ["種類が空", { type: "" }, "type"],
        ["種類が一覧に無い", { type: "swim" }, "type"],
        ["強さが空", { intensity: "" }, "intensity"],
        ["強さが一覧に無い", { intensity: "easy" }, "intensity"],
        ["時間が空", { minutes: "" }, "minutes"],
        ["時間が 0", { minutes: "0" }, "minutes"],
        ["時間が上限超え", { minutes: "601" }, "minutes"],
        ["時間が小数", { minutes: "1.5" }, "minutes"],
        ["時間が 16 進数", { minutes: "0x10" }, "minutes"],
        ["メモが長すぎる", { memo: "あ".repeat(201) }, "memo"],
      ])("追加: 検証に失敗したら、保存せず、欄ごとのエラーと入力した値を返す: %s", async (_label, overrides, field) => {
        currentUser.id = USER_A;
        const result = await exerciseActionsModule.saveExerciseAction(DATE, null, validForm(overrides));

        expect(result?.errors[field as "type"]).toBeTruthy();
        expect(result?.values).toMatchObject(overrides);
        expect(await exercisesOf(USER_A)).toEqual([]);
      });

      it("追加: フォームに種類の欄が無い(キーが無い)場合も、保存せずエラーにする", async () => {
        currentUser.id = USER_A;
        const result = await exerciseActionsModule.saveExerciseAction(DATE, null, formOf({ intensity: "normal", minutes: "30" }));
        expect(result?.errors.type).toBeTruthy();
        expect(await exercisesOf(USER_A)).toEqual([]);
      });

      it("追加: 実在しない日付と、翌日より先の日付は 404。何も保存しない", async () => {
        currentUser.id = USER_A;
        await expect(exerciseActionsModule.saveExerciseAction("2026-02-30", null, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
        await expect(exerciseActionsModule.saveExerciseAction("2999-01-01", null, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
        expect(await exercisesOf(USER_A)).toEqual([]);
      });

      it("直す: 自分の運動を変えて、その日の詳細へ移動する(日は変わらない)", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, input);
        await expect(exerciseActionsModule.updateExerciseAction(saved.id, null, validForm({ type: "strength", minutes: "50", memo: "胸" }))).rejects.toThrow(`NEXT_REDIRECT:/days/${DATE}`);

        expect((await exercisesOf(USER_A))[0]).toMatchObject({ id: saved.id, dayId: saved.dayId, type: "strength", minutes: 50, memo: "胸" });
      });

      it("直す: 開始時刻を変えられる。空にすると null", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, { ...input, startTime: "06:00" });
        await expect(exerciseActionsModule.updateExerciseAction(saved.id, null, validForm({ startTime: "18:30" }))).rejects.toThrow("NEXT_REDIRECT");
        expect((await exercisesOf(USER_A))[0].startTime).toBe("18:30");
        await expect(exerciseActionsModule.updateExerciseAction(saved.id, null, validForm({ startTime: "" }))).rejects.toThrow("NEXT_REDIRECT");
        expect((await exercisesOf(USER_A))[0].startTime).toBeNull();
      });

      it("直す: 検証に失敗したら変更せず、他のユーザーの運動・範囲外の id は 404", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, input);
        const failed = await exerciseActionsModule.updateExerciseAction(saved.id, null, validForm({ minutes: "0" }));
        expect(failed?.errors.minutes).toBeTruthy();
        expect((await exercisesOf(USER_A))[0].minutes).toBe(30);

        currentUser.id = USER_B;
        await expect(exerciseActionsModule.updateExerciseAction(saved.id, null, validForm({ minutes: "99" }))).rejects.toThrow("NEXT_NOT_FOUND");
        await expect(exerciseActionsModule.updateExerciseAction(2_147_483_648, null, validForm())).rejects.toThrow("NEXT_NOT_FOUND");
        expect((await exercisesOf(USER_A))[0].minutes).toBe(30);
      });

      it("消す: 自分の運動だけ消えて、その日の詳細へ移動する。他のユーザーのものは 404 で消えない", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, input);

        currentUser.id = USER_B;
        await expect(exerciseActionsModule.deleteExerciseAction(saved.id)).rejects.toThrow("NEXT_NOT_FOUND");
        expect(await exercisesOf(USER_A)).toHaveLength(1);

        currentUser.id = USER_A;
        await expect(exerciseActionsModule.deleteExerciseAction(saved.id)).rejects.toThrow(`NEXT_REDIRECT:/days/${DATE}`);
        expect(await exercisesOf(USER_A)).toEqual([]);
      });

      it("未ログインなら、どの Action も /login へ送られ、何も変わらない", async () => {
        currentUser.id = USER_A;
        const saved = await exercisesModule.saveExercise(DATE, input);

        currentUser.id = "";
        await expect(exerciseActionsModule.saveExerciseAction(DATE, null, validForm())).rejects.toThrow("NEXT_REDIRECT:/login");
        await expect(exerciseActionsModule.updateExerciseAction(saved.id, null, validForm({ minutes: "99" }))).rejects.toThrow("NEXT_REDIRECT:/login");
        await expect(exerciseActionsModule.deleteExerciseAction(saved.id)).rejects.toThrow("NEXT_REDIRECT:/login");
        expect(await exercisesOf(USER_A)).toHaveLength(1);
        expect((await exercisesOf(USER_A))[0].minutes).toBe(30);
      });
    });
  });

  describe("ウエストを保存した日(profiles.waist_measured_on)", () => {
    const profileOf = async (userId: string) => {
      const { eq } = await import("drizzle-orm");
      const [row] = await dbModule.db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
      return row;
    };
    const setMeasuredOn = async (userId: string, waistMeasuredOn: string | null) => {
      const { eq } = await import("drizzle-orm");
      await dbModule.db.update(schema.profiles).set({ waistMeasuredOn }).where(eq(schema.profiles.userId, userId));
    };
    const formOf = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      return formData;
    };

    it("新しいプロフィールでは null", async () => {
      currentUser.id = USER_A;
      await profilesModule.getProfile();
      expect((await profileOf(USER_A)).waistMeasuredOn).toBeNull();
    });

    it("ウエストを入れて保存すると今日になる", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ currentWaistCm: "80.5" });
      expect((await profileOf(USER_A)).waistMeasuredOn).toBe(todayString());
    });

    it("ウエストの値を変えると更新される。同じ値なら更新されない", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ currentWaistCm: "80.5" });
      await setMeasuredOn(USER_A, "2026-01-15");

      await profilesModule.updateProfile({ currentWaistCm: "80.5" }); // 同じ値
      expect((await profileOf(USER_A)).waistMeasuredOn).toBe("2026-01-15");

      await profilesModule.updateProfile({ currentWaistCm: "79.8" }); // 変えた
      expect((await profileOf(USER_A)).waistMeasuredOn).toBe(todayString());
    });

    it("ほかの項目だけを直して保存しても、ウエストを測ったことにはならない", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ currentWaistCm: "80.5" });
      await setMeasuredOn(USER_A, "2026-01-15");

      await profilesModule.updateProfile({ targetCalories: 1900 });
      expect((await profileOf(USER_A)).waistMeasuredOn).toBe("2026-01-15");
    });

    it("ウエストを空にすると null に戻る", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ currentWaistCm: "80.5" });
      await profilesModule.updateProfile({ currentWaistCm: null });
      const row = await profileOf(USER_A);
      expect(row.currentWaistCm).toBeNull();
      expect(row.waistMeasuredOn).toBeNull();
    });

    it("recordWaistMeasurement: 前と同じ値でも日付は今日になる。他の項目と、他のユーザーには触れない", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ currentWaistCm: "80.5", targetCalories: 1900 });
      await setMeasuredOn(USER_A, "2026-01-15");
      currentUser.id = USER_B;
      await profilesModule.updateProfile({ currentWaistCm: "70.0" });
      await setMeasuredOn(USER_B, "2026-01-20");

      currentUser.id = USER_A;
      await profilesModule.recordWaistMeasurement("80.5");

      expect(await profileOf(USER_A)).toMatchObject({ currentWaistCm: "80.5", targetCalories: 1900, waistMeasuredOn: todayString() });
      expect(await profileOf(USER_B)).toMatchObject({ currentWaistCm: "70.0", waistMeasuredOn: "2026-01-20" });
    });

    it("recordWaistMeasurement: プロフィールの行が無くても作って保存する。未ログインなら /login へ送る", async () => {
      currentUser.id = USER_A;
      await profilesModule.recordWaistMeasurement("81.0");
      expect(await profileOf(USER_A)).toMatchObject({ currentWaistCm: "81.0", waistMeasuredOn: todayString() });

      currentUser.id = "";
      await expect(profilesModule.recordWaistMeasurement("90.0")).rejects.toThrow("NEXT_REDIRECT:/login");
    });

    describe("recordWaistAction", () => {
      it("保存して、ダッシュボードの再描画を頼む(移動はしない)", async () => {
        currentUser.id = USER_A;
        const result = await actionsModule.recordWaistAction(null, formOf({ currentWaistCm: "80.5" }));

        expect(result).toBeNull();
        expect(await profileOf(USER_A)).toMatchObject({ currentWaistCm: "80.5", waistMeasuredOn: todayString() });
        expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(["/"]);
        expect(vi.mocked(redirect)).not.toHaveBeenCalled();
      });

      it.each([
        ["空", "", "ウエストを入力してください"],
        ["範囲外(小さすぎる)", "29.9", "ウエスト(cm)は 30 以上 250 以下の数値で入力してください"],
        ["範囲外(大きすぎる)", "250.1", "ウエスト(cm)は 30 以上 250 以下の数値で入力してください"],
        ["16 進数", "0x10", "ウエスト(cm)は 30 以上 250 以下の数値で入力してください"],
        ["指数", "1e2", "ウエスト(cm)は 30 以上 250 以下の数値で入力してください"],
        ["文字", "abc", "ウエスト(cm)は 30 以上 250 以下の数値で入力してください"],
      ])("検証に失敗したら、保存せず、エラーと入れた値を返す: %s", async (_label, value, message) => {
        currentUser.id = USER_A;
        await profilesModule.updateProfile({ currentWaistCm: "80.5" });
        await setMeasuredOn(USER_A, "2026-01-15");
        vi.mocked(revalidatePath).mockClear();

        const result = await actionsModule.recordWaistAction(null, formOf({ currentWaistCm: value }));
        expect(result?.error).toBe(message);
        expect(result?.value).toBe(value);
        expect(await profileOf(USER_A)).toMatchObject({ currentWaistCm: "80.5", waistMeasuredOn: "2026-01-15" });
        expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      });

      it("キーが無い(送られてこない)ときも、保存せずエラーにする。余計なキーは無視する", async () => {
        currentUser.id = USER_A;
        const missing = await actionsModule.recordWaistAction(null, formOf({}));
        expect(missing?.error).toBe("ウエストを入力してください");

        await actionsModule.recordWaistAction(null, formOf({ currentWaistCm: "80.5", userId: USER_B, targetCalories: "9999", waistMeasuredOn: "1999-01-01" }));
        expect(await profileOf(USER_A)).toMatchObject({ currentWaistCm: "80.5", targetCalories: null, waistMeasuredOn: todayString() });
      });

      it("未ログインなら /login へ送られ、何も変わらない", async () => {
        currentUser.id = USER_A;
        await profilesModule.updateProfile({ currentWaistCm: "80.5" });
        await setMeasuredOn(USER_A, "2026-01-15");

        currentUser.id = "";
        await expect(actionsModule.recordWaistAction(null, formOf({ currentWaistCm: "99.0" }))).rejects.toThrow("NEXT_REDIRECT:/login");
        expect(await profileOf(USER_A)).toMatchObject({ currentWaistCm: "80.5", waistMeasuredOn: "2026-01-15" });
      });
    });
  });

  describe("ポジティブ3行日記(lib/positive-entries.ts と positive/actions.ts)", () => {
    const DATE = "2026-05-12";
    const formOf = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      return formData;
    };
    const entriesOf = async (userId: string) => {
      const { asc, eq } = await import("drizzle-orm");
      return dbModule.db.select().from(schema.positiveEntries).where(eq(schema.positiveEntries.userId, userId)).orderBy(asc(schema.positiveEntries.position));
    };
    const insertEntry = (dayId: number, overrides: Record<string, unknown> = {}, userId = USER_A) =>
      dbModule.db.insert(schema.positiveEntries).values({ userId, dayId, position: 1, body: "良かった", ...overrides });
    const makeDay = async (date = DATE, userId = USER_A) => {
      currentUser.id = userId;
      return daysModule.saveDay(date, {});
    };

    describe("DB の制約", () => {
      it("positive_entries_position_range: 位置は 1〜3 だけ通る", async () => {
        const day = await makeDay();
        for (const position of [1, 2, 3]) await expect(insertEntry(day.id, { position })).resolves.toBeDefined();
        for (const position of [0, 4, -1]) await expectViolation(insertEntry(day.id, { position }), "positive_entries_position_range", String(position));
      });

      it("同じ日の同じ位置には 2 件入らない。別の日なら同じ位置でよい", async () => {
        const day = await makeDay();
        const other = await makeDay("2026-05-13");
        await insertEntry(day.id, { position: 1 });
        await expectViolation(insertEntry(day.id, { position: 1 }), "positive_entries_day_position_unique", "同じ日の同じ位置");
        await expect(insertEntry(other.id, { position: 1 })).resolves.toBeDefined();
      });

      it("本文は 200 文字まで", async () => {
        const day = await makeDay();
        await expect(insertEntry(day.id, { position: 1, body: "あ".repeat(200) })).resolves.toBeDefined();
        await expect(insertEntry(day.id, { position: 2, body: "あ".repeat(201) })).rejects.toThrow();
      });

      it("他のユーザーの日には紐づけられない(複合外部キー)", async () => {
        const dayOfB = await makeDay(DATE, USER_B);
        await expectViolation(insertEntry(dayOfB.id, {}, USER_A), "positive_entries_user_day_fk", "A の記録を B の日に");
      });

      it("日を消すと、その日の良かったことも消える", async () => {
        const day = await makeDay();
        await insertEntry(day.id);
        const { eq } = await import("drizzle-orm");
        await dbModule.db.delete(schema.days).where(eq(schema.days.id, day.id));
        expect(await entriesOf(USER_A)).toEqual([]);
      });
    });

    describe("lib/positive-entries.ts", () => {
      it("保存すると、その日の行が無ければ作られ、一覧には書いた順に出る", async () => {
        currentUser.id = USER_A;
        expect(await daysModule.getDay(DATE)).toBeNull();
        await positiveModule.savePositiveEntries(DATE, ["天気が良かった。気分が晴れた", "みそ汁がおいしかった"]);

        expect(await daysModule.getDay(DATE)).not.toBeNull();
        const list = await positiveModule.listPositiveEntriesOfDay(DATE);
        expect(list.map((e) => [e.position, e.body])).toEqual([
          [1, "天気が良かった。気分が晴れた"],
          [2, "みそ汁がおいしかった"],
        ]);
        expect(list[0].userId).toBe(USER_A);
      });

      it("もう一度保存すると、その日の分がまとめて入れ替わる(減らせるし、空にもできる)", async () => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, ["a", "b", "c"]);
        await positiveModule.savePositiveEntries(DATE, ["c2", "a2"]);
        expect((await entriesOf(USER_A)).map((e) => [e.position, e.body])).toEqual([
          [1, "c2"],
          [2, "a2"],
        ]);

        await positiveModule.savePositiveEntries(DATE, []);
        expect(await entriesOf(USER_A)).toEqual([]);
        expect(await daysModule.getDay(DATE)).not.toBeNull(); // 日の行は残す(体重などの記録があるかもしれない)
      });

      it("空で保存するだけなら、日の行を作らない", async () => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, []);
        expect(await daysModule.getDay(DATE)).toBeNull();
      });

      it("同じ日の別の記録(体重・睡眠・食事)には触らない", async () => {
        currentUser.id = USER_A;
        await daysModule.saveDay(DATE, { morningWeightKg: "60.00", reflection: "残る" });
        await positiveModule.savePositiveEntries(DATE, ["a"]);
        await positiveModule.savePositiveEntries(DATE, []);
        expect(await daysModule.getDay(DATE)).toMatchObject({ morningWeightKg: "60.00", reflection: "残る" });
      });

      it("他のユーザーの記録は、一覧に出ず、保存しても入れ替わらない", async () => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, ["Aの"]);

        currentUser.id = USER_B;
        expect(await positiveModule.listPositiveEntriesOfDay(DATE)).toEqual([]);
        await positiveModule.savePositiveEntries(DATE, ["Bの"]);
        await positiveModule.savePositiveEntries(DATE, []);

        expect((await entriesOf(USER_A)).map((e) => e.body)).toEqual(["Aの"]);
        expect(await entriesOf(USER_B)).toEqual([]);
      });

      it("3 件を超えると投げて、何も変えない", async () => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, ["残る"]);
        await expect(positiveModule.savePositiveEntries(DATE, ["1", "2", "3", "4"])).rejects.toThrow("too many entries");
        expect((await entriesOf(USER_A)).map((e) => e.body)).toEqual(["残る"]);
      });

      it("同時に 12 回保存しても、エラーにならず、最後は 1 回分の中身がそのまま残る(位置が重ならない)", async () => {
        currentUser.id = USER_A;
        await daysModule.saveDay(DATE, {});
        const sets = Array.from({ length: 12 }, (_, index) => [`s${index}-a`, `s${index}-b`, `s${index}-c`]);
        await Promise.all(sets.map((set) => positiveModule.savePositiveEntries(DATE, set)));

        const bodies = (await entriesOf(USER_A)).map((e) => e.body);
        expect(bodies).toHaveLength(3);
        expect(sets).toContainEqual(bodies);
      });

      it("その日の行がまだ無い状態で、同時に 12 回保存しても、エラーにならず、日の行は 1 つだけできる", async () => {
        currentUser.id = USER_A;
        expect(await daysModule.getDay(DATE)).toBeNull();
        const sets = Array.from({ length: 12 }, (_, index) => [`s${index}-a`, `s${index}-b`]);
        await Promise.all(sets.map((set) => positiveModule.savePositiveEntries(DATE, set)));

        const { eq } = await import("drizzle-orm");
        expect(await dbModule.db.select().from(schema.days).where(eq(schema.days.userId, USER_A))).toHaveLength(1);
        const bodies = (await entriesOf(USER_A)).map((e) => e.body);
        expect(sets).toContainEqual(bodies);
      });

      it("日付が不正なら投げる。未ログインなら /login へ送る", async () => {
        currentUser.id = USER_A;
        await expect(positiveModule.savePositiveEntries("2026-02-30", ["a"])).rejects.toThrow("invalid date");
        await expect(positiveModule.listPositiveEntriesOfDay("abc")).rejects.toThrow("invalid date");
        currentUser.id = "";
        await expect(positiveModule.listPositiveEntriesOfDay(DATE)).rejects.toThrow("NEXT_REDIRECT:/login");
        await expect(positiveModule.savePositiveEntries(DATE, ["a"])).rejects.toThrow("NEXT_REDIRECT:/login");
      });
    });

    describe("Server Action", () => {
      beforeEach(readyProfiles);
      it("保存して、その日の詳細へ移動し、再描画を頼む。空の組はつめる", async () => {
        currentUser.id = USER_A;
        const form = formOf({ body1: "", body2: "散歩した。風が気持ちよかった", body3: "早く寝た" });
        await expect(positiveActionsModule.savePositiveAction(DATE, null, form)).rejects.toThrow(`NEXT_REDIRECT:/days/${DATE}`);

        expect((await entriesOf(USER_A)).map((e) => [e.position, e.body])).toEqual([
          [1, "散歩した。風が気持ちよかった"],
          [2, "早く寝た"],
        ]);
        expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(["/", `/days/${DATE}`]);
      });

      it("すべて空欄で保存すると、その日の分が消える", async () => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, ["a"]);
        await expect(positiveActionsModule.savePositiveAction(DATE, null, formOf({ body1: "", body2: "", body3: "" }))).rejects.toThrow("NEXT_REDIRECT");
        expect(await entriesOf(USER_A)).toEqual([]);
      });

      it("フォームに user_id や position を紛れ込ませても無視される", async () => {
        currentUser.id = USER_A;
        const form = formOf({ body1: "a", userId: USER_B, user_id: USER_B, dayId: "999", position: "3" });
        await expect(positiveActionsModule.savePositiveAction(DATE, null, form)).rejects.toThrow("NEXT_REDIRECT");
        expect(await entriesOf(USER_B)).toEqual([]);
        expect((await entriesOf(USER_A)).map((e) => [e.position, e.body])).toEqual([[1, "a"]]);
      });

      it.each([
        ["1 つ目が長すぎる", { body1: "あ".repeat(201) }, "body1"],
        ["3 つ目が長すぎる", { body1: "a", body3: "い".repeat(201) }, "body3"],
      ])("検証に失敗したら、保存せず(元の記録も消さず)、欄ごとのエラーと入力した値を返す: %s", async (_label, fields, field) => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, ["元の記録"]);
        const result = await positiveActionsModule.savePositiveAction(DATE, null, formOf(fields));

        expect(result?.errors[field as "body1"]).toBeTruthy();
        expect(result?.values).toMatchObject(fields);
        expect((await entriesOf(USER_A)).map((e) => e.body)).toEqual(["元の記録"]);
        expect(vi.mocked(redirect)).not.toHaveBeenCalled();
      });

      it("実在しない日付と、翌日より先の日付は 404。何も保存しない", async () => {
        currentUser.id = USER_A;
        await expect(positiveActionsModule.savePositiveAction("2026-02-30", null, formOf({ body1: "a" }))).rejects.toThrow("NEXT_NOT_FOUND");
        await expect(positiveActionsModule.savePositiveAction("2999-01-01", null, formOf({ body1: "a" }))).rejects.toThrow("NEXT_NOT_FOUND");
        expect(await entriesOf(USER_A)).toEqual([]);
      });

      it("未ログインなら /login へ送られ、何も変わらない", async () => {
        currentUser.id = USER_A;
        await positiveModule.savePositiveEntries(DATE, ["残る"]);

        currentUser.id = "";
        await expect(positiveActionsModule.savePositiveAction(DATE, null, formOf({ body1: "上書き" }))).rejects.toThrow("NEXT_REDIRECT:/login");
        expect((await entriesOf(USER_A)).map((e) => e.body)).toEqual(["残る"]);
      });
    });
  });

  describe("プロフィール未設定のとき(目標カロリーか活動係数が空)は、記録の保存がプロフィールの編集へ送る", () => {
    const form = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.set(name, value);
      return formData;
    };
    const DATE = "2026-10-30";
    const actions = () => [
      () => dayActionsModule.saveDayAction(DATE, null, form({ morningWeightKg: "70" })),
      () => reflectionActionsModule.saveReflectionAction(DATE, null, form({ reflection: "気づき" })),
      () => positiveActionsModule.savePositiveAction(DATE, null, form({ body1: "良かった" })),
      () => exerciseActionsModule.saveExerciseAction(DATE, null, form({ type: "walk", intensity: "normal", minutes: "30" })),
      () => mealActionsModule.saveMealAction(DATE, {}),
    ];

    it("プロフィールの行が無いときも、どの保存も /profile/edit へ送られ、日の行は作られない", async () => {
      currentUser.id = USER_A;
      for (const attempt of actions()) await expect(attempt()).rejects.toThrow("NEXT_REDIRECT:/profile/edit"); // 順に呼ぶ(先に作ると、await 前の reject が未処理になる)
      expect(await dbModule.db.select().from(schema.days)).toEqual([]);
    });

    it("目標カロリーだけ、または活動係数だけでも、送られる", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1800 });
      await expect(dayActionsModule.saveDayAction(DATE, null, form({ morningWeightKg: "70" }))).rejects.toThrow("NEXT_REDIRECT:/profile/edit");
      await profilesModule.updateProfile({ targetCalories: null, activityLevel: "1.375" });
      await expect(dayActionsModule.saveDayAction(DATE, null, form({ morningWeightKg: "70" }))).rejects.toThrow("NEXT_REDIRECT:/profile/edit");
      expect(await dbModule.db.select().from(schema.days)).toEqual([]);
    });

    it("日の行がすでにある日は、未設定でも塞がない(新しく作らないので、編集や追加はできる)", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay(DATE, { morningWeightKg: "70.00" }); // 未設定のまま、保存関数で行を作っておく(別経路・旧データを想定)
      await expect(dayActionsModule.saveDayAction(DATE, null, form({ morningWeightKg: "69" }))).rejects.toThrow(`NEXT_REDIRECT:/days/${DATE}`);
      expect((await daysModule.getDay(DATE))?.morningWeightKg).toBe("69.00");
      // 別の日(行が無い)は、塞がれる
      await expect(dayActionsModule.saveDayAction("2026-10-31", null, form({ morningWeightKg: "70" }))).rejects.toThrow("NEXT_REDIRECT:/profile/edit");
    });

    it("requireRecordingProfile: 未設定で行が無ければ /profile/edit へ。設定済み、または行があれば通る", async () => {
      const { requireRecordingProfile } = await import("./recording-gate");
      currentUser.id = USER_A;
      await expect(requireRecordingProfile(DATE)).rejects.toThrow("NEXT_REDIRECT:/profile/edit");
      await profilesModule.updateProfile({ targetCalories: 1800, activityLevel: "1.375" });
      await expect(requireRecordingProfile(DATE)).resolves.toBeUndefined();
      await profilesModule.updateProfile({ targetCalories: null });
      await expect(requireRecordingProfile(DATE)).rejects.toThrow("NEXT_REDIRECT:/profile/edit");
      await daysModule.saveDay(DATE, {});
      await expect(requireRecordingProfile(DATE)).resolves.toBeUndefined();
    });

    it("不正な日付は、未設定でも 404 になる(ゲートより先に日付を確かめる)", async () => {
      currentUser.id = USER_A;
      await expect(dayActionsModule.saveDayAction("2026-02-30", null, form({ morningWeightKg: "70" }))).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("両方そろえれば保存できる", async () => {
      currentUser.id = USER_A;
      await profilesModule.updateProfile({ targetCalories: 1800, activityLevel: "1.375" });
      await expect(dayActionsModule.saveDayAction(DATE, null, form({ morningWeightKg: "70" }))).rejects.toThrow(`NEXT_REDIRECT:/days/${DATE}`);
      expect(await dbModule.db.select().from(schema.days)).toHaveLength(1);
    });
  });

  describe("saveDayAction", () => {
    beforeEach(readyProfiles);
    const DATE = "2026-10-30";
    const formOf = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.set(name, value);
      return formData;
    };
    const expectRedirectTo = (promise: Promise<unknown>, url: string) =>
      expect(promise).rejects.toThrow(`NEXT_REDIRECT:${url}`);

    it("正しい値を送ると保存され、画面の再取得を依頼して、その日の詳細へ移動する", async () => {
      currentUser.id = USER_A;
      await expectRedirectTo(
        dayActionsModule.saveDayAction(
          DATE,
          null,
          formOf({ morningWeightKg: "98.3", morningBodyFatPercent: "32", reflection: "良い一日だった" }),
        ),
        `/days/${DATE}`,
      );

      expect(await daysModule.getDay(DATE)).toMatchObject({
        morningWeightKg: "98.30",
        morningBodyFatPercent: "32.0",
        reflection: "良い一日だった",
      });
      expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(["/", `/days/${DATE}`]);
    });

    it("検証に失敗すると、エラーと入力値を返し、何も保存せず、移動もしない", async () => {
      currentUser.id = USER_A;
      const state = await dayActionsModule.saveDayAction(
        DATE,
        null,
        formOf({ morningWeightKg: "abc", morningBodyFatPercent: "200", reflection: "残す文章" }),
      );

      expect(state?.errors.morningWeightKg).toBeDefined();
      expect(state?.errors.morningBodyFatPercent).toBeDefined();
      expect(state?.values).toMatchObject({ morningWeightKg: "abc", reflection: "残す文章" }); // フォームに残す値
      expect(await daysModule.getDay(DATE)).toBeNull(); // 何も保存していない(日も作られない)
      expect(vi.mocked(redirect)).not.toHaveBeenCalled();
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
    });

    it("フォームに無かった項目は変更しない(空欄で送った項目は空にする)", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay(DATE, { morningWeightKg: "70.00", reflection: "書いた日記" });

      await expectRedirectTo(
        dayActionsModule.saveDayAction(DATE, null, formOf({ morningWeightKg: "69.5", morningBodyFatPercent: "" })),
        `/days/${DATE}`,
      );

      const day = await daysModule.getDay(DATE);
      expect(day?.morningWeightKg).toBe("69.50");
      expect(day?.reflection).toBe("書いた日記"); // 送られなかったので変わらない
      expect(day?.morningBodyFatPercent).toBeNull(); // 空欄で送ったので空
    });

    it("同じ日を二重に作らず、2 回目は更新になる", async () => {
      currentUser.id = USER_A;
      for (const weight of ["70", "69"]) {
        await expectRedirectTo(dayActionsModule.saveDayAction(DATE, null, formOf({ morningWeightKg: weight })), `/days/${DATE}`);
      }
      expect(await listAllDays()).toHaveLength(1);
      expect((await daysModule.getDay(DATE))?.morningWeightKg).toBe("69.00");
    });

    it("user_id や日付などの余計な項目は無視し、ログイン中のユーザーのその日だけを書く", async () => {
      currentUser.id = USER_A;
      await expectRedirectTo(
        dayActionsModule.saveDayAction(
          DATE,
          null,
          formOf({ reflection: "A の日記", userId: USER_B, user_id: USER_B, date: "2000-01-01", id: "999" }),
        ),
        `/days/${DATE}`,
      );

      expect((await daysModule.getDay(DATE))?.reflection).toBe("A の日記");
      expect(await daysModule.getDay("2000-01-01")).toBeNull();
      currentUser.id = USER_B;
      expect(await listAllDays()).toEqual([]);
    });

    it("不正な日付と、翌日より先の日付は 404 にして、何も保存しない", async () => {
      currentUser.id = USER_A;
      for (const bad of ["2026-02-30", "abc", "0000-01-01", "2100-12-31"]) {
        await expect(dayActionsModule.saveDayAction(bad, null, formOf({ reflection: "x" }))).rejects.toThrow("NEXT_NOT_FOUND");
      }
      expect(await listAllDays()).toEqual([]);
    });

    it("未ログインなら /login へ送られ、検証にも保存にも進まない(不正な入力でも、先に認証で止まる)", async () => {
      currentUser.id = "";
      await expect(dayActionsModule.saveDayAction(DATE, null, formOf({ reflection: "x" }))).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(dayActionsModule.saveDayAction(DATE, null, formOf({ morningWeightKg: "abc" }))).rejects.toThrow(
        "NEXT_REDIRECT:/login",
      );

      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      currentUser.id = USER_A;
      expect(await daysModule.getDay(DATE)).toBeNull();
    });
  });

  describe("saveReflectionAction", () => {
    beforeEach(readyProfiles);
    const DATE = "2026-10-30";
    const formOf = (fields: Record<string, string>) => {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields)) formData.set(name, value);
      return formData;
    };
    const expectRedirectTo = (promise: Promise<unknown>, url: string) =>
      expect(promise).rejects.toThrow(`NEXT_REDIRECT:${url}`);

    it("振り返りだけを保存し、朝の項目(体重・睡眠)は変えない", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay(DATE, { morningWeightKg: "70.00", sleepBedtime: "23:30", sleepWakeTime: "06:00" });

      await expectRedirectTo(reflectionActionsModule.saveReflectionAction(DATE, null, formOf({ reflection: "夜" })), `/days/${DATE}`);

      expect(await daysModule.getDay(DATE)).toMatchObject({
        morningWeightKg: "70.00",
        sleepBedtime: "23:30",
        sleepWakeTime: "06:00",
        reflection: "夜",
      });
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/");
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(`/days/${DATE}`);
    });

    it("記録が無い日でも、日の行を作って保存する", async () => {
      currentUser.id = USER_A;
      await expectRedirectTo(reflectionActionsModule.saveReflectionAction(DATE, null, formOf({ reflection: "夜" })), `/days/${DATE}`);
      expect((await daysModule.getDay(DATE))?.reflection).toBe("夜");
    });

    it("空で保存すると振り返りが消える(朝の項目は残る)", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay(DATE, { morningWeightKg: "70.00", reflection: "書いた" });
      await expectRedirectTo(reflectionActionsModule.saveReflectionAction(DATE, null, formOf({ reflection: "  " })), `/days/${DATE}`);
      expect(await daysModule.getDay(DATE)).toMatchObject({ morningWeightKg: "70.00", reflection: null });
    });

    it("長すぎるとエラーを返し、何も保存せず、移動も再取得もしない", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay(DATE, { reflection: "元の文章" });
      vi.mocked(revalidatePath).mockClear();

      const state = await reflectionActionsModule.saveReflectionAction(DATE, null, formOf({ reflection: "あ".repeat(2001) }));

      expect(state?.errors.reflection).toBeTruthy();
      expect((await daysModule.getDay(DATE))?.reflection).toBe("元の文章");
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
    });

    it("不正な日付と、翌日より先の日付は 404 にして、何も保存しない", async () => {
      currentUser.id = USER_A;
      for (const bad of ["2026-02-30", "abc", "0000-01-01", "2100-12-31"]) {
        await expect(reflectionActionsModule.saveReflectionAction(bad, null, formOf({ reflection: "x" }))).rejects.toThrow("NEXT_NOT_FOUND");
      }
      expect(await listAllDays()).toEqual([]);
    });

    it("未ログインなら /login へ送られ、何も保存しない", async () => {
      currentUser.id = "";
      await expect(reflectionActionsModule.saveReflectionAction(DATE, null, formOf({ reflection: "x" }))).rejects.toThrow(
        "NEXT_REDIRECT:/login",
      );
      expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled();
      currentUser.id = USER_A;
      expect(await daysModule.getDay(DATE)).toBeNull();
    });

    it("他のユーザーの同じ日には書き込まない", async () => {
      currentUser.id = USER_B;
      await daysModule.saveDay(DATE, { reflection: "Bの文章" });
      currentUser.id = USER_A;
      await expectRedirectTo(reflectionActionsModule.saveReflectionAction(DATE, null, formOf({ reflection: "Aの文章" })), `/days/${DATE}`);
      expect((await daysModule.getDay(DATE))?.reflection).toBe("Aの文章");
      currentUser.id = USER_B;
      expect((await daysModule.getDay(DATE))?.reflection).toBe("Bの文章");
    });
  });
});
