// Phase Photo 6 (1단계 — 날짜 코어) — 클라 전용 EXIF 유틸.
//
// 브라우저 File 에서 촬영 날짜를 읽어 폼 year/month 를 prefill 하고,
// 업로드 전에 GPS 위치정보를 무손실 제거(JPEG)한다.
//
// 번들: exifr/piexifjs 는 함수 안에서 await import — 이 모듈을 import 하는
// 컴포넌트의 초기 번들에 안 박힌다(사진 폼 진입 후 첫 파일 선택 시 로드).

export type DateSource = "exif" | "file" | "none";

export type ExtractedDate = {
  year: number | null;
  month: number | null; // 1~12
  takenAt: Date | null;
  source: DateSource;
};

// DateTimeOriginal ?? CreateDate ?? file.lastModified ?? null.
// 카톡/스크린샷 등 EXIF 없는 사진은 "file"(추정) 또는 "none"(수동).
export async function extractPhotoDate(file: File): Promise<ExtractedDate> {
  let dt: Date | null = null;
  try {
    const exifr = (await import("exifr")).default;
    const parsed = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate"],
    });
    const cand = parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? null;
    if (cand instanceof Date && !Number.isNaN(cand.getTime())) dt = cand;
  } catch {
    // EXIF 없거나 파싱 실패 → 폴백
  }
  if (dt) {
    return {
      year: dt.getFullYear(),
      month: dt.getMonth() + 1,
      takenAt: dt,
      source: "exif",
    };
  }
  if (file.lastModified) {
    const d = new Date(file.lastModified);
    if (!Number.isNaN(d.getTime())) {
      return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        takenAt: d,
        source: "file",
      };
    }
  }
  return { year: null, month: null, takenAt: null, source: "none" };
}

// GPS 위치정보 제거 — JPEG 만, 무손실(재인코딩 X). GPS IFD 만 비우고 나머지
// (촬영시각·orientation) 보존. GPS 없으면 원본 그대로. 실패 시 원본 반환하되
// hadGps 로 알린다(호출자가 누수 위험 판단).
//
// 🚨 프라이버시: GPS 가 기기를 떠나지 않게 업로드 *전* 클라에서 제거.
export type StripGpsResult = { file: File; hadGps: boolean; stripped: boolean };

export async function stripGps(file: File): Promise<StripGpsResult> {
  if (file.type !== "image/jpeg") {
    return { file, hadGps: false, stripped: false };
  }
  try {
    const piexif = (await import("piexifjs")).default;
    const dataUrl = await fileToDataUrl(file);
    const exifObj = piexif.load(dataUrl);
    const hadGps = !!exifObj.GPS && Object.keys(exifObj.GPS).length > 0;
    if (!hadGps) return { file, hadGps: false, stripped: false };

    exifObj.GPS = {};
    const newExifBytes = piexif.dump(exifObj);
    const newDataUrl = piexif.insert(newExifBytes, dataUrl);
    const blob = dataUrlToBlob(newDataUrl);
    const out = new File([blob], file.name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return { file: out, hadGps: true, stripped: true };
  } catch {
    // 제거 실패 — 원본에 GPS 가 남아있을 수 있음. 호출자가 차단/경고 결정.
    return { file, hadGps: true, stripped: false };
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
