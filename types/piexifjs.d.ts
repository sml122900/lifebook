// piexifjs 무타입 → 최소 shim. JPEG EXIF read/dump/insert + GPS strip 용도만.
declare module "piexifjs" {
  type ExifDict = {
    "0th"?: Record<number, unknown>;
    Exif?: Record<number, unknown>;
    GPS?: Record<number, unknown>;
    Interop?: Record<number, unknown>;
    "1st"?: Record<number, unknown>;
    thumbnail?: unknown;
  };
  const piexif: {
    load(jpegData: string): ExifDict;
    dump(exifDict: ExifDict): string;
    insert(exifBytes: string, jpegData: string): string;
    remove(jpegData: string): string;
  };
  export default piexif;
}
