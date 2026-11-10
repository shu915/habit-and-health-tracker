import { isEmailAllowed } from "@/lib/allowlist";

// セッション(ログイン)を作るとき、許可リスト(ALLOWED_EMAILS)の中の人にだけ作る。マジックリンクも、Google も、将来足すプロバイダーも、どの経路でも、同じ確認を通る。
// 理由: これまで、許可リストの確認は、ユーザーを作るとき(user.create.before)と、メールを送る前(sendMagicLink)の 2 か所だった。
// Google でのログインは、すでにいるユーザーとして入る(ユーザーを作らず、メールも送らない)ので、どちらも通らず、
// 許可リストから外した人が、連結済みの Google から、入り直せてしまった(2026-11-10 のレビュー)。許可リストから外すことは、アクセスを止める手段なので、セッションを作る入口で止める。
// 判定の対象は、アカウントのメールアドレス(user.email)。連結した Google のアドレスは見ない(今の許可リストの意味と同じ)。
// すでにあるセッションは、このフックでは消えない(外した人のセッションは、別に消す。CLAUDE.md の手順)

type UserFinder = { context: { internalAdapter: { findUserById: (id: string) => Promise<{ email: string } | null> } } } | null;

export const sessionAllowlistHooks = {
  create: {
    before: async (session: { userId: string }, context: UserFinder): Promise<boolean> => {
      const user = await context?.context.internalAdapter.findUserById(session.userId);
      return user !== null && user !== undefined && isEmailAllowed(user.email);
    },
  },
};
