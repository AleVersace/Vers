// Existing installations can retain their bucket and all uploaded files.
// Fresh installations use the bucket created by the versioned schema.
export const ASSET_BUCKET =
  process.env.NEXT_PUBLIC_ASSET_BUCKET?.trim() || "vers-assets";
