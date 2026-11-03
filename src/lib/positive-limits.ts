// ポジティブ3行日記(良かったこと)の上限。列の長さ(schema.ts の positive_entries)と同じ。
// 1 日に書ける件数は、DB の CHECK(position 1〜3)と合わせる

export const POSITIVE_MAX_PER_DAY = 3;

// 本文(できごとと、それで感じたこと)の文字数の上限
export const POSITIVE_BODY_MAX_LENGTH = 200;
