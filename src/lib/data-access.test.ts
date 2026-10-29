import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/current-user", () => ({
  getCurrentUserId: async () => currentUser.id,
}));

const USER_A = "test-user-a";
const USER_B = "test-user-b";

describe.runIf(testDatabaseUrl)("データ操作(実 DB)", () => {
  let dbModule: typeof import("@/db");
  let schema: typeof import("@/db/schema");
  let daysModule: typeof import("@/lib/days");
  let profilesModule: typeof import("@/lib/profiles");

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
  });

  beforeEach(async () => {
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
});
