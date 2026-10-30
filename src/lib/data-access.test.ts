import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_LIMITS, type DayLimitedField } from "./day-limits";
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
  let profilesModule: typeof import("@/lib/profiles");
  let actionsModule: typeof import("@/app/(app)/profile/actions");
  let dayActionsModule: typeof import("@/app/(app)/days/[date]/edit/actions");

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
    profilesModule = await import("@/lib/profiles");
    actionsModule = await import("@/app/(app)/profile/actions");
    dayActionsModule = await import("@/app/(app)/days/[date]/edit/actions");
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
      expect(await daysModule.listDays()).toEqual([]);
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
      expect(await daysModule.listDays()).toHaveLength(1);
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
      expect(await daysModule.listDays()).toEqual([]);
    });

    it("日付は新しい順に並ぶ", async () => {
      currentUser.id = USER_A;
      await daysModule.saveDay("2026-10-27", {});
      await daysModule.saveDay("2026-10-29", {});
      await daysModule.saveDay("2026-10-28", {});

      expect((await daysModule.listDays()).map((d) => d.date)).toEqual([
        "2026-10-29",
        "2026-10-28",
        "2026-10-27",
      ]);
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

  describe("saveDayAction", () => {
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
      expect(await daysModule.listDays()).toHaveLength(1);
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
      expect(await daysModule.listDays()).toEqual([]);
    });

    it("不正な日付と、翌日より先の日付は 404 にして、何も保存しない", async () => {
      currentUser.id = USER_A;
      for (const bad of ["2026-02-30", "abc", "0000-01-01", "2100-12-31"]) {
        await expect(dayActionsModule.saveDayAction(bad, null, formOf({ reflection: "x" }))).rejects.toThrow("NEXT_NOT_FOUND");
      }
      expect(await daysModule.listDays()).toEqual([]);
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
});
