import { IMAGE_MAX_LENGTH } from "@/lib/meal-limits";

// 食事の写真を、ブラウザ側で縮小して JPEG の data URL にする(ブラウザ専用)。
// 大きい写真でも、通り、速く、安くなる(AI に送る量が減る)。縮小して描き直すので、位置情報などの EXIF は含まれない。
// 向きは、読み込むときに EXIF の向きに合わせる(createImageBitmap の imageOrientation)。
const MAX_EDGES = [1600, 1200, 800]; // 長辺の候補(大きい順)。上限に収まらなければ、次の小さい大きさで試す
const QUALITIES = [0.82, 0.7, 0.55];

// 長辺が maxEdge に収まるよう、縦横比を保って縮める(小さい画像は拡大しない)
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// 大きい長辺・高い画質から順に試して、文字数の上限に収まる最初の結果を返す。どれも収まらなければ null
export function encodeWithinLimit(encode: (maxEdge: number, quality: number) => string, limit: number = IMAGE_MAX_LENGTH): string | null {
  for (const edge of MAX_EDGES) {
    for (const quality of QUALITIES) {
      const dataUrl = encode(edge, quality);
      if (dataUrl.length <= limit) return dataUrl;
    }
  }
  return null;
}

export type ResizeResult = { ok: true; dataUrl: string } | { ok: false; message: string };

export const UNREADABLE_IMAGE_MESSAGE =
  "この写真を読み込めませんでした。JPEG・PNG・WebP の写真を選んでください(iPhone の写真は、設定のカメラで「互換性優先」にすると JPEG になります)。";

export async function resizeImageToDataUrl(file: File): Promise<ResizeResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, message: UNREADABLE_IMAGE_MESSAGE }; // 形式を読めないブラウザ・壊れたファイル
  }

  try {
    const dataUrl = encodeWithinLimit((maxEdge, quality) => {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas を使えません");
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", quality);
    });
    return dataUrl ? { ok: true, dataUrl } : { ok: false, message: "写真が大きすぎて、縮小しても送れませんでした。別の写真を選んでください。" };
  } catch {
    return { ok: false, message: UNREADABLE_IMAGE_MESSAGE };
  } finally {
    bitmap.close();
  }
}
