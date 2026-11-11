"use client";

import { useState } from "react";
import { LinkGoogleButton } from "@/components/link-google-button";
import { UnlinkGoogleButton } from "@/components/unlink-google-button";

// ログイン方法の Google の行の、右側(操作のボタン 1 つ)と、失敗の文。状態のラベルは、名前の横(左。account-view.tsx)に置き、ボタンとは別の場所・別の形にする。
// 親(account-view.tsx の li)は、2 列のグリッドで、この部品は、「ボタン」と「失敗の文」の 2 つを返す。失敗の文は、グリッドの全幅(col-span-full)で、行の下に出す
// (ボタンの下に入れると、右側の幅が広がって、左の文と並びきれず、行全体が縦に並んでいた)。失敗は重要な知らせなので赤
export function GoogleLinkControls({ accountId }: { accountId: string | null }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="flex items-center">{accountId !== null ? <UnlinkGoogleButton accountId={accountId} onError={setError} /> : <LinkGoogleButton onError={setError} />}</div>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
