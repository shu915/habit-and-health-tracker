// テスト用: 画面の並び(DOM の順)を確かめる道具。アプリのコードからは使わない

// a が b より前(画面で左・上)に並んでいるか
export function isBefore(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

// el が、親の中で最後(画面で右端)か / 最初(左端)か
export const isLastChild = (el: Element) => el.parentElement?.lastElementChild === el;
export const isFirstChild = (el: Element) => el.parentElement?.firstElementChild === el;
